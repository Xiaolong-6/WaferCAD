// Fast structural-edge extraction for non-indexed Continuous material faces.
// Matches Three.js EdgesGeometry's 4-decimal vertex welding and orientation
// contract, but interns vertices once and uses numeric edge-pair keys instead
// of building two long strings per triangle edge. Display only.
const KEY_STRIDE = 2097152; // > 3 * 500,000 source triangle vertices

export function continuousStructuralBorderPositions(positions, thresholdDegrees = 60) {
  if (!(positions instanceof Float32Array) || positions.length % 9 !== 0)
    throw new RangeError('Invalid Continuous structural-border triangles');
  if (!(Number.isFinite(thresholdDegrees) && thresholdDegrees >= 0 && thresholdDegrees <= 180))
    throw new RangeError('Invalid Continuous structural-border angle');
  if (positions.length / 9 > 500000)
    throw new RangeError('Continuous structural-border triangle budget exceeded');

  const ids = new Map();
  const edges = new Map();
  const vertices = [];
  const thresholdDot = Math.cos((thresholdDegrees * Math.PI) / 180);
  let nextId = 0;
  const keys = [0, 0, 0];
  for (let p = 0; p < positions.length; p += 9) {
    for (let j = 0; j < 3; j++) {
      const i = p + 3 * j;
      const key = `${Math.round(positions[i] * 10000)},${Math.round(positions[i + 1] * 10000)},${Math.round(positions[i + 2] * 10000)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = nextId++;
        ids.set(key, id);
      }
      keys[j] = id;
    }
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[2] === keys[0]) continue;
    const abx = positions[p + 3] - positions[p];
    const aby = positions[p + 4] - positions[p + 1];
    const abz = positions[p + 5] - positions[p + 2];
    const acx = positions[p + 6] - positions[p];
    const acy = positions[p + 7] - positions[p + 1];
    const acz = positions[p + 8] - positions[p + 2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    for (let j = 0; j < 3; j++) {
      const next = (j + 1) % 3;
      const forward = keys[j] * KEY_STRIDE + keys[next];
      const backward = keys[next] * KEY_STRIDE + keys[j];
      const sibling = edges.get(backward);
      if (sibling) {
        if (nx * sibling.nx + ny * sibling.ny + nz * sibling.nz <= thresholdDot) {
          const i = p + 3 * j;
          const k = p + 3 * next;
          vertices.push(positions[i], positions[i + 1], positions[i + 2]);
          vertices.push(positions[k], positions[k + 1], positions[k + 2]);
        }
        edges.set(backward, null);
      } else if (!edges.has(forward)) {
        edges.set(forward, { p: p + 3 * j, q: p + 3 * next, nx, ny, nz });
      }
    }
  }
  for (const edge of edges.values()) {
    if (!edge) continue;
    vertices.push(positions[edge.p], positions[edge.p + 1], positions[edge.p + 2]);
    vertices.push(positions[edge.q], positions[edge.q + 1], positions[edge.q + 2]);
  }
  return Float32Array.from(vertices);
}
