// Default-off V3 exact-pass experiment. For an above-wafer camera,
// keep the original transparent BackSide -> FrontSide compositing order while
// excluding the opposite-facing horizontal cap from each GPU submission.
// Physical triangles, alpha, normals and canonical model are never mutated.
export function canTryElectricalVolumeCapPass({
  enabled = false,
  transparent = false,
  quality = false,
  fullArray = false,
  clipped = false,
  rough = false,
  cameraAbove = false,
  solid = null,
} = {}) {
  return (
    enabled === true &&
    transparent === true &&
    quality === true &&
    fullArray === true &&
    clipped === false &&
    rough === false &&
    cameraAbove === true &&
    Array.isArray(solid?.caps) &&
    solid.caps.length === 2 &&
    solid.caps.some((cap) => cap.normal === -1) &&
    solid.caps.some((cap) => cap.normal === 1) &&
    solid.caps.every(
      (cap) =>
        Number.isFinite(cap?.z) &&
        Math.abs(cap?.normal) === 1 &&
        Array.isArray(cap.polys),
    ) &&
    Array.isArray(solid?.slabs) &&
    solid.slabs.length > 0
  );
}

// Exact vertex indices, without vertex deduplication or geometric tolerance.
// The two per-pass draw lists preserve cap-before-wall buffer order, matching
// the visible triangles from Three.js's original DoubleSide two-pass draw.
export function electricalVolumePassIndices(capRanges, totalVertices) {
  if (
    !Array.isArray(capRanges) ||
    capRanges.length !== 2 ||
    !Number.isSafeInteger(totalVertices) ||
    totalVertices <= 0 ||
    totalVertices % 3 !== 0
  )
    return null;
  let firstSidewall = 0;
  let back = null;
  let front = null;
  for (const cap of capRanges) {
    if (
      !Number.isSafeInteger(cap.start) ||
      !Number.isSafeInteger(cap.count) ||
      cap.start !== firstSidewall ||
      cap.count <= 0 ||
      cap.count % 3 !== 0 ||
      ![-1, 1].includes(cap.normal)
    )
      return null;
    firstSidewall += cap.count;
    if (cap.normal === -1) back = cap;
    else front = cap;
  }
  if (!back || !front || firstSidewall >= totalVertices) return null;
  const indicesFor = (cap) => [
    ...Array.from({ length: cap.count }, (_, index) => cap.start + index),
    ...Array.from({ length: totalVertices - firstSidewall }, (_, index) => firstSidewall + index),
  ];
  return { back: indicesFor(back), front: indicesFor(front) };
}
