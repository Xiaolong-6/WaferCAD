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
    viewZFraction = 0,
    maxPixelSpan = 0.5,
  } = {},
) {
  const empty = {
    mode: 'observe-only',
    qualified: false,
    candidates: 0,
    instanceWallSegments: 0,
    rawTwoPassTriangleEstimate: 0,
    smallestSpanPixels: null,
    largestSpanPixels: null,
    skippedTriangles: 0,
  };
  if (
    !farTier ||
    clipped ||
    zCollapsed ||
    !Number.isFinite(unitsPerPixel) ||
    unitsPerPixel <= 0 ||
    !Number.isFinite(viewZFraction) ||
    viewZFraction < 0.35 ||
    viewZFraction > 1 ||
    !Number.isFinite(maxPixelSpan) ||
    maxPixelSpan <= 0 ||
    maxPixelSpan > 0.5 ||
    !Array.isArray(sidewalls)
  ) {
    return empty;
  }
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
      // Vertical extent / world units per pixel overestimates the
      // screen-space vertical extent for oblique views. Never classify a
      // larger-than-half-pixel height as subpixel merely due to a top view.
      const spanPixels = Math.abs(part.z1 - part.z0) / unitsPerPixel;
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
