// Default-off V3 experiment: keep canonical Electrical Region geometry and
// volume sidewalls exact while testing one transparent draw for planar caps.
// Mesh groups keep both cap planes in their source buffer order. The complete
// canvas parity gate decides whether this alternative presentation is safe.
export function canTryElectricalVolumeCapPass({
  enabled = false,
  transparent = false,
  quality = false,
  fullArray = false,
  clipped = false,
  rough = false,
  solid = null,
} = {}) {
  return (
    enabled === true &&
    transparent === true &&
    quality === true &&
    fullArray === true &&
    clipped === false &&
    rough === false &&
    Array.isArray(solid?.caps) &&
    solid.caps.length === 2 &&
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

export function electricalVolumeGeometryGroups(capVertices, totalVertices) {
  if (
    !Number.isSafeInteger(capVertices) ||
    !Number.isSafeInteger(totalVertices) ||
    capVertices <= 0 ||
    capVertices >= totalVertices ||
    capVertices % 3 !== 0 ||
    totalVertices % 3 !== 0
  )
    return null;

  return [
    { start: 0, count: capVertices, materialIndex: 0 },
    { start: capVertices, count: totalVertices - capVertices, materialIndex: 1 },
  ];
}
