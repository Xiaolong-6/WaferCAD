// V4 phase R1: bounded screen-space tile classification, diagnostics ONLY.
// A small footprint is NOT proof that transparent surfaces may be culled.
// This module never modifies geometry or authorizes render submission changes.
import { projectAxisAlignedTileBounds } from './renderer-v3-tile-bounds.js';

const finite2 = (value) =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

export function selectAdaptiveTileTier(
  footprintPx,
  previousTier = null,
  { nearThresholdPx = 64, farThresholdPx = 8, hysteresis = 0.2 } = {},
) {
  if (
    !Number.isFinite(footprintPx) ||
    footprintPx < 0 ||
    !Number.isFinite(nearThresholdPx) ||
    !Number.isFinite(farThresholdPx) ||
    farThresholdPx <= 0 ||
    nearThresholdPx <= farThresholdPx ||
    !Number.isFinite(hysteresis) ||
    hysteresis < 0 ||
    hysteresis >= 0.5
  )
    return 'exact-uncertain';
  if (previousTier === 'near' && footprintPx >= nearThresholdPx * (1 - hysteresis)) return 'near';
  if (previousTier === 'far' && footprintPx <= farThresholdPx * (1 + hysteresis)) return 'far';
  if (footprintPx >= nearThresholdPx) return 'near';
  if (footprintPx <= farThresholdPx) return 'far';
  return 'mid';
}

export function observeAdaptiveArrayTiles(
  owners,
  {
    viewProjectionMatrix,
    viewportWidth,
    viewportHeight,
    displayZScale = 1,
    mapZ = (z) => z,
    visibleIntervals = (a, b) => [[a, b]],
    clipped = false,
    zCollapsed = false,
    nearEdgeOn = false,
    farTier = false,
    tileInstances = 64,
    maxOwners = 32,
    maxTiles = 512,
    nearThresholdPx = 64,
    farThresholdPx = 8,
    hysteresis = 0.2,
    previousTiers = new Map(),
  } = {},
) {
  const result = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    reductionGate: 'invalid-input',
    owners: 0,
    tiles: 0,
    nearTiles: 0,
    midTiles: 0,
    farTiles: 0,
    offscreenTiles: 0,
    uncertainTiles: 0,
    excludedOwners: 0,
    ownerOverflow: 0,
    tileOverflow: 0,
    // This count is a scheduling hypothesis, never permission to remove faces.
    candidateFarTiles: 0,
    skippedTriangles: 0,
    sample: [],
    nextTiers: new Map(),
  };
  if (
    !Array.isArray(owners) ||
    !viewProjectionMatrix ||
    viewProjectionMatrix.length !== 16 ||
    !Array.from(viewProjectionMatrix).every(Number.isFinite) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(displayZScale) ||
    displayZScale <= 0 ||
    typeof mapZ !== 'function' ||
    typeof visibleIntervals !== 'function' ||
    !(previousTiers instanceof Map) ||
    ![tileInstances, maxOwners, maxTiles].every((value) => Number.isInteger(value) && value >= 1) ||
    tileInstances > 256 ||
    maxOwners > 128 ||
    maxTiles > 4096 ||
    selectAdaptiveTileTier(1, null, {
      nearThresholdPx,
      farThresholdPx,
      hysteresis,
    }) === 'exact-uncertain'
  )
    return result;

  result.valid = true;
  result.reason = 'measured';
  result.reductionGate = !farTier
    ? 'not-far'
    : clipped
      ? 'roi'
      : zCollapsed
        ? 'z-collapse'
        : nearEdgeOn
          ? 'edge-on'
          : 'alpha-coverage-unverified';

  const eligible = owners
    .map((owner, index) => ({ owner, index }))
    .filter(
      ({ owner }) =>
        owner?.buried === true &&
        Array.isArray(owner.instanceTranslations) &&
        owner.instanceTranslations.length >= 64,
    );
  result.ownerOverflow = Math.max(0, eligible.length - maxOwners);
  for (const { owner, index } of eligible.slice(0, maxOwners)) {
    const parts = Array.isArray(owner.parts) ? owner.parts : [owner];
    const xy = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let zMin = Infinity;
    let zMax = -Infinity;
    let validOwner = parts.length > 0 && owner.instanceTranslations.every(finite2);
    for (const part of parts) {
      if (
        !validOwner ||
        !finite2(part?.p) ||
        !finite2(part?.q) ||
        !Number.isFinite(part?.z0) ||
        !Number.isFinite(part?.z1) ||
        part?.lowerSurface?.appearance ||
        part?.upperSurface?.appearance
      ) {
        validOwner = false;
        break;
      }
      xy.minX = Math.min(xy.minX, part.p[0], part.q[0]);
      xy.maxX = Math.max(xy.maxX, part.p[0], part.q[0]);
      xy.minY = Math.min(xy.minY, part.p[1], part.q[1]);
      xy.maxY = Math.max(xy.maxY, part.p[1], part.q[1]);
      const intervals = visibleIntervals(part.z0, part.z1);
      if (!Array.isArray(intervals) || intervals.length < 1 || intervals.length > 2) {
        validOwner = false;
        break;
      }
      for (const interval of intervals) {
        if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite)) {
          validOwner = false;
          break;
        }
        const a = mapZ(interval[0]) * displayZScale;
        const b = mapZ(interval[1]) * displayZScale;
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
          validOwner = false;
          break;
        }
        zMin = Math.min(zMin, a, b);
        zMax = Math.max(zMax, a, b);
      }
      if (!validOwner) break;
    }
    if (!validOwner || !Number.isFinite(zMin)) {
      result.excludedOwners++;
      continue;
    }
    const ordered = [...owner.instanceTranslations].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const tileCount = Math.ceil(ordered.length / tileInstances);
    result.owners++;
    for (let tileIndex = 0; tileIndex < tileCount; tileIndex++) {
      if (result.tiles >= maxTiles) {
        result.tileOverflow += tileCount - tileIndex;
        break;
      }
      const tile = ordered.slice(tileIndex * tileInstances, (tileIndex + 1) * tileInstances);
      let dxMin = Infinity;
      let dxMax = -Infinity;
      let dyMin = Infinity;
      let dyMax = -Infinity;
      for (const [dx, dy] of tile) {
        dxMin = Math.min(dxMin, dx);
        dxMax = Math.max(dxMax, dx);
        dyMin = Math.min(dyMin, dy);
        dyMax = Math.max(dyMax, dy);
      }
      const projected = projectAxisAlignedTileBounds(
        {
          minX: xy.minX + dxMin,
          maxX: xy.maxX + dxMax,
          minY: xy.minY + dyMin,
          maxY: xy.maxY + dyMax,
          minZ: zMin,
          maxZ: zMax,
        },
        viewProjectionMatrix,
        viewportWidth,
        viewportHeight,
      );
      result.tiles++;
      if (projected.kind === 'uncertain-near-far') {
        result.uncertainTiles++;
        continue;
      }
      if (projected.kind === 'offscreen-bound') {
        result.offscreenTiles++;
        continue;
      }
      const id = String(index) + ':' + String(owner.layerId ?? 'unknown') + ':' + tileIndex;
      const footprintPx = Math.max(projected.widthPx, projected.heightPx);
      const tier = selectAdaptiveTileTier(footprintPx, previousTiers.get(id), {
        nearThresholdPx,
        farThresholdPx,
        hysteresis,
      });
      if (tier === 'near') result.nearTiles++;
      else if (tier === 'mid') result.midTiles++;
      else if (tier === 'far') {
        result.farTiles++;
        result.candidateFarTiles++;
      } else result.uncertainTiles++;
      if (tier !== 'exact-uncertain') result.nextTiers.set(id, tier);
      if (result.sample.length < 8) result.sample.push({ id, tier, footprintPx });
    }
  }
  // No amount of footprint/LOD evidence proves transparent alpha coverage.
  // Render visibility, draw calls and stored geometry are deliberately unchanged.
  return result;
}
