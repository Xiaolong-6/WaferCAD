// Exact, tolerance-free index map for repeated transparent array templates.
// The caller owns THREE.BufferGeometry conversion. These mappings preserve
// every triangle in its original order and share only bit-identical vertices,
// including normals and annotation depth.
export function exactTriangleVertexIndex(
  { position, normal, annotationDepth = null } = {},
  { minSavingFraction = 0.05 } = {},
) {
  if (
    !(position instanceof Float32Array) ||
    !(normal instanceof Float32Array) ||
    !position.length ||
    position.length % 9 !== 0 ||
    position.length !== normal.length ||
    (annotationDepth !== null &&
      (!(annotationDepth instanceof Float32Array) ||
        annotationDepth.length !== position.length / 3))
  ) {
    return null;
  }
  const count = position.length / 3;
  // WebGL1 deployments cannot assume 32-bit element indices. Keep the
  // original non-indexed representation for oversized templates.
  if (count > 65535) return null;

  const positionBits = new Uint32Array(position.buffer, position.byteOffset, position.length),
    normalBits = new Uint32Array(normal.buffer, normal.byteOffset, normal.length),
    depthBits = annotationDepth
      ? new Uint32Array(annotationDepth.buffer, annotationDepth.byteOffset, annotationDepth.length)
      : null,
    seen = new Map(),
    uniqueSources = [],
    indices = new Uint16Array(count);
  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * 3;
    // Key by the IEEE754 bit representation: never fuse even subtly
    // different positions, normals, +0/-0, or gradient-depth values.
    const key = depthBits
      ? `${positionBits[offset]}:${positionBits[offset + 1]}:${positionBits[offset + 2]}|${normalBits[offset]}:${normalBits[offset + 1]}:${normalBits[offset + 2]}|${depthBits[vertex]}`
      : `${positionBits[offset]}:${positionBits[offset + 1]}:${positionBits[offset + 2]}|${normalBits[offset]}:${normalBits[offset + 1]}:${normalBits[offset + 2]}`;
    let unique = seen.get(key);
    if (unique === undefined) {
      unique = uniqueSources.length;
      uniqueSources.push(vertex);
      seen.set(key, unique);
    }
    indices[vertex] = unique;
  }
  if (uniqueSources.length >= count * (1 - minSavingFraction)) return null;
  return { indices, uniqueSources: Uint16Array.from(uniqueSources) };
}
