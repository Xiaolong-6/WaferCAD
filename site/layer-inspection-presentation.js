// View-only material focus shared by Section and the native Three.js renderer.
// A selected layer keeps its authored material appearance; other layers become
// neutral instead of changing physical visibility, opacity or depth ownership.
export const LAYER_INSPECTION_NEUTRAL = '#aab1ba';
export const LAYER_INSPECTION_DIM = 0.9;

export function layerInspectionTone(layerId, focusedLayerId) {
  if (focusedLayerId == null) return 'normal';
  return layerId != null && String(layerId) === String(focusedLayerId) ? 'focused' : 'deemphasized';
}

export function sectionInspectionFill(color, layerId, focusedLayerId) {
  return layerInspectionTone(layerId, focusedLayerId) === 'deemphasized'
    ? LAYER_INSPECTION_NEUTRAL
    : color;
}
