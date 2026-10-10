// R4 opt-in: a constant-Z, smooth planar cap has identical physical vertices
// in every XY instance chunk. Shared template bytes are read-only; per-object
// Section display Z mapping must use object translation, never write vertices.
// Fail closed for roughness, depth gradients, malformed or varying-Z geometry.
export function sharedFlatCapZ(
  geometry,
  { enabled = false, planarCap = false, adaptiveRough = false, appearance = null } = {},
) {
  if (!enabled || !planarCap || adaptiveRough || appearance) return null;
  if (!geometry || typeof geometry.getAttribute !== 'function') return null;
  if (geometry.userData?.roughGpuDisplacement) return null;
  if (geometry.getAttribute('annotationDepth')) return null;
  const positions = geometry.getAttribute('position');
  if (
    !positions ||
    !Number.isInteger(positions.count) ||
    positions.count < 3 ||
    positions.count > 1_000_000 ||
    typeof positions.getZ !== 'function'
  )
    return null;
  const z = positions.getZ(0);
  if (!Number.isFinite(z)) return null;
  for (let i = 1; i < positions.count; i++) {
    if (positions.getZ(i) !== z) return null;
  }
  return { z, vertexCount: positions.count };
}

// A constant-Z plane stays flat under any finite piecewise Section map.
// The exact mapped positions equal a translated canonical plane. The caller
// checks hidden-plane visibility and keeps the original material/triangles.
export function mappedFlatCapTranslation(record, state) {
  if (!record?.flatReadOnly || record.minZ !== record.maxZ || typeof state?.mapZ !== 'function')
    return null;
  const mapped = state.mapZ(record.minZ);
  if (!Number.isFinite(mapped)) return null;
  return mapped - record.minZ;
}
