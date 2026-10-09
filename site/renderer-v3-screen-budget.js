// V3 phase A: conservative screen-space *observability only*.
// Do not change any material/annotation geometry, GLB export or draw visibility.
// This measures possible far-field internal-wall candidates for later review.
export function buriedInterfaceSubpixelBudget(
  sidewalls,
  {
    farTier = false,
    clipped = false,
    zCollapsed = false,
    unitsPerPixel = 0,
    displayZScale = 1,
    viewZFraction = 0,
    maxPixelSpan = 0.5,
  } = {},
) {
  const empty = {
    mode: 'observe-only',
    qualified: false,
    exclusionReason: null,
    candidates: 0,
    instanceWallSegments: 0,
    rawTwoPassTriangleEstimate: 0,
    smallestSpanPixels: null,
    largestSpanPixels: null,
    skippedTriangles: 0,
  };
  const exclusionReason = !farTier
    ? 'not-far'
    : clipped
      ? 'roi'
      : zCollapsed
        ? 'z-collapse'
        : !Array.isArray(sidewalls)
          ? 'no-walls'
          : !Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0
            ? 'invalid-camera-scale'
            : !Number.isFinite(displayZScale) || displayZScale <= 0
              ? 'invalid-display-scale'
              : !Number.isFinite(viewZFraction) ||
                  viewZFraction < 0.35 ||
                  viewZFraction > 1
                ? 'edge-on-or-invalid-angle'
                : !Number.isFinite(maxPixelSpan) ||
                    maxPixelSpan <= 0 ||
                    maxPixelSpan > 0.5
                  ? 'invalid-pixel-threshold'
                  : null;
  if (exclusionReason) return { ...empty, exclusionReason };
  let candidates = 0;
  let instanceWallSegments = 0;
  let smallestSpanPixels = Infinity;
  let largestSpanPixels = 0;
  for (const owner of sidewalls) {
    // Only interior, smooth, translated array walls. Exteriors, ROI cuts,
    // rough boundaries and unique/non-array walls remain outside this probe.
    if (!owner?.buried || !Array.isArray(owner.instanceTranslations)) continue;
    const instances = owner.instanceTranslations.length;
    if (instances < 64) continue;
    const parts = Array.isArray(owner.parts) ? owner.parts : [owner];
    for (const part of parts) {
      if (
        !part ||
        part.lowerSurface?.appearance ||
        part.upperSurface?.appearance ||
        !Number.isFinite(part.z0) ||
        !Number.isFinite(part.z1) ||
        part.z0 === part.z1
      ) {
        continue;
      }
      // The 3D renderer magnifies physical Z through group.scale.z. Ignoring
      // it would misclassify visually large walls as subpixel. This remains
      // an observation at the camera target (perspective/nearer instances
      // need individual projected-error proof before any future culling).
      const spanPixels = (Math.abs(part.z1 - part.z0) * displayZScale) / unitsPerPixel;
      if (!(spanPixels <= maxPixelSpan)) continue;
      candidates++;
      instanceWallSegments += instances;
      smallestSpanPixels = Math.min(smallestSpanPixels, spanPixels);
      largestSpanPixels = Math.max(largestSpanPixels, spanPixels);
    }
  }
  return {
    mode: 'observe-only',
    qualified: true,
    exclusionReason: null,
    candidates,
    instanceWallSegments,
    // 2 triangles per quad * 2 DoubleSide passes * instance count.
    // This is a *raw upper-bound hypothesis*, not measured GPU submissions:
    // exact contour/collinear reduction and frustum clipping can reduce work.
    rawTwoPassTriangleEstimate: instanceWallSegments * 4,
    smallestSpanPixels: candidates ? smallestSpanPixels : null,
    largestSpanPixels: candidates ? largestSpanPixels : null,
    skippedTriangles: 0,
  };
}
