// The glTF POSITION accessor is Float32. Keep large wafer coordinates in a
// node's Float64 JSON transform and store vertices relative to that node.
// This is export-only: canonical Process coordinates remain unchanged.
export function glbCapLocalOrigin(cap) {
  const first = cap?.polys?.[0]?.[0]?.[0] || [0, 0];
  return [finite(first[0]), finite(first[1]), finite(cap?.z)];
}

export function glbSidewallLocalOrigin(parts) {
  const first = parts?.[0] || {};
  return [finite(first.p?.[0]), finite(first.p?.[1]), finite(first.z0)];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function glbWorldAtFloat32Precision(value, axis, origin = null) {
  return origin ? origin[axis] + Math.fround(value - origin[axis]) : Math.fround(value);
}

export function glbLocalFloat32Positions(positions, origin = null) {
  if (!origin) return new Float32Array(positions);
  const result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++)
    result[i] = positions[i] - origin[i % 3];
  return result;
}

export function glbWorldBoundaryPositions(positions, origin = null) {
  if (!origin) return positions;
  const result = new Float64Array(positions.length);
  for (let i = 0; i < positions.length; i++)
    result[i] = positions[i] + origin[i % 3];
  return result;
}
