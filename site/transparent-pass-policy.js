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
 * A heightfield cap is a single zero-thickness skin, including when its Z
 * varies. Rendering it twice in a transparent DoubleSide pass composites the
 * same physical interface twice and amplifies per-triangle alpha seams.
 * Walls and volumetric annotations are intentionally excluded.
 */
export function canRenderRoughCapInSinglePass({
  transparentScene,
  materialState,
  appearance,
} = {}) {
  return (
    transparentScene === true &&
    materialState?.transparent === true &&
    appearance?.kind === 'rough'
  );
}
