// Buried faces fade in only as their host material becomes transparent.
function normalizedOpacity(value) {
  const number = Number(value);
  return Math.max(0.1, Math.min(1, Number.isFinite(number) ? number : 1));
}
export function internalRevealFraction(materialOpacity) {
  return 1 - normalizedOpacity(materialOpacity);
}
export function buriedInterfaceOpacity(materialOpacity) {
  return 0.34 * internalRevealFraction(materialOpacity);
}
export function annotationSurfaceOpacity(materialOpacity, peakOpacity, exposed = false) {
  const weight = exposed
    ? normalizedOpacity(materialOpacity)
    : internalRevealFraction(materialOpacity);
  return Math.max(0, Math.min(1, (Number(peakOpacity) || 0) * weight));
}
