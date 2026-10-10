// Presentation-only optimization: smooth material caps have one physical Z
// plane, so their front and back cannot both be visible in the same view.
// Keep DoubleSide shading, but skip Three.js's redundant second draw pass.
// Never apply to sidewalls, rough surfaces, annotation volumes or ROI cuts.
// Electrical Region caps require an explicit default-off experiment opt-in.
export function canRenderPlanarCapInSinglePass({
  transparentScene,
  materialState,
  appearance,
  presentation,
} = {}) {
  return (
    transparentScene === true &&
    materialState?.transparent === true &&
    appearance == null &&
    presentation?.planarCap === true &&
    (presentation.kind === 'material-exterior' ||
      presentation.kind === 'material-interface' ||
      // Experimental only: a smooth Electrical Region cap is coplanar,
      // but extending the policy needs same-camera alpha/blend acceptance.
      (presentation.kind === 'electrical-surface' &&
        presentation.experimentalElectricalPlanarSinglePass === true))
  );
}
