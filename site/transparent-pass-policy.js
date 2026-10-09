// Presentation-only optimization: smooth material caps have one physical Z
// plane, so their front and back cannot both be visible in the same view.
// Keep DoubleSide shading, but skip Three.js's redundant second draw pass.
// Do not apply to sidewalls, rough surfaces, annotation volumes or ROI cuts.
export function canRenderPlanarCapInSinglePass({
  materialState,
  appearance,
  presentation,
} = {}) {
  return (
    materialState?.transparent === true &&
    appearance == null &&
    presentation?.planarCap === true &&
    (presentation.kind === 'material-exterior' || presentation.kind === 'material-interface')
  );
}
