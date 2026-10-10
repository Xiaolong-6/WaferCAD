// Renderer V4 R2: revision-scoped CPU tile plans and bounded reuse.
// Pure derived data: no GPU allocations, visibility culling or source mutation.
import { projectAxisAlignedTileBounds } from './renderer-v3-tile-bounds.js';
import { selectAdaptiveTileTier } from './renderer-v4-adaptive-tiles.js';

const finite2 = (p) =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const validLimits = ({ tileInstances, maxOwners, maxTiles, maxPartsPerOwner }) =>
  Number.isInteger(tileInstances) &&
  tileInstances >= 1 &&
  tileInstances <= 256 &&
  Number.isInteger(maxOwners) &&
  maxOwners >= 1 &&
  maxOwners <= 128 &&
  Number.isInteger(maxTiles) &&
  maxTiles >= 1 &&
  maxTiles <= 4096 &&
  Number.isInteger(maxPartsPerOwner) &&
  maxPartsPerOwner >= 1 &&
  maxPartsPerOwner <= 8192;

export function buildAdaptiveTilePlan(
  owners,
  { tileInstances = 64, maxOwners = 32, maxTiles = 512, maxPartsPerOwner = 4096 } = {},
) {
  const limits = { tileInstances, maxOwners, maxTiles, maxPartsPerOwner };
  const plan = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    source: owners,
    limits,
    owners: 0,
    excludedOwners: 0,
    ownerOverflow: 0,
    tileOverflow: 0,
    tiles: [],
  };
  if (!Array.isArray(owners) || !validLimits(limits)) return plan;
  plan.valid = true;
  plan.reason = 'prepared';
  const eligible = owners
    .map((owner, index) => ({ owner, index }))
    .filter(
      ({ owner }) =>
        owner?.buried === true &&
        Array.isArray(owner.instanceTranslations) &&
        owner.instanceTranslations.length >= 64,
    );
  plan.ownerOverflow = Math.max(0, eligible.length - maxOwners);
  for (const { owner, index } of eligible.slice(0, maxOwners)) {
    const parts = Array.isArray(owner.parts) ? owner.parts : [owner];
    if (
      parts.length < 1 ||
      parts.length > maxPartsPerOwner ||
      !owner.instanceTranslations.every(finite2)
    ) {
      plan.excludedOwners++;
      continue;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const zPairs = [];
    let valid = true;
    for (const part of parts) {
      if (
        !finite2(part?.p) ||
        !finite2(part?.q) ||
        !Number.isFinite(part?.z0) ||
        !Number.isFinite(part?.z1) ||
        part.lowerSurface?.appearance ||
        part.upperSurface?.appearance
      ) {
        valid = false;
        break;
      }
      minX = Math.min(minX, part.p[0], part.q[0]);
      maxX = Math.max(maxX, part.p[0], part.q[0]);
      minY = Math.min(minY, part.p[1], part.q[1]);
      maxY = Math.max(maxY, part.p[1], part.q[1]);
      zPairs.push([part.z0, part.z1]);
    }
    if (!valid || !Number.isFinite(minX)) {
      plan.excludedOwners++;
      continue;
    }
    const ordered = [...owner.instanceTranslations].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const count = Math.ceil(ordered.length / tileInstances);
    const ownerPlan = { zPairs, ownerIndex: index };
    plan.owners++;
    for (let tileIndex = 0; tileIndex < count; tileIndex++) {
      if (plan.tiles.length >= maxTiles) {
        plan.tileOverflow += count - tileIndex;
        break;
      }
      let dxMin = Infinity, dxMax = -Infinity, dyMin = Infinity, dyMax = -Infinity;
      for (
        let pointIndex = tileIndex * tileInstances;
        pointIndex < Math.min(ordered.length, (tileIndex + 1) * tileInstances);
        pointIndex++
      ) {
        const [dx, dy] = ordered[pointIndex];
        dxMin = Math.min(dxMin, dx);
        dxMax = Math.max(dxMax, dx);
        dyMin = Math.min(dyMin, dy);
        dyMax = Math.max(dyMax, dy);
      }
      plan.tiles.push({
        // Stable *inside this source-plan epoch*. Old epochs must never
        // reuse hysteresis simply because indices and layer IDs match.
        id: String(index) + ':' + String(owner.layerId ?? 'unknown') + ':' + tileIndex,
        ownerPlan,
        bounds: {
          minX: minX + dxMin,
          maxX: maxX + dxMax,
          minY: minY + dyMin,
          maxY: maxY + dyMax,
        },
      });
    }
  }
  return plan;
}

// Bounded *CPU metadata* cache. Entries own no WebGL buffers/materials.
// Key includes exact plan identity and revision; never cache by layer ID alone.
export function createAdaptiveTilePlanCache({ maxEntries = 2 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 8)
    throw new RangeError('maxEntries must be an integer in [1, 8]');
  const entries = [];
  let hits = 0, misses = 0, evictions = 0;
  function clear() {
    entries.length = 0;
  }
  function get(owners, revision, limits = {}) {
    const key = JSON.stringify({
      revision: String(revision),
      tileInstances: limits.tileInstances ?? 64,
      maxOwners: limits.maxOwners ?? 32,
      maxTiles: limits.maxTiles ?? 512,
      maxPartsPerOwner: limits.maxPartsPerOwner ?? 4096,
    });
    const index = entries.findIndex((entry) => entry.source === owners && entry.key === key);
    if (index >= 0) {
      hits++;
      const [entry] = entries.splice(index, 1);
      entries.push(entry);
      return { plan: entry.plan, hit: true };
    }
    misses++;
    const plan = buildAdaptiveTilePlan(owners, limits);
    if (plan.valid) {
      entries.push({ key, source: owners, plan });
      if (entries.length > maxEntries) {
        entries.shift();
        evictions++;
      }
    }
    return { plan, hit: false };
  }
  function stats() {
    return {
      hits,
      misses,
      evictions,
      retainedPlans: entries.length,
      retainedTiles: entries.reduce((total, entry) => total + entry.plan.tiles.length, 0),
    };
  }
  return { clear, get, stats };
}

export function observePreparedAdaptiveTiles(
  plan,
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
    excludedOwners: 0,
    ownerOverflow: 0,
    tileOverflow: 0,
    tiles: 0,
    nearTiles: 0,
    midTiles: 0,
    farTiles: 0,
    offscreenTiles: 0,
    uncertainTiles: 0,
    candidateFarTiles: 0,
    skippedTriangles: 0,
    sample: [],
    nextTiers: new Map(),
  };
  if (
    !plan?.valid ||
    !Array.isArray(plan.tiles) ||
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
    selectAdaptiveTileTier(1, null, {
      nearThresholdPx,
      farThresholdPx,
      hysteresis,
    }) === 'exact-uncertain'
  ) return result;
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
  result.owners = plan.owners;
  result.excludedOwners = plan.excludedOwners;
  result.ownerOverflow = plan.ownerOverflow;
  result.tileOverflow = plan.tileOverflow;
  const zCache = new Map();
  for (const tile of plan.tiles) {
    result.tiles++;
    let z = zCache.get(tile.ownerPlan);
    if (!z) {
      let minZ = Infinity, maxZ = -Infinity, valid = true;
      try {
        for (const [z0, z1] of tile.ownerPlan.zPairs) {
          const intervals = visibleIntervals(z0, z1);
          if (!Array.isArray(intervals) || intervals.length < 1 || intervals.length > 2) {
            valid = false;
            break;
          }
          for (const pair of intervals) {
            if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)) {
              valid = false;
              break;
            }
            const a = mapZ(pair[0]) * displayZScale;
            const b = mapZ(pair[1]) * displayZScale;
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
              valid = false;
              break;
            }
            minZ = Math.min(minZ, a, b);
            maxZ = Math.max(maxZ, a, b);
          }
          if (!valid) break;
        }
      } catch {
        valid = false;
      }
      z = valid && Number.isFinite(minZ) ? { minZ, maxZ } : { invalid: true };
      zCache.set(tile.ownerPlan, z);
    }
    if (z.invalid) {
      result.uncertainTiles++;
      continue;
    }
    const projected = projectAxisAlignedTileBounds(
      { ...tile.bounds, minZ: z.minZ, maxZ: z.maxZ },
      viewProjectionMatrix,
      viewportWidth,
      viewportHeight,
    );
    if (projected.kind === 'uncertain-near-far') {
      result.uncertainTiles++;
      continue;
    }
    if (projected.kind === 'offscreen-bound') {
      result.offscreenTiles++;
      continue;
    }
    const footprintPx = Math.max(projected.widthPx, projected.heightPx);
    const tier = selectAdaptiveTileTier(footprintPx, previousTiers.get(tile.id), {
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
    if (tier !== 'exact-uncertain') result.nextTiers.set(tile.id, tier);
    if (result.sample.length < 8)
      result.sample.push({ id: tile.id, tier, footprintPx });
  }
  return result;
}
