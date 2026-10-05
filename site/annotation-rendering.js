export const IMPLANT_DEPTH_GRADIENT = Object.freeze({
  outerDepth: 0,
  midDepth: 0.48,
  innerDepth: 1,
  outerAlpha: 0.72,
  midAlpha: 0.4,
  innerAlpha: 0.04,
});

// Clipping against host layers or Etch never restarts the original profile.
export function annotationDepthFraction(annotation, z) {
  const source = Number(annotation?.sourceZ),
    thickness = Number(annotation?.thickness),
    value = Number(z);
  if (![source, thickness, value].every(Number.isFinite) || !(thickness > 0)) return 0;
  const depth = annotation.face === 'back' ? value - source : source - value;
  return Math.max(0, Math.min(1, depth / thickness));
}

export function implantDepthAlphaScale(depth) {
  const value = Math.max(0, Math.min(1, Number(depth) || 0)),
    { midDepth, outerAlpha, midAlpha, innerAlpha } = IMPLANT_DEPTH_GRADIENT;
  if (value <= midDepth) {
    const t = midDepth > 0 ? value / midDepth : 0;
    return (outerAlpha + (midAlpha - outerAlpha) * t) / outerAlpha;
  }
  const t = midDepth < 1 ? (value - midDepth) / (1 - midDepth) : 1;
  return (midAlpha + (innerAlpha - midAlpha) * t) / outerAlpha;
}
