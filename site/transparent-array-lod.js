// Camera-bounded, presentation-only LOD for repeated transparent arrays.
// Do not use these simplifications for material geometry, History or GLB export.
const FAR_MIN_UM_PER_PIXEL = 0.01;
const FAR_LEVELS_UM_PER_PIXEL = [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56];

export function transparentArrayPresentationLod({
  transparent = false,
  fast = true,
  clipped = false,
  instanceCount = 0,
  unitsPerPixel = 0,
} = {}) {
  if (
    !transparent ||
    !fast ||
    clipped ||
    Number(instanceCount) < 64 ||
    !Number.isFinite(unitsPerPixel) ||
    unitsPerPixel <= FAR_MIN_UM_PER_PIXEL
  ) {
    return { tier: 'exact', displayTolerance: 0, flattenElectrical: false };
  }

  // Quantized tiers bound XY simplification to <=0.85 screen pixels in each
  // tier. The tier is part of the scene signature, so zooming back in restores
  // the original geometry instead of leaving a stale distant-only mesh.
  let level = FAR_LEVELS_UM_PER_PIXEL[0];
  for (const candidate of FAR_LEVELS_UM_PER_PIXEL) {
    if (unitsPerPixel >= candidate) level = candidate;
  }
  return {
    tier: `far-${level}`,
    displayTolerance: level * 0.85,
    flattenElectrical: true,
  };
}

export function electricalDisplaySolidForLod(originalSolid, visibleSolid, lod) {
  // Electrical volume interiors are only reduced when *both* true depth caps
  // survive the Section Z-collapse cut. If an inspection/collapse opens a cut
  // through the body, its physical wall must remain visible.
  if (
    !lod?.flattenElectrical ||
    !originalSolid ||
    !visibleSolid ||
    !Array.isArray(originalSolid.caps) ||
    originalSolid.caps.length < 2 ||
    !Array.isArray(visibleSolid.caps) ||
    visibleSolid.caps.length !== originalSolid.caps.length ||
    !Array.isArray(visibleSolid.slabs) ||
    !visibleSolid.slabs.length ||
    !Array.isArray(originalSolid.slabs) ||
    visibleSolid.slabs.length !== originalSolid.slabs.length ||
    visibleSolid.slabs.some(
      (slab, index) =>
        slab.z0 !== originalSolid.slabs[index]?.z0 ||
        slab.z1 !== originalSolid.slabs[index]?.z1,
    )
  ) {
    return visibleSolid;
  }
  return { ...visibleSolid, slabs: [] };
}
