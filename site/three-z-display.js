// Read-only 3D presentation scaling, independent of physical Process geometry.
// The complete scene (caps, sidewalls, conformal films and borders) shares
// one Z display scale; never apply this multiplier to individual rough vertices.
export const THREE_Z_DISPLAY_RANGE = Object.freeze({ min: 0.25, max: 20, step: 0.05 });

export function normalizeThreeZDisplayFactor(value) {
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0
    ? Math.max(THREE_Z_DISPLAY_RANGE.min, Math.min(THREE_Z_DISPLAY_RANGE.max, factor))
    : 1;
}

export function threeZDisplayScale(baseScale, factor = 1) {
  const base = Number(baseScale);
  if (!Number.isFinite(base) || base <= 0) return 1;
  return base * normalizeThreeZDisplayFactor(factor);
}

// An opt-in local, monotone display mapping can make subpixel height variation
// inspectable without multiplying only rough-cap vertices (which would cross
// conformal films). The same map must be applied to every 3D surface, sidewall
// and border; it must never be used for Process geometry or GLB exports.
export const THREE_ROUGH_RELIEF_FACTORS = Object.freeze([1, 10, 30]);

export function normalizeThreeRoughReliefFactor(value) {
  const factor = Number(value);
  return THREE_ROUGH_RELIEF_FACTORS.includes(factor) ? factor : 1;
}

export function threeRoughReliefBands(model, marginUm = 0.12, regionIntersectsRoi = null) {
  const bands = [];
  // Very large array models have no inexpensive enumerable slab set. Leave
  // the optional presentation mode disabled instead of expanding templates.
  if (!Array.isArray(model?.regions) || model.regions.length > 20000) return bands;
  const margin = Math.max(0, Math.min(1, Number(marginUm) || 0));
  for (const region of model.regions) {
    // Most Process owners have no rough surfaces. Reject them before any
    // polygon Boolean against the ROI; this is a display-time operation.
    if (
      !(region.stack || []).some(
        (slab) => slab.frontSurface?.kind === 'rough' || slab.backSurface?.kind === 'rough',
      )
    )
      continue;
    if (regionIntersectsRoi && !regionIntersectsRoi(region)) continue;
    for (const slab of region.stack || []) {
      for (const [appearance, z, normal] of [
        [slab.frontSurface, slab.z1, 1],
        [slab.backSurface, slab.z0, -1],
      ]) {
        if (appearance?.kind !== 'rough' || !Number.isFinite(z)) continue;
        const depth = Number(appearance.etchDepth ?? appearance.meanHeight);
        if (!(depth > 0) || !Number.isFinite(depth)) continue;
        const lo = normal > 0 ? z - margin : z - depth - margin;
        const hi = normal > 0 ? z + depth + margin : z + margin;
        bands.push([lo, hi]);
      }
    }
  }
  bands.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [lo, hi] of bands) {
    const last = merged.at(-1);
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  // Never create an excessive number of local ramps in an interactive scene.
  return merged.length <= 16 ? merged : [];
}

export function createThreeRoughReliefDisplayTransform(base, bands = [], requestedFactor = 1) {
  const factor = normalizeThreeRoughReliefFactor(requestedFactor),
    intervals = (bands || []).filter(
      (band) =>
        Array.isArray(band) &&
        Number.isFinite(band[0]) &&
        Number.isFinite(band[1]) &&
        band[1] > band[0],
    ),
    active = factor > 1 && intervals.length > 0;
  if (!active) return { ...base, reliefFactor: 1, reliefBands: 0, reliefActive: false };
  const mapZ = (z) => {
    const physical = Number(z);
    if (!Number.isFinite(physical)) return physical;
    let local = 0;
    for (const [lo, hi] of intervals) local += Math.max(0, Math.min(physical, hi) - lo);
    return base.mapZ(physical) + (factor - 1) * local;
  };
  const displayMin = mapZ(base.zMin),
    displayMax = mapZ(base.zMax);
  return {
    ...base,
    mapZ,
    displayMin,
    displayMax,
    displaySpan: displayMax - displayMin,
    reliefFactor: factor,
    reliefBands: intervals.length,
    reliefActive: true,
  };
}

// Three.js computes dash distances before this view applies its nonlinear
// Z map. Rebuild the cumulative distance in displayed scene units so visible
// and hidden structural borders keep the expected dash pitch after Relief.
// No material geometry, persisted model, or export coordinates are changed.
export function refreshThreeDashedBorderDistances(object, zScale = 1) {
  if (!object?.isLineSegments || !object.material?.isLineDashedMaterial) return false;
  const positions = object.geometry?.getAttribute?.('position');
  if (!positions?.count || positions.count % 2 !== 0 || object.geometry.index) return false;
  let distances = object.geometry.getAttribute('lineDistance');
  if (!distances || distances.count !== positions.count) {
    object.computeLineDistances();
    distances = object.geometry.getAttribute('lineDistance');
  }
  const scale = Number.isFinite(Number(zScale)) && Number(zScale) > 0 ? Number(zScale) : 1;
  let cumulative = 0;
  for (let index = 0; index < positions.count; index += 2) {
    distances.setX(index, cumulative);
    cumulative += Math.hypot(
      positions.getX(index + 1) - positions.getX(index),
      positions.getY(index + 1) - positions.getY(index),
      (positions.getZ(index + 1) - positions.getZ(index)) * scale,
    );
    distances.setX(index + 1, cumulative);
  }
  distances.needsUpdate = true;
  return true;
}
