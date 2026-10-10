// R2 opt-in camera interaction policy. This changes only OrbitControls
// inertia, never physical geometry, materials or draw submission ownership.
export function shouldDisableV4HeavyCameraDamping({
  enabled = false,
  sceneVariant = '',
  arrayInstances = 0,
  drawTriangles = 0,
} = {}) {
  const instances = Number(arrayInstances);
  const triangles = Number(drawTriangles);
  return (
    enabled === true &&
    sceneVariant === 'transparent' &&
    Number.isFinite(instances) &&
    instances >= 64 &&
    Number.isFinite(triangles) &&
    triangles >= 5_000_000
  );
}
