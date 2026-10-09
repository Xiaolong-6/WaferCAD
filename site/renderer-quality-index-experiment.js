// V3 Quality-only opt-in experiment. Exact planar, smooth quadrilateral
// surface topology with four vertices + original six triangle indices.
// Indexing cannot be applied across corners/edge normals or depth gradients.
// This changes only display BufferGeometry, never canonical geometry or GLB.
export function canIndexSmoothWalls(parts) {
  return (
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every((part) =>
      part &&
      Array.isArray(part.p) &&
      part.p.length >= 2 &&
      Array.isArray(part.q) &&
      part.q.length >= 2 &&
      [part.p[0], part.p[1], part.q[0], part.q[1], part.z0, part.z1].every(
        Number.isFinite,
      ) &&
      !part.lowerSurface?.appearance &&
      !part.upperSurface?.appearance &&
      !(Number.isFinite(Number(part.lowerDepth)) &&
        Number.isFinite(Number(part.upperDepth))),
    )
  );
}

export function pushIndexedSmoothWall(positions, normals, indices, a, b, c, d) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ],
    length = Math.hypot(...cross) || 1,
    normal = cross.map((value) => value / length),
    offset = positions.length / 3;
  positions.push(...a, ...b, ...c, ...d);
  normals.push(...normal, ...normal, ...normal, ...normal);
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}
