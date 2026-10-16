// Presentation-only optimization: smooth material caps have one physical Z
// plane, so their front and back cannot both be visible in the same view.
// Keep DoubleSide shading, but skip Three.js's redundant second draw pass.
// Sidewalls, annotations and ROI cuts retain the original two-pass policy.
// Rough physical exterior caps can be opted in separately by the scene builder.
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

// A rough cap is an open two-dimensional material surface, not a closed
// volumetric shell. Every source triangle must contribute at most once in
// transparent mode. Three.js's default two-pass DoubleSide rendering sorts
// back-facing facets ahead of front-facing facets even when neighboring
// rough triangles interleave in depth. Restrict this optimization to physical
// exterior caps; buried interfaces and annotation/cut geometry retain two passes.
export function canRenderRoughExteriorCapInSinglePass({
  transparentScene,
  materialState,
  appearance,
  presentation,
} = {}) {
  return (
    transparentScene === true &&
    materialState?.transparent === true &&
    appearance?.kind === 'rough' &&
    presentation?.roughCap === true &&
    presentation?.kind === 'material-exterior'
  );
}
