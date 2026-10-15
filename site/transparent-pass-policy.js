// Presentation-only optimization: smooth material caps have one physical Z
// plane, so their front and back cannot both be visible in the same view.
// Keep DoubleSide shading, but skip Three.js's redundant second draw pass.
// Do not apply to sidewalls, rough surfaces, annotation volumes or ROI cuts.
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
    (presentation.kind === 'material-exterior' || presentation.kind === 'material-interface')
  );
}

/**
 * Internal rough layers contain two physically distinct nearby heightfield
 * skins. Keep their colored fill for material context, but de-emphasize the
 * buried one in translucent inspection so multiple unresolved interfaces do
 * not overpower the real section contours. This is presentation only.
 */
export function transparentInterfaceOpacity(opacity, { rough = false } = {}) {
  const alpha = Math.max(0, Math.min(1, Number(opacity) || 0));
  return rough
    ? Math.max(0.025, Math.min(0.1, alpha * 0.12))
    : Math.max(0.035, Math.min(0.34, alpha * 0.42));
}
