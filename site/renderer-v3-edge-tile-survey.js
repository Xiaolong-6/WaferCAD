import { projectAxisAlignedTileBounds } from './renderer-v3-tile-bounds.js';

// Finer-grained, presentation-only workload observation. A complete
// part x spatial-instance-tile enclosure is projected, never culled.
// A <0.5px bounding box still contributes alpha and depth and is NOT a
// scientifically valid instruction to remove a transparent surface.
const finiteXY = (p) =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

export function buriedInterfaceEdgeTileSurvey(
  owners,
  {
    viewProjectionMatrix,
    viewportWidth,
    viewportHeight,
    mapZ = (z) => z,
    visibleIntervals = (z0, z1) => [[z0, z1]],
    displayZScale = 1,
    farTier = false,
    clipped = false,
    zCollapsed = false,
    edgeOn = false,
    tileInstances = 64,
    maxOwners = 2,
    maxProjectedBounds = 100000,
    subpixelThreshold = 0.5,
  } = {},
) {
  const result = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    reductionGate: 'not-far',
    studiedOwners: 0,
    projectedBounds: 0,
    subpixelBounds: 0,
    offscreenBounds: 0,
    uncertainBounds: 0,
    ownerOverflow: 0,
    workOverflow: 0,
    excludedOwners: 0,
    hiddenIntervals: 0,
    representedRawTwoPassTriangles: 0,
    subpixelRawTwoPassUpperBound: 0,
    topOwners: [],
    skippedTriangles: 0,
  };
  if (
    !Array.isArray(owners) ||
    !viewProjectionMatrix ||
    viewProjectionMatrix.length !== 16 ||
    !Array.from(viewProjectionMatrix).every(Number.isFinite) ||
    !Number.isFinite(viewportWidth) || viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) || viewportHeight <= 0 ||
    !Number.isFinite(displayZScale) || displayZScale <= 0 ||
    typeof mapZ !== 'function' || typeof visibleIntervals !== 'function' ||
    !Number.isInteger(tileInstances) || tileInstances < 1 || tileInstances > 256 ||
    !Number.isInteger(maxOwners) || maxOwners < 1 || maxOwners > 8 ||
    !Number.isInteger(maxProjectedBounds) ||
    maxProjectedBounds < 1 || maxProjectedBounds > 200000 ||
    !Number.isFinite(subpixelThreshold) ||
    subpixelThreshold <= 0 || subpixelThreshold > 0.5
  ) return result;
  result.valid = true;
  result.reason = 'bounded';
  result.reductionGate = !farTier
    ? 'not-far'
    : clipped
      ? 'roi'
      : zCollapsed
        ? 'z-collapse'
        : edgeOn
          ? 'edge-on'
          : 'alpha-coverage-unverified';

  // Pick the heaviest owner templates, never hard-code example layer IDs.
  const candidates = owners.filter(
    (o) => o?.buried === true &&
      Array.isArray(o.instanceTranslations) &&
      o.instanceTranslations.length >= 64,
  ).sort(
    (a, b) =>
      (b.parts?.length || 1) * b.instanceTranslations.length -
      (a.parts?.length || 1) * a.instanceTranslations.length,
  );
  result.ownerOverflow = Math.max(0, candidates.length - maxOwners);
  for (const owner of candidates.slice(0, maxOwners)) {
    const parts = owner.parts || [owner];
    const translations = owner.instanceTranslations;
    // Entire template must be smooth and valid before any part is observed.
    // Incomplete/rough groups cannot be called representative.
    if (
      !parts.length ||
      parts.length > 8192 ||
      !parts.every((p) =>
        finiteXY(p?.p) && finiteXY(p?.q) &&
        Number.isFinite(p.z0) && Number.isFinite(p.z1) &&
        p.z0 !== p.z1 &&
        !p.lowerSurface?.appearance && !p.upperSurface?.appearance,
      ) ||
      !translations.every(finiteXY)
    ) {
      result.excludedOwners++;
      continue;
    }
    const fragments = [];
    let valid = true;
    let hiddenCount = 0;
    for (const part of parts) {
      const intervals = visibleIntervals(part.z0, part.z1);
      if (!Array.isArray(intervals) || intervals.length > 2) {
        valid = false;
        break;
      }
      if (!intervals.length) {
        hiddenCount++;
        continue;
      }
      for (const interval of intervals) {
        if (!Array.isArray(interval) || interval.length < 2) {
          valid = false;
          break;
        }
        const z0 = mapZ(interval[0]) * displayZScale,
          z1 = mapZ(interval[1]) * displayZScale;
        if (![z0, z1].every(Number.isFinite)) {
          valid = false;
          break;
        }
        if (z0 === z1) {
          hiddenCount++;
          continue;
        }
        fragments.push({
          minX: Math.min(part.p[0], part.q[0]),
          maxX: Math.max(part.p[0], part.q[0]),
          minY: Math.min(part.p[1], part.q[1]),
          maxY: Math.max(part.p[1], part.q[1]),
          minZ: Math.min(z0, z1),
          maxZ: Math.max(z0, z1),
        });
      }
      if (!valid) break;
    }
    if (!valid) {
      result.excludedOwners++;
      continue;
    }
    result.hiddenIntervals += hiddenCount;
    const tiles = [...translations]
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const count = Math.ceil(tiles.length / tileInstances);
    const perOwner = {
      layerId: String(owner.layerId || 'unknown'),
      instances: translations.length,
      templateParts: parts.length,
      visibleFragments: fragments.length,
      projectedBounds: 0,
      subpixelBounds: 0,
      offscreenBounds: 0,
      uncertainBounds: 0,
      rawTwoPassTriangleUpperBound: 0,
    };
    result.studiedOwners++;
    for (let tileIndex = 0; tileIndex < count; tileIndex++) {
      const group = tiles.slice(tileIndex * tileInstances, (tileIndex + 1) * tileInstances),
        dx0 = Math.min(...group.map((p) => p[0])),
        dx1 = Math.max(...group.map((p) => p[0])),
        dy0 = Math.min(...group.map((p) => p[1])),
        dy1 = Math.max(...group.map((p) => p[1]));
      for (let partIndex = 0; partIndex < fragments.length; partIndex++) {
        if (result.projectedBounds >= maxProjectedBounds) {
          result.workOverflow += fragments.length - partIndex +
            (count - tileIndex - 1) * fragments.length;
          break;
        }
        const f = fragments[partIndex],
          rect = projectAxisAlignedTileBounds({
            minX: f.minX + dx0, maxX: f.maxX + dx1,
            minY: f.minY + dy0, maxY: f.maxY + dy1,
            minZ: f.minZ, maxZ: f.maxZ,
          }, viewProjectionMatrix, viewportWidth, viewportHeight);
        result.projectedBounds++;
        perOwner.projectedBounds++;
        const represented = group.length * 4;
        result.representedRawTwoPassTriangles += represented;
        perOwner.rawTwoPassTriangleUpperBound += represented;
        if (rect.kind === 'uncertain-near-far') {
          result.uncertainBounds++;
          perOwner.uncertainBounds++;
        } else if (rect.kind === 'offscreen-bound') {
          result.offscreenBounds++;
          perOwner.offscreenBounds++;
        } else if (
          rect.widthPx <= subpixelThreshold &&
          rect.heightPx <= subpixelThreshold
        ) {
          result.subpixelBounds++;
          perOwner.subpixelBounds++;
          result.subpixelRawTwoPassUpperBound += represented;
        }
      }
      if (result.projectedBounds >= maxProjectedBounds) break;
    }
    result.topOwners.push(perOwner);
    if (result.projectedBounds >= maxProjectedBounds) break;
  }
  return result;
}
