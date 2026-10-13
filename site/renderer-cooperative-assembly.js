// Scheduling policy for large 3D scenes. Geometry, mesh ownership and
// final render output remain independent of this yield decision.
export function shouldYieldDuringSceneAssembly({
  arrayInstances = 0,
  capCount = 0,
  sidewallCount = 0,
  annotationCount = 0,
} = {}) {
  return (
    arrayInstances >= 64 ||
    capCount + sidewallCount >= 96 ||
    annotationCount >= 32
  );
}
