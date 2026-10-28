import { intersection, rectMulti, unionGeometries } from './vector-geometry.js';
import { triangulatePolygon } from './polygon-triangulation.js';
// Disposable horizontal cross-section faces for the Continuous display path.
// All vertices are derived from the displayed surface triangles. The physical
// Material Owner and stored model are never modified.
const KEY_SCALE = 10000;
const vertexKey = ([x, y]) => `${Math.round(x * KEY_SCALE)}:${Math.round(y * KEY_SCALE)}`;
const area = (ring) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}
function trianglePlaneSegment(tri, z) {
  const eps = 1e-5;
  const points = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i],
      b = tri[(i + 1) % 3];
    const da = a[2] - z,
      db = b[2] - z;
    if (Math.abs(da) <= eps && Math.abs(db) <= eps) continue;
    if (Math.abs(da) <= eps) points.push([a[0], a[1]]);
    else if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  const unique = [...new Map(points.map((p) => [vertexKey(p), p])).values()];
  return unique.length === 2 ? unique : null;
}
function ringsAtPlane(parts, z) {
  const adjacency = new Map(),
    coords = new Map(),
    counts = new Map();
  for (const part of parts) {
    const data = part.positions;
    if (!data || data.length % 9) throw new RangeError('Invalid Continuous Z Break cap source');
    for (let i = 0; i < data.length; i += 9) {
      const tri = [
        [data[i], data[i + 1], data[i + 2]],
        [data[i + 3], data[i + 4], data[i + 5]],
        [data[i + 6], data[i + 7], data[i + 8]],
      ];
      const segment = trianglePlaneSegment(tri, z);
      if (!segment) continue;
      const [a, b] = segment,
        ak = vertexKey(a),
        bk = vertexKey(b);
      if (ak === bk) continue;
      coords.set(ak, a);
      coords.set(bk, b);
      const k = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
      counts.set(k, { a: ak, b: bk, n: (counts.get(k)?.n || 0) + 1 });
    }
  }
  for (const { a, b, n } of counts.values()) {
    // Two coincident source triangles on an interface do not create two cut boundaries.
    if (n % 2 === 0) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }
  for (const links of adjacency.values())
    if (links.size !== 2) throw new RangeError('Open or branched Continuous Z Break cap');
  const consumed = new Set(),
    rings = [];
  for (const start of adjacency.keys()) {
    if (consumed.has(start)) continue;
    const ring = [];
    let prev = null,
      at = start;
    do {
      if (consumed.has(at)) throw new RangeError('Self-intersecting Continuous Z Break cap');
      consumed.add(at);
      ring.push(coords.get(at));
      const next = [...adjacency.get(at)].find((k) => k !== prev);
      prev = at;
      at = next;
    } while (at !== start);
    if (ring.length >= 3 && Math.abs(area(ring)) > 1e-10) rings.push(ring);
  }
  return rings;
}
export function buildContinuousZBreakCaps(THREE, parts, collapse) {
  if (!collapse || collapse.enabled === false) return [];
  const results = [];
  for (const [z, nz] of [
    [collapse.top, -1],
    [collapse.bottom, 1],
  ]) {
    if (!Number.isFinite(z)) throw new RangeError('Invalid Continuous Z Break cap Z');
    const rings = ringsAtPlane(parts, z);
    const parents = rings.map((ring, i) => {
      let parent = -1,
        parentArea = Infinity;
      for (let j = 0; j < rings.length; j++) {
        const size = Math.abs(area(rings[j]));
        if (i === j || size <= Math.abs(area(ring)) || size >= parentArea) continue;
        if (contains(rings[j], ring[0])) {
          parent = j;
          parentArea = size;
        }
      }
      return parent;
    });
    const depth = (i) => (parents[i] < 0 ? 0 : 1 + depth(parents[i]));
    const positions = [],
      normals = [];
    for (let i = 0; i < rings.length; i++) {
      if (depth(i) % 2) continue;
      const children = parents
        .map((p, j) => (p === i && depth(j) % 2 ? j : -1))
        .filter((j) => j >= 0);
      const polygons = [i, ...children].map((j) => rings[j].map((xy) => new THREE.Vector2(...xy)));
      const verts = [i, ...children].flatMap((j) => rings[j]);
      for (const triangle of THREE.ShapeUtils.triangulateShape(polygons[0], polygons.slice(1))) {
        const [a, b, c] = triangle.map((k) => verts[k]);
        const signed = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(signed) < 1e-12) continue;
        const ordered = signed * nz > 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
        for (const j of ordered) {
          positions.push(verts[j][0], verts[j][1], z);
          normals.push(0, 0, nz);
        }
      }
    }
    if (positions.length)
      results.push({
        z,
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        triangles: positions.length / 9,
      });
  }
  return results;
}

// Unreleased 2.5D layers have an exact planar owner at each physical Z.
// Use that instead of approximating a contour from a sampled display mesh,
// which may have intentionally omitted buried interfaces.
export function buildContinuousPlanarZBreakCaps(THREE, owner, layerId, collapse, roiBounds = null) {
  if (!collapse || collapse.enabled === false) return [];
  if (owner.fronts.some((front) => front.layerId === layerId))
    throw new RangeError('Released material requires native mesh Z slicing');
  const results = [];
  for (const [z, nz] of [
    [collapse.top, -1],
    [collapse.bottom, 1],
  ]) {
    if (!Number.isFinite(z)) throw new RangeError('Invalid Continuous Z Break plane');
    const footprints = owner.sourceModel.regions.flatMap((region) =>
      region.stack.some(
        (part) => part.layerId === layerId && z > part.z0 + 1e-8 && z < part.z1 - 1e-8,
      )
        ? [region.geom]
        : [],
    );
    if (!footprints.length) continue;
    let mask = unionGeometries(footprints);
    if (roiBounds) {
      const width = roiBounds.maxX - roiBounds.minX;
      const height = roiBounds.maxY - roiBounds.minY;
      mask = intersection(
        mask,
        rectMulti(
          width,
          height,
          (roiBounds.maxX + roiBounds.minX) / 2,
          (roiBounds.maxY + roiBounds.minY) / 2,
        ),
      );
    }
    const positions = [],
      normals = [];
    for (const polygon of mask) {
      for (const triangle of triangulatePolygon(THREE, polygon)) {
        const [a, b, c] = triangle;
        const signed = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(signed) < 1e-12) continue;
        const ordered = signed * nz > 0 ? triangle : [a, c, b];
        for (const point of ordered) {
          positions.push(point[0], point[1], z);
          normals.push(0, 0, nz);
        }
      }
    }
    if (positions.length)
      results.push({
        z,
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        triangles: positions.length / 9,
      });
  }
  return results;
}
