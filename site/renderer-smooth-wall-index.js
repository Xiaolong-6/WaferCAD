// Reuse the two shared vertices of a perfectly planar, smooth sidewall quad.
// Triangle order remains [a,b,c], [a,c,d], and the full surface is retained.
// This helper is intentionally NOT used for rough, sloped, or annotation walls.
export function appendIndexedSmoothWallQuad(positions, normals, indices, a, b, c, d) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = c[2] - b[2];
  const nx = dy * dz;
  const ny = -dx * dz;
  const magnitude = Math.hypot(nx, ny) || 1;
  const normal = [nx / magnitude, ny / magnitude, 0];
  const firstVertex = positions.length / 3;
  positions.push(...a, ...b, ...c, ...d);
  normals.push(...normal, ...normal, ...normal, ...normal);
  indices.push(
    firstVertex,
    firstVertex + 1,
    firstVertex + 2,
    firstVertex,
    firstVertex + 2,
    firstVertex + 3,
  );
}

// These checks are for the exact flat-wall representation that can reuse
// normal and position data; no alpha, winding, contour or GPU mode changes.
export function canIndexSmoothSidewallParts(parts) {
  return (
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every(
      (part) =>
        part &&
        Array.isArray(part.p) &&
        Array.isArray(part.q) &&
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
