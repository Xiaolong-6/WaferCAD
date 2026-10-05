export const IMPLANT_DEPTH_GRADIENT = Object.freeze({
  outerDepth: 0,
  midDepth: 0.48,
  innerDepth: 1,
  outerAlpha: 0.72,
  midAlpha: 0.4,
  innerAlpha: 0.04,
});

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
