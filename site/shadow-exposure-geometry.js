import { intersection, normalizeMulti, transformMulti } from './vector-geometry.js';

const EPS = 1e-9;

/**
 * A line-of-sight substrate footprint for oblique deposition through a
 * piecewise-constant resist aperture, in canonical physical micrometres.
 *
 * Exposure is intersected at multiple heights in every resist layer. Sampling
 * does NOT constitute an exact continuum solution for arbitrary nonconvex
 * apertures: callers must report the chosen height step and convergence.
 * This utility models shadow access only, not film thickness, resist sidewall
 * coating, surface nucleation, oxidation or electrical junction formation.
 */
export function substrateShadowFootprint(layers, beam = {}) {
  const thetaDeg = beam.thetaDeg ?? 0;
  const azimuthDeg = beam.azimuthDeg ?? 0;
  const heightStepUm = beam.heightStepUm ?? 0.05;
  const maxSamples = beam.maxSamples ?? 2048;
  if (!Number.isFinite(thetaDeg) || thetaDeg < 0 || thetaDeg >= 89)
    throw new RangeError('Tilt must be between 0° (inclusive) and 89° (exclusive).');
  if (!Number.isFinite(azimuthDeg)) throw new RangeError('Invalid deposition azimuth.');
  if (!Number.isFinite(heightStepUm) || heightStepUm <= 0)
    throw new RangeError('Height sampling step must be positive.');
  if (!Number.isInteger(maxSamples) || maxSamples < 2)
    throw new RangeError('Invalid maximum number of height samples.');
  if (!Array.isArray(layers) || layers.length === 0)
    throw new RangeError('At least one resist layer is required.');

  const rad = Math.PI / 180;
  const slope = Math.tan(thetaDeg * rad);
  const vx = slope * Math.cos(azimuthDeg * rad);
  const vy = slope * Math.sin(azimuthDeg * rad);
  let previousTop = 0;
  let visible = null;
  let sampleCount = 0;
  for (const layer of layers) {
    const { bottomUm, topUm, opening } = layer;
    if (
      !Number.isFinite(bottomUm) ||
      !Number.isFinite(topUm) ||
      Math.abs(bottomUm - previousTop) > EPS ||
      topUm <= bottomUm
    ) {
      throw new RangeError('Resist layers must be contiguous, ascending, and positive thickness.');
    }
    previousTop = topUm;
    const aperture = normalizeMulti(opening);
    if (aperture.length === 0) {
      return { footprint: [], sampleCount, heightStepUm, method: 'sampled-line-of-sight' };
    }
    const intervals = slope < EPS ? 0 : Math.ceil((topUm - bottomUm) / heightStepUm);
    if (sampleCount + intervals + 1 > maxSamples)
      throw new RangeError(
        'Shadow sampling exceeds the declared maximum; increase the step or budget.',
      );
    for (let j = 0; j <= intervals; j++) {
      const z = intervals ? bottomUm + ((topUm - bottomUm) * j) / intervals : bottomUm;
      const shifted =
        slope < EPS ? aperture : transformMulti(aperture, ([x, y]) => [x - z * vx, y - z * vy]);
      visible = visible === null ? shifted : intersection(visible, shifted);
      sampleCount++;
      if (!visible.length)
        return { footprint: [], sampleCount, heightStepUm, method: 'sampled-line-of-sight' };
      if (intervals === 0) break;
    }
  }
  return { footprint: visible || [], sampleCount, heightStepUm, method: 'sampled-line-of-sight' };
}

/** Evaluate the area change on step refinement; this is a diagnostic, not a general error bound. */
export function polygonAreaUm2(multipolygon) {
  const ringArea = (ring) => {
    let twice = 0;
    for (let i = 0; i < ring.length; ++i) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      twice += a[0] * b[1] - a[1] * b[0];
    }
    return Math.abs(twice) / 2;
  };
  return (multipolygon || []).reduce(
    (area, poly) =>
      area + ringArea(poly[0]) - poly.slice(1).reduce((s, hole) => s + ringArea(hole), 0),
    0,
  );
}
