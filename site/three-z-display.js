// Read-only 3D presentation scaling, independent of physical Process geometry.
// The complete scene (caps, sidewalls, conformal films and borders) shares
// one Z display scale; never apply this multiplier to individual rough vertices.
export const THREE_Z_DISPLAY_FACTORS = Object.freeze([1, 2, 5, 10]);

export function normalizeThreeZDisplayFactor(value) {
  const factor = Number(value);
  return THREE_Z_DISPLAY_FACTORS.includes(factor) ? factor : 1;
}

export function threeZDisplayScale(baseScale, factor = 1) {
  const base = Number(baseScale);
  if (!Number.isFinite(base) || base <= 0) return 1;
  return base * normalizeThreeZDisplayFactor(factor);
}
