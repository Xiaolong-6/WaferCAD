// Diagnostic-only projection of *sampled*, instanced buried smooth sidewalls.
// It never authorizes culling or changes the mesh pipeline. Camera projection,
// including the current Section Z display transform, is supplied by the caller.
const finite2 = (point) =>
  Array.isArray(point) &&
  point.length >= 2 &&
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]);

function sampleIndices(size, limit) {
  if (!Number.isInteger(size) || size <= 0 || limit <= 0) return [];
  const count = Math.min(size, Math.floor(limit));
  if (count === 1) return [Math.floor((size - 1) / 2)];
  return Array.from(
    { length: count },
    (_, index) => Math.floor((index * (size - 1)) / (count - 1)),
  );
}

function projectionArea(quad, project, widthPx, heightPx) {
  const pixels = quad.map((point) => project(point));
  if (!pixels.every(finite2)) return null;
  const xs = pixels.map((point) => point[0]);
  const ys = pixels.map((point) => point[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  return {
    width: xMax - xMin,
    height: yMax - yMin,
    offscreen: pixels.every((point) => point[0] < 0) ||
      pixels.every((point) => point[0] > widthPx) ||
      pixels.every((point) => point[1] < 0) ||
      pixels.every((point) => point[1] > heightPx),
  };
}

export function sampleBuriedInterfaceProjection(
  sidewalls,
  {
    project,
    mapZ = (z) => z,
    displayZScale = 1,
    viewportWidth = 0,
    viewportHeight = 0,
    visibleIntervals = (z0, z1) => [[z0, z1]],
    maxOwners = 32,
    maxPartsPerOwner = 8,
    maxInstancesPerOwner = 5,
  } = {},
) {
  const result = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-projector',
    eligibleForReduction: false,
    analyzedOwners: 0,
    sampledQuads: 0,
    projectedQuads: 0,
    offscreenQuads: 0,
    subpixelQuads: 0,
    collapsedOrInvalidSamples: 0,
    projectedWidthMaxPx: 0,
    projectedHeightMaxPx: 0,
    rawOwnerTriangleUpperBound: 0,
    topOwners: [],
    skippedTriangles: 0,
  };
  if (
    !Array.isArray(sidewalls) ||
    typeof project !== 'function' ||
    typeof mapZ !== 'function' ||
    typeof visibleIntervals !== 'function' ||
    !Number.isFinite(displayZScale) ||
    displayZScale <= 0 ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    ![maxOwners, maxPartsPerOwner, maxInstancesPerOwner].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 64,
    )
  ) {
    return result;
  }

  const eligibleOwners = sidewalls.filter(
    (owner) =>
      owner?.buried === true &&
      Array.isArray(owner.instanceTranslations) &&
      owner.instanceTranslations.length >= 64 &&
      (owner.parts || [owner]).some(
        (part) =>
          finite2(part?.p) &&
          finite2(part?.q) &&
          Number.isFinite(part?.z0) &&
          Number.isFinite(part?.z1) &&
          part.z0 !== part.z1 &&
          !part.lowerSurface?.appearance &&
          !part.upperSurface?.appearance,
      ),
  );
  result.valid = true;
  result.reason = eligibleOwners.length ? 'sampled' : 'no-buried-smooth-array-owners';

  for (const ownerIndex of sampleIndices(eligibleOwners.length, maxOwners)) {
    const owner = eligibleOwners[ownerIndex];
    const parts = (owner.parts || [owner]).filter(
      (part) =>
        finite2(part?.p) &&
        finite2(part?.q) &&
        Number.isFinite(part.z0) &&
        Number.isFinite(part.z1) &&
        part.z0 !== part.z1 &&
        !part.lowerSurface?.appearance &&
        !part.upperSurface?.appearance,
    );
    const translations = owner.instanceTranslations;
    result.analyzedOwners++;
    const triangles = parts.length * translations.length * 4; // Unmerged, two-pass upper bound.
    result.rawOwnerTriangleUpperBound += triangles;
    result.topOwners.push({
      layerId: String(owner.layerId || 'unknown'),
      instances: translations.length,
      parts: parts.length,
      rawTwoPassTriangleUpperBound: triangles,
    });

    for (const partIndex of sampleIndices(parts.length, maxPartsPerOwner)) {
      const part = parts[partIndex];
      const intervals = visibleIntervals(part.z0, part.z1);
      if (!Array.isArray(intervals) || !intervals.length) {
        result.collapsedOrInvalidSamples++;
        continue;
      }
      // A Section break can leave two separate, visible physical Z intervals.
      // Observe both; ignoring the second can hide a costly exposed wall.
      for (const [z0, z1] of intervals.slice(0, 2)) {
        const mappedZ0 = mapZ(z0) * displayZScale;
        const mappedZ1 = mapZ(z1) * displayZScale;
        if (![mappedZ0, mappedZ1].every(Number.isFinite) || mappedZ0 === mappedZ1) {
          result.collapsedOrInvalidSamples++;
          continue;
        }
        for (const translateIndex of sampleIndices(translations.length, maxInstancesPerOwner)) {
          const offset = translations[translateIndex];
          if (!finite2(offset)) {
            result.collapsedOrInvalidSamples++;
            continue;
          }
          const [dx, dy] = offset;
          const quad = [
            [part.p[0] + dx, part.p[1] + dy, mappedZ0],
            [part.q[0] + dx, part.q[1] + dy, mappedZ0],
            [part.q[0] + dx, part.q[1] + dy, mappedZ1],
            [part.p[0] + dx, part.p[1] + dy, mappedZ1],
          ];
          result.sampledQuads++;
          const bounds = projectionArea(quad, project, viewportWidth, viewportHeight);
          if (!bounds) continue;
          result.projectedQuads++;
          if (bounds.offscreen) result.offscreenQuads++;
          if (!bounds.offscreen && Math.max(bounds.width, bounds.height) <= 0.5) {
            result.subpixelQuads++;
          }
          result.projectedWidthMaxPx = Math.max(result.projectedWidthMaxPx, bounds.width);
          result.projectedHeightMaxPx = Math.max(result.projectedHeightMaxPx, bounds.height);
        }
      }
    }
  }
  result.topOwners.sort(
    (a, b) => b.rawTwoPassTriangleUpperBound - a.rawTwoPassTriangleUpperBound,
  );
  result.topOwners = result.topOwners.slice(0, 6);
  return result;
}
