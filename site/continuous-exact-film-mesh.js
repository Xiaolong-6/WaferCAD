// Exact planar thin-film display derived from the source Mask and canonical Z.
// Shared-edge-connected cap triangles become separate watertight solids: point
// contacts stay coincident, without modifying physical vertices or materials.
import { triangulatePolygon } from './polygon-triangulation.js';
import { unionGeometries } from './vector-geometry.js';

const key = (p) => `${Math.round(p[0] * 1e7)},${Math.round(p[1] * 1e7)}`;
const edgeKey = (a, b) => {
  const x = key(a),
    y = key(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

export function exactUnetchedFilmCandidates(owner) {
  const affected = new Set(owner.fronts.map((f) => f.layerId));
  const candidate = new Map();
  for (const region of owner.sourceModel.regions)
    for (const part of region.stack) {
      if (affected.has(part.layerId)) continue;
      if (!candidate.has(part.layerId)) candidate.set(part.layerId, []);
      candidate.get(part.layerId).push({ geom: region.geom, z0: part.z0, z1: part.z1 });
    }
  // Source regions split at other materials' edges even when this film is
  // unchanged, perfectly coplanar and physically connected. Their common
  // footprint can be merged for exact cap/sidewall extrusion. Never coalesce
  // different Z intervals: that would erase an actual height step.
  const sameZ = (a, b) => Math.abs(a - b) <= 1e-9;
  return new Map(
    [...candidate].flatMap(([id, items]) => {
      const first = items[0];
      if (!items.every((item) => sameZ(item.z0, first.z0) && sameZ(item.z1, first.z1))) return [];
      return [
        [
          id,
          {
            geom: items.length === 1 ? first.geom : unionGeometries(items.map((item) => item.geom)),
            z0: first.z0,
            z1: first.z1,
          },
        ],
      ];
    }),
  );
}

export function buildExactFilmComponents(THREE, geom, z0, z1, { maxTriangles = 1000000 } = {}) {
  if (!(Number.isFinite(z0) && Number.isFinite(z1) && z1 > z0))
    throw new RangeError('Invalid film Z span');
  const source = geom.flatMap((p) => triangulatePolygon(THREE, p));
  if (!source.length) throw new RangeError('No physical film cap triangles');
  const triangles = source.map((tri) => {
    const [a, b, c] = tri;
    const signed = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(signed) <= 1e-12) throw new RangeError('Degenerate planar cap');
    return signed > 0 ? [a, b, c] : [a, c, b];
  });
  const parent = triangles.map((_, i) => i);
  function root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  const owners = new Map();
  triangles.forEach((tri, i) => {
    for (let j = 0; j < 3; j++) {
      const e = edgeKey(tri[j], tri[(j + 1) % 3]);
      if (!owners.has(e)) owners.set(e, [i]);
      else {
        const v = owners.get(e);
        if (v.length !== 1) throw new RangeError('Nonmanifold film cap');
        parent[root(i)] = root(v[0]);
        v.push(i);
      }
    }
  });
  const groups = new Map();
  triangles.forEach((tri, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(tri);
  });
  const result = [];
  let all = 0;
  for (const group of groups.values()) {
    const edges = new Map(),
      pos = [],
      normals = [];
    const add = (points, n) => {
      for (const p of points) {
        pos.push(...p);
        normals.push(...n);
      }
    };
    for (const [a, b, c] of group) {
      add(
        [
          [a[0], a[1], z1],
          [b[0], b[1], z1],
          [c[0], c[1], z1],
        ],
        [0, 0, 1],
      );
      add(
        [
          [c[0], c[1], z0],
          [b[0], b[1], z0],
          [a[0], a[1], z0],
        ],
        [0, 0, -1],
      );
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const e = edgeKey(u, v);
        const x = edges.get(e);
        if (!x) edges.set(e, { u, v, count: 1, winding: 1 });
        else {
          x.count++;
          x.winding += key(x.u) === key(u) ? 1 : -1;
        }
      }
    }
    for (const edge of edges.values()) {
      if (edge.count === 2 && edge.winding === 0) continue;
      if (edge.count !== 1 || edge.winding !== 1)
        throw new RangeError('Nonmanifold film component');
      const { u, v } = edge,
        dx = v[0] - u[0],
        dy = v[1] - u[1],
        m = Math.hypot(dx, dy);
      if (!(m > 1e-12)) throw new RangeError('Degenerate film side');
      const n = [dy / m, -dx / m, 0];
      const a = [u[0], u[1], z0],
        b = [v[0], v[1], z0],
        c = [v[0], v[1], z1],
        d = [u[0], u[1], z1];
      add([a, b, c], n);
      add([a, c, d], n);
    }
    const trianglesCount = pos.length / 9;
    all += trianglesCount;
    if (all > maxTriangles) throw new RangeError('Exact film exceeds triangle budget');
    result.push({
      positions: Float32Array.from(pos),
      normals: Float32Array.from(normals),
      triangles: trianglesCount,
    });
  }
  return {
    kind: 'continuous-exact-film-components-v1',
    parts: result,
    triangles: all,
    capComponents: result.length,
    z0,
    z1,
  };
}
