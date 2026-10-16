// Geometry-only triangle emission; preserves the former per-triangle cross
// product, normalization, vertex order and optional annotation depths.
// Avoid per-triangle normal/edge/unit arrays in dense sidewall assembly.
export function appendSidewallTriangle(
  positions,
  normals,
  annotationDepths,
  a,
  b,
  c,
  depths = null,
) {
  const abX = b[0] - a[0];
  const abY = b[1] - a[1];
  const abZ = b[2] - a[2];
  const acX = c[0] - a[0];
  const acY = c[1] - a[1];
  const acZ = c[2] - a[2];
  const normalX = abY * acZ - abZ * acY;
  const normalY = abZ * acX - abX * acZ;
  const normalZ = abX * acY - abY * acX;
  const magnitude = Math.hypot(normalX, normalY, normalZ) || 1;
  const unitX = normalX / magnitude;
  const unitY = normalY / magnitude;
  const unitZ = normalZ / magnitude;

  positions.push(...a, ...b, ...c);
  normals.push(unitX, unitY, unitZ, unitX, unitY, unitZ, unitX, unitY, unitZ);
  if (depths) annotationDepths.push(...depths);
}
