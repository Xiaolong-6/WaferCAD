// Close a rectangular inspection cut using the ACTUAL displayed surface-mesh
// boundary. Independent Section samples cannot share the mesh's vertices and
// leave cracks at ROI planes. Canonical physical geometry is never modified.
const QUANTUM = 1e4; // shared-key precision only; emitted positions are untouched

function vertexKey(point) {
  return point.map((v) => Math.round(v * QUANTUM)).join(':');
}

function edgeKey(a, b) {
  const x = vertexKey(a),
    y = vertexKey(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function ringsFromEdges(edges, face, bounds) {
  const points = new Map(),
    adjacent = new Map();
  const addEdge = (a, b) => {
    const ka = vertexKey(a),
      kb = vertexKey(b);
    if (ka === kb) return;
    points.set(ka, a);
    points.set(kb, b);
    if (!adjacent.has(ka)) adjacent.set(ka, new Set());
    if (!adjacent.has(kb)) adjacent.set(kb, new Set());
    adjacent.get(ka).add(kb);
    adjacent.get(kb).add(ka);
  };
  for (const { a, b } of edges) addEdge(a, b);
  const [axis] = face;
  const other = axis === 0 ? 1 : 0;
  const limits = axis === 0 ? [bounds.minY, bounds.maxY] : [bounds.minX, bounds.maxX];
  for (const limit of limits) {
    const ends = [...adjacent].filter(
      ([id, near]) => near.size === 1 && Math.abs(points.get(id)[other] - limit) <= 1e-4,
    );
    ends.sort((a, b) => points.get(a[0])[2] - points.get(b[0])[2]);
    if (ends.length % 2)
      throw new RangeError('Continuous ROI corner has unmatched material endpoints');
    for (let i = 0; i < ends.length; i += 2)
      addEdge(points.get(ends[i][0]), points.get(ends[i + 1][0]));
  }
  for (const near of adjacent.values())
    if (near.size !== 2)
      throw new RangeError('Continuous ROI intersection has an open/branched material contour');
  const consumed = new Set(),
    rings = [];
  for (const start of adjacent.keys()) {
    if (consumed.has(start)) continue;
    const ring = [],
      seen = new Set();
    let previous = null,
      cursor = start;
    while (true) {
      if (seen.has(cursor)) {
        if (cursor !== start) throw new RangeError('Self-crossing ROI cap contour');
        break;
      }
      seen.add(cursor);
      consumed.add(cursor);
      ring.push(points.get(cursor));
      const near = [...adjacent.get(cursor)];
      const next = near.find((key) => key !== previous);
      if (!next) throw new RangeError('Disconnected ROI cap contour');
      previous = cursor;
      cursor = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function area(ring) {
  let result = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    result += a[0] * b[1] - b[0] * a[1];
  }
  return result / 2;
}

function contains(ring, point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function buildContinuousRectMeshCaps(THREE, croppedParts, bounds) {
  if (!bounds) return [];
  const faces = [
    [0, bounds.minX, [-1, 0, 0]],
    [0, bounds.maxX, [1, 0, 0]],
    [1, bounds.minY, [0, -1, 0]],
    [1, bounds.maxY, [0, 1, 0]],
  ];
  const results = [];
  for (const part of croppedParts) {
    if (part.positions.length % 9) throw new RangeError('Invalid cropped mesh positions');
    const allEdges = new Map();
    for (let i = 0; i < part.positions.length; i += 9) {
      const triangle = Array.from({ length: 3 }, (_, j) =>
        Array.from(part.positions.slice(i + j * 3, i + j * 3 + 3)),
      );
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3];
        const key = edgeKey(a, b);
        if (!allEdges.has(key)) allEdges.set(key, { a, b, count: 0 });
        allEdges.get(key).count++;
      }
    }
    const positions = [],
      normals = [];
    for (const face of faces) {
      const [axis, coordinate, normal] = face;
      const boundary = [...allEdges.values()].filter(
        ({ a, b, count }) =>
          count === 1 &&
          Math.abs(a[axis] - coordinate) <= 1e-4 &&
          Math.abs(b[axis] - coordinate) <= 1e-4,
      );
      if (!boundary.length) continue;
      const loops = ringsFromEdges(boundary, face, bounds);
      const planar = loops.map((points) =>
        points.map((p) => (axis === 0 ? [p[1], p[2]] : [p[0], p[2]])),
      );
      const parents = planar.map((ring, i) => {
        let parent = -1,
          size = Infinity;
        for (let j = 0; j < planar.length; j++) {
          if (i === j || Math.abs(area(planar[j])) <= Math.abs(area(ring))) continue;
          if (contains(planar[j], ring[0]) && Math.abs(area(planar[j])) < size) {
            parent = j;
            size = Math.abs(area(planar[j]));
          }
        }
        return parent;
      });
      const depth = (i) => (parents[i] === -1 ? 0 : depth(parents[i]) + 1);
      for (let i = 0; i < loops.length; i++) {
        if (depth(i) % 2) continue;
        const children = parents
          .map((p, j) => (p === i && depth(j) % 2 ? j : -1))
          .filter((j) => j >= 0);
        const paths = [i, ...children];
        const polygons = paths.map((j) => planar[j].map((p) => new THREE.Vector2(...p)));
        const xyz = paths.flatMap((j) => loops[j]);
        const triangleIndices = THREE.ShapeUtils.triangulateShape(polygons[0], polygons.slice(1));
        for (const triangle of triangleIndices) {
          const a = xyz[triangle[0]],
            b = xyz[triangle[1]],
            c = xyz[triangle[2]];
          const ux = b[0] - a[0],
            uy = b[1] - a[1],
            uz = b[2] - a[2];
          const vx = c[0] - a[0],
            vy = c[1] - a[1],
            vz = c[2] - a[2];
          const facing =
            (uy * vz - uz * vy) * normal[0] +
            (uz * vx - ux * vz) * normal[1] +
            (ux * vy - uy * vx) * normal[2];
          if (!Number.isFinite(facing) || Math.abs(facing) < 1e-12)
            throw new RangeError('Degenerate ROI cap triangle');
          const oriented = facing > 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
          for (const index of oriented) {
            positions.push(...xyz[index]);
            normals.push(...normal);
          }
        }
      }
    }
    if (positions.length)
      results.push({
        layerId: part.layerId,
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        triangles: positions.length / 9,
      });
  }
  return results;
}
