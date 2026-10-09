// Conservative bounding-volume projection for buried smooth array walls.
// Diagnostics ONLY: a bounding volume does not establish alpha-compositing
// equivalence and MUST NOT be used to skip or replace render geometry.
const finite2 = (point) =>
  Array.isArray(point) &&
  point.length >= 2 &&
  Number.isFinite(point[0]) &&
  Number.isFinite(point[1]);

export function projectAxisAlignedTileBounds(bounds, matrix, width, height) {
  const e = matrix;
  const corners = [];
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const clipX = e[0] * x + e[4] * y + e[8] * z + e[12],
          clipY = e[1] * x + e[5] * y + e[9] * z + e[13],
          clipZ = e[2] * x + e[6] * y + e[10] * z + e[14],
          clipW = e[3] * x + e[7] * y + e[11] * z + e[15];
        // A near/far-plane intersection requires clipping the box. Fail
        // closed instead of projecting its vertices and missing geometry.
        if (
          ![clipX, clipY, clipZ, clipW].every(Number.isFinite) ||
          clipW <= 0 ||
          clipZ < -clipW ||
          clipZ > clipW
        ) return { kind: 'uncertain-near-far' };
        corners.push([
          ((clipX / clipW + 1) * width) / 2,
          ((1 - clipY / clipW) * height) / 2,
        ]);
      }
    }
  }
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs),
    minY = Math.min(...ys), maxY = Math.max(...ys);
  const pixelWidth = maxX - minX, pixelHeight = maxY - minY;
  const offscreen = maxX < 0 || minX > width || maxY < 0 || minY > height;
  return {
    kind: offscreen ? 'offscreen-bound' : 'onscreen-bound',
    widthPx: pixelWidth,
    heightPx: pixelHeight,
  };
}

// A box enclosing every source edge and every translation in a tile is a
// conservative perspective-space footprint while all eight corners are
// in front of the near plane. This does NOT imply anything about how
// transparent overlapping faces may contribute to a pixel.
export function buriedInterfaceTileBounds(
  owners,
  {
    viewProjectionMatrix,
    viewportWidth,
    viewportHeight,
    mapZ = (z) => z,
    visibleIntervals = (z0, z1) => [[z0, z1]],
    displayZScale = 1,
    clipped = false,
    zCollapsed = false,
    farTier = false,
    nearEdgeOn = false,
    maxOwners = 32,
    tileInstances = 64,
    maxTiles = 512,
    subpixelThreshold = 0.5,
  } = {},
) {
  const output = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    reductionGate: 'not-far',
    owners: 0,
    tiles: 0,
    fullyBoundedTiles: 0,
    subpixelBounds: 0,
    offscreenBounds: 0,
    uncertainTiles: 0,
    excludedOwners: 0,
    ownerOverflow: 0,
    tileOverflow: 0,
    rawTwoPassTriangleUpperBound: 0,
    maxProjectedWidthPx: 0,
    maxProjectedHeightPx: 0,
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
    typeof mapZ !== 'function' ||
    typeof visibleIntervals !== 'function' ||
    !Number.isInteger(tileInstances) || tileInstances < 1 || tileInstances > 256 ||
    !Number.isInteger(maxOwners) || maxOwners < 1 || maxOwners > 128 ||
    !Number.isInteger(maxTiles) || maxTiles < 1 || maxTiles > 4096 ||
    !Number.isFinite(subpixelThreshold) ||
    subpixelThreshold <= 0 || subpixelThreshold > 0.5
  ) return output;
  output.valid = true;
  output.reason = 'measured';
  output.reductionGate = !farTier
    ? 'not-far'
    : clipped
      ? 'roi'
      : zCollapsed
        ? 'z-collapse'
        : nearEdgeOn
          ? 'edge-on'
          : 'alpha-coverage-unverified';

  const eligible = owners.filter(
    (owner) =>
      owner?.buried === true &&
      Array.isArray(owner.instanceTranslations) &&
      owner.instanceTranslations.length >= 64,
  );
  output.ownerOverflow = Math.max(0, eligible.length - maxOwners);
  for (const owner of eligible.slice(0, maxOwners)) {
    const parts = Array.isArray(owner.parts) ? owner.parts : [owner];
    const xy = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let zMin = Infinity, zMax = -Infinity, invalid = false;
    for (const part of parts) {
      if (
        !finite2(part?.p) ||
        !finite2(part?.q) ||
        !Number.isFinite(part?.z0) ||
        !Number.isFinite(part?.z1) ||
        part.lowerSurface?.appearance ||
        part.upperSurface?.appearance
      ) {
        invalid = true;
        break;
      }
      xy.minX = Math.min(xy.minX, part.p[0], part.q[0]);
      xy.maxX = Math.max(xy.maxX, part.p[0], part.q[0]);
      xy.minY = Math.min(xy.minY, part.p[1], part.q[1]);
      xy.maxY = Math.max(xy.maxY, part.p[1], part.q[1]);
      const intervals = visibleIntervals(part.z0, part.z1);
      if (!Array.isArray(intervals)) {
        invalid = true;
        break;
      }
      for (const [a, b] of intervals) {
        const mappedA = mapZ(a) * displayZScale,
          mappedB = mapZ(b) * displayZScale;
        if (![mappedA, mappedB].every(Number.isFinite)) {
          invalid = true;
          break;
        }
        zMin = Math.min(zMin, mappedA, mappedB);
        zMax = Math.max(zMax, mappedA, mappedB);
      }
      if (invalid) break;
    }
    if (invalid || !Number.isFinite(xy.minX) || !Number.isFinite(zMin)) {
      output.excludedOwners++;
      continue;
    }
    const translations = owner.instanceTranslations;
    if (!translations.every(finite2)) {
      output.excludedOwners++;
      continue;
    }
    // Stable spatial chunking without enumerating parts x instances.
    const ordered = [...translations].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const estimatedTiles = Math.ceil(ordered.length / tileInstances);
    const recorded = {
      layerId: String(owner.layerId || 'unknown'),
      instances: ordered.length,
      templateParts: parts.length,
      tiles: 0,
      subpixelBounds: 0,
      offscreenBounds: 0,
      uncertainTiles: 0,
      rawTwoPassTriangleUpperBound: parts.length * ordered.length * 4,
    };
    output.owners++;
    output.rawTwoPassTriangleUpperBound += recorded.rawTwoPassTriangleUpperBound;
    for (let tileIndex = 0; tileIndex < estimatedTiles; tileIndex++) {
      if (output.tiles >= maxTiles) {
        output.tileOverflow += estimatedTiles - tileIndex;
        break;
      }
      const tile = ordered.slice(tileIndex * tileInstances, (tileIndex + 1) * tileInstances);
      const dxMin = Math.min(...tile.map((p) => p[0])),
        dxMax = Math.max(...tile.map((p) => p[0])),
        dyMin = Math.min(...tile.map((p) => p[1])),
        dyMax = Math.max(...tile.map((p) => p[1]));
      const rectangle = projectAxisAlignedTileBounds(
        {
          minX: xy.minX + dxMin, maxX: xy.maxX + dxMax,
          minY: xy.minY + dyMin, maxY: xy.maxY + dyMax,
          minZ: zMin, maxZ: zMax,
        },
        viewProjectionMatrix, viewportWidth, viewportHeight,
      );
      output.tiles++;
      recorded.tiles++;
      if (rectangle.kind === 'uncertain-near-far') {
        output.uncertainTiles++;
        recorded.uncertainTiles++;
        continue;
      }
      output.fullyBoundedTiles++;
      output.maxProjectedWidthPx = Math.max(output.maxProjectedWidthPx, rectangle.widthPx);
      output.maxProjectedHeightPx = Math.max(output.maxProjectedHeightPx, rectangle.heightPx);
      if (rectangle.kind === 'offscreen-bound') {
        output.offscreenBounds++;
        recorded.offscreenBounds++;
      } else if (
        rectangle.widthPx <= subpixelThreshold &&
        rectangle.heightPx <= subpixelThreshold
      ) {
        output.subpixelBounds++;
        recorded.subpixelBounds++;
      }
    }
    output.topOwners.push(recorded);
  }
  output.topOwners.sort(
    (a, b) => b.rawTwoPassTriangleUpperBound - a.rawTwoPassTriangleUpperBound,
  );
  output.topOwners = output.topOwners.slice(0, 6);
  // No skipped geometry. Even exact subpixel bounding is not a proof that
  // alpha blending / occlusion / ownership can be dropped.
  return output;
}
