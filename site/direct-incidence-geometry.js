import {
  difference,
  intersection,
  isEmpty,
  transformMulti,
  unionGeometries,
} from './vector-geometry.js';

const EPS = 1e-9;

function shift(geometry, dx, dy) {
  return transformMulti(geometry, ([x, y]) => [x + dx, y + dy]);
}

/**
 * Fixed-direction, ballistic visibility for the existing vector-2.5d model.
 * Each occupied column can shadow another horizontal surface. Optional resist
 * openings are specified as canonical XY polygons and *absolute* Z intervals.
 * No sidewall flux or film growth kinetics are calculated here.
 *
 * A height discretization approximates continuous swept-volume silhouettes.
 * Caller must record the step and check convergence on its target feature size.
 */
export function directIncidenceArea(
  model,
  area,
  incidence,
  { face = 'front', depositedThicknessUm = 0 } = {},
) {
  const tiltDeg = incidence?.tiltDeg;
  const azimuthDeg = incidence?.azimuthDeg ?? 0;
  const heightStepUm = incidence?.heightStepUm ?? 0.02;
  const maxSamples = incidence?.maxSamples ?? 3000;
  if (!Number.isFinite(depositedThicknessUm) || depositedThicknessUm < 0)
    throw new RangeError('Direct nominal deposition thickness must be nonnegative and finite.');
  if (face !== 'front') throw new RangeError('Angled Direct currently supports front face only.');
  if (!Number.isFinite(tiltDeg) || tiltDeg < 0 || tiltDeg >= 89)
    throw new RangeError('Direct tilt must be in [0, 89) degrees.');
  if (!Number.isFinite(azimuthDeg)) throw new RangeError('Direct azimuth must be finite.');
  if (!Number.isFinite(heightStepUm) || heightStepUm <= 0)
    throw new RangeError('Direct shadow sample step must be positive.');
  if (!Number.isInteger(maxSamples) || maxSamples < 2)
    throw new RangeError('Direct shadow sample budget must be at least two.');
  const apertures = incidence?.apertureStack ?? [];
  if (!Array.isArray(apertures)) throw new RangeError('Direct apertureStack must be an array.');
  let prevTop = null;
  for (const aperture of apertures) {
    if (
      !Number.isFinite(aperture.bottomZUm) ||
      !Number.isFinite(aperture.topZUm) ||
      aperture.topZUm <= aperture.bottomZUm ||
      !Array.isArray(aperture.opening) ||
      (prevTop !== null && Math.abs(aperture.bottomZUm - prevTop) > EPS)
    )
      throw new RangeError('Direct apertureStack must be contiguous physical-Z openings.');
    prevTop = aperture.topZUm;
  }
  const rad = Math.PI / 180;
  const vx = Math.tan(tiltDeg * rad) * Math.cos(azimuthDeg * rad);
  const vy = Math.tan(tiltDeg * rad) * Math.sin(azimuthDeg * rad);
  const byHeight = new Map();
  for (const region of model.regions || []) {
    const stack = region.stack || [];
    const top = stack.length ? Math.max(...stack.map((s) => s.z1)) : null;
    if (!Number.isFinite(top) || isEmpty(intersection(region.geom, area))) continue;
    // A vertical-wall surrogate is not a physical horizontal deposition target.
    const exposed = stack.find((seg) => Math.abs(seg.z1 - top) <= EPS);
    if (['conformal-sidewall', 'direct-sidewall'].includes(exposed?.role)) continue;
    const key = top.toPrecision(14);
    if (!byHeight.has(key)) byHeight.set(key, { z: top, targets: [] });
    byHeight.get(key).targets.push(region.geom);
  }
  let sampleCount = 0;
  const sampledHeights = (bottom, top) => {
    if (top <= bottom + EPS) return [bottom];
    const n = Math.max(1, Math.ceil((top - bottom) / heightStepUm));
    if (sampleCount + n + 1 > maxSamples)
      throw new RangeError('Direct shadow sampling budget exceeded; narrow ROI or adjust step.');
    sampleCount += n + 1;
    return Array.from({ length: n + 1 }, (_, i) => bottom + ((top - bottom) * i) / n);
  };
  const pieces = [];
  for (const { z: targetZ, targets } of byHeight.values()) {
    let visible = unionGeometries(targets.map((geom) => intersection(geom, area)));
    for (const aperture of apertures) {
      if (isEmpty(visible)) break;
      const bottom = Math.max(targetZ, aperture.bottomZUm);
      if (bottom >= aperture.topZUm - EPS) continue;
      for (const z of sampledHeights(bottom, aperture.topZUm)) {
        visible = intersection(
          visible,
          shift(aperture.opening, -(z - targetZ) * vx, -(z - targetZ) * vy),
        );
        if (isEmpty(visible)) break;
      }
    }
    if (isEmpty(visible)) continue;
    for (const region of model.regions || []) {
      if (isEmpty(visible)) break;
      for (const segment of region.stack || []) {
        const bottom = Math.max(targetZ, segment.z0);
        if (segment.z1 <= targetZ + EPS || segment.z1 <= bottom + EPS) continue;
        // The beam must clear *every* solid it passes, not just the tallest column.
        const shadows = sampledHeights(bottom, segment.z1).map((z) =>
          shift(region.geom, -(z - targetZ) * vx, -(z - targetZ) * vy),
        );
        visible = difference(visible, unionGeometries(shadows));
        if (isEmpty(visible)) break;
      }
    }
    // Only a ray-visible surface can receive this dose. An occluded tall
    // column must not reject valid deposition on a lower exposed target.
    // We still fail closed if a genuinely illuminated surface would grow
    // through the modeled resist ceiling.
    if (
      apertures.length &&
      !isEmpty(visible) &&
      targetZ + depositedThicknessUm >= apertures.at(-1).topZUm - EPS
    )
      throw new RangeError(
        'Fixed-angle Direct would grow material through the assumed resist top.',
      );
    if (!isEmpty(visible)) pieces.push(visible);
  }
  return {
    area: pieces.length ? unionGeometries(pieces) : [],
    sampleCount,
    heightStepUm,
    method: 'fixed-incidence-sampled-visibility',
    surfaceLevels: byHeight.size,
  };
}
