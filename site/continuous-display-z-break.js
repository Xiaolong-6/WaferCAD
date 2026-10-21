// Presentation-only clipping for analytic Continuous Etch display meshes.
// Never mutate the canonical physical owner or source triangle arrays.
function clipHalfspace(triangle, z, keepAbove) {
  const inside = (v) => (keepAbove ? v[2] >= z : v[2] <= z);
  const result = [];
  let previous = triangle.at(-1);
  for (const current of triangle) {
    const priorInside = inside(previous);
    const currentInside = inside(current);
    if (priorInside !== currentInside) {
      const t = (z - previous[2]) / (current[2] - previous[2]);
      const interpolated = previous.map((v, i) => v + t * (current[i] - v));
      interpolated[2] = z;
      result.push(interpolated);
    }
    if (currentInside) result.push(current);
    previous = current;
  }
  return result;
}

export function clipContinuousDisplayZBreak(part, state) {
  if (!state || state.enabled === false) return part;
  if (!(Number.isFinite(state.top) && Number.isFinite(state.bottom) && state.top > state.bottom))
    throw new RangeError('Invalid continuous display Z Break');
  const { positions, normals } = part;
  if (positions.length !== normals.length || positions.length % 9)
    throw new RangeError('Invalid continuous display mesh');
  const output = [];
  const outputNormals = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    const face = Array.from({ length: 3 }, (_, i) => {
      const j = offset + 3 * i;
      return [positions[j], positions[j + 1], positions[j + 2], normals[j], normals[j + 1], normals[j + 2]];
    });
    for (const fragment of [
      clipHalfspace(face, state.top, true),
      clipHalfspace(face, state.bottom, false),
    ]) {
      for (let j = 1; j + 1 < fragment.length; j++) {
        const points = [fragment[0], fragment[j], fragment[j + 1]];
        const [a, b, c] = points;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) < 1e-11) continue;
        for (const p of points) {
          output.push(p[0], p[1], p[2]);
          const m = Math.hypot(p[3], p[4], p[5]) || 1;
          outputNormals.push(p[3] / m, p[4] / m, p[5] / m);
        }
      }
    }
  }
  return {
    ...part,
    positions: Float32Array.from(output),
    normals: Float32Array.from(outputNormals),
    triangles: output.length / 9,
  };
}
