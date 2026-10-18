// Deterministic, owner-sampled 3D isosurface for opt-in physical SiO2.
// The finite Si material owner supplies the exact inner interface; the outer
// heightfields and rounded perimeter are adaptively sampled against the same
// exact 3D nearest-surface distance. Never substitute this for Process geometry.
import { createPhysicalFacetShellQuery } from './physical-facet-shell-owner.js';
import { physicalPyramidSolidMesh, signedPhysicalMeshVolume } from './physical-facet-surface.js';
import { samplePhysicalPyramidSlab } from './physical-facet-math.js';

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const areaXY = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const key = (p) => p.map((v) => (Object.is(v, -0) ? 0 : Number(v.toPrecision(13)))).join(',');
const edgeId = (a, b) => [key(a), key(b)].sort().join('|');

function auditClosed(triangles, label) {
  const edges = new Map();
  for (const tri of triangles) {
    const [a, b, c] = tri.vertices;
    if (!(Math.hypot(...cross(sub(b, a), sub(c, a))) > 1e-12))
      throw new RangeError(label + ' degenerate triangle');
    for (let i = 0; i < 3; i++) {
      const from = key(tri.vertices[i]),
        to = key(tri.vertices[(i + 1) % 3]);
      const id = [from, to].sort().join('|'),
        e = edges.get(id) || { forward: 0, backward: 0 };
      e[from < to ? 'forward' : 'backward']++;
      edges.set(id, e);
    }
  }
  if ([...edges.values()].some((e) => e.forward !== 1 || e.backward !== 1))
    throw new RangeError(label + ' nonmanifold/open surface');
  return { faces: triangles.length, edges: edges.size, invalidEdges: 0 };
}
function edgeBoundary(triangles) {
  const counts = new Map();
  for (const t of triangles)
    for (let i = 0; i < 3; i++) {
      const a = t[i],
        b = t[(i + 1) % 3],
        id = edgeId(a, b),
        found = counts.get(id);
      counts.set(id, found ? { ...found, count: found.count + 1 } : { a, b, count: 1 });
    }
  const edges = [...counts.values()].filter((e) => e.count === 1);
  const next = new Map(edges.map((e) => [key(e.a), e]));
  if (next.size !== edges.length || !edges.length)
    throw new RangeError('Facet exterior has invalid boundary');
  let cursor = edges[0].a,
    first = key(cursor),
    chain = [];
  for (let i = 0; i < edges.length; i++) {
    const e = next.get(key(cursor));
    if (!e) throw new RangeError('Facet perimeter disconnected');
    chain.push(e);
    cursor = e.b;
  }
  if (key(cursor) !== first) throw new RangeError('Facet perimeter does not close');
  return chain;
}
function cornerStencil(triangles, thickness) {
  const cache = new Map();
  function near(a, b) {
    const id = key(a) + '->' + key(b);
    if (!cache.has(id)) {
      const length = Math.hypot(...sub(a, b));
      const fraction = Math.min(0.24, (2 * thickness) / length);
      cache.set(
        id,
        a.map((v, i) => v + fraction * (b[i] - v)),
      );
    }
    return cache.get(id);
  }
  const out = [];
  for (const [a, b, c] of triangles) {
    if (areaXY(a, b, c) <= 1e-14) throw new RangeError('Inverted original physical facet');
    const ab = near(a, b),
      ba = near(b, a),
      bc = near(b, c),
      cb = near(c, b),
      ca = near(c, a),
      ac = near(a, c);
    out.push(
      [a, ab, ac],
      [b, bc, ba],
      [c, ca, cb],
      [ab, ba, bc],
      [ab, bc, cb],
      [ab, cb, ca],
      [ab, ca, ac],
    );
  }
  return out;
}
function extendRoundedPerimeter(triangles, thickness) {
  const chain = edgeBoundary(triangles),
    extended = [...triangles];
  const getNormal = (e) => {
    const dx = e.b[0] - e.a[0],
      dy = e.b[1] - e.a[1],
      length = Math.hypot(dx, dy);
    return [dy / length, -dx / length];
  };
  const unit = (p, n) => [p[0] + thickness * n[0], p[1] + thickness * n[1]];
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i],
      n = getNormal(e),
      a = e.a,
      b = e.b,
      ap = unit(a, n),
      bp = unit(b, n);
    extended.push([a, bp, b], [a, ap, bp]);
    const next = chain[(i + 1) % chain.length],
      nn = getNormal(next);
    const angle = Math.atan2(n[0] * nn[1] - n[1] * nn[0], n[0] * nn[0] + n[1] * nn[1]);
    if (angle > 1e-7) {
      if (angle > Math.PI + 0.001) throw new RangeError('Unsupported reentrant perimeter corner');
      const segments = Math.max(1, Math.ceil(angle / (Math.PI / 24)));
      const start = Math.atan2(n[1], n[0]);
      let previous = bp;
      for (let j = 1; j <= segments; j++) {
        const theta = start + (angle * j) / segments;
        const cur = unit(b, [Math.cos(theta), Math.sin(theta)]);
        extended.push([b, previous, cur]);
        previous = cur;
      }
    }
  }
  return extended;
}
function createRoot(owner, side) {
  const cache = new Map(),
    silicon = owner.descriptor.silicon,
    t = owner.descriptor.thicknessUm,
    d = silicon.domain;
  const direction = side === 'top' ? 1 : -1;
  return (x, y) => {
    const id = key([x, y]);
    if (cache.has(id)) return cache.get(id);
    const cx = Math.min(d.maxX, Math.max(d.minX, x)),
      cy = Math.min(d.maxY, Math.max(d.minY, y));
    const slab = samplePhysicalPyramidSlab(cx, cy, silicon);
    const z0 = side === 'top' ? slab.z1 : slab.z0;
    const point = (h) => [x, y, z0 + direction * h];
    const original = owner.closest(point(0)).distanceUm;
    if (original > t + 1e-7)
      throw new RangeError('Perimeter cannot reach the physical oxide surface');
    if (Math.abs(original - t) < 1e-10) {
      cache.set(id, z0);
      return z0;
    }
    let lo = 0,
      hi = t * 1.5;
    for (
      let attempt = 0;
      attempt < 9 && owner.sample(point(hi)).materialLayerId !== null;
      attempt++
    )
      hi *= 2;
    if (owner.sample(point(hi)).materialLayerId !== null)
      throw new RangeError('Physical oxide root could not be bracketed');
    for (let step = 0; step < 32; step++) {
      const mid = (lo + hi) / 2;
      if (owner.sample(point(mid)).materialLayerId === null) hi = mid;
      else lo = mid;
    }
    const z = z0 + (direction * (lo + hi)) / 2;
    if (Math.abs(owner.closest([x, y, z]).distanceUm - t) > 1e-8)
      throw new RangeError('Physical oxide root does not match material owner');
    cache.set(id, z);
    return z;
  };
}
function refineGraph(
  source,
  root,
  owner,
  t,
  { maxPasses = 12, maxTriangles = 25000, errorUm = 0.0005 } = {},
) {
  let faces = source.map((p) => p.map(([x, y]) => [x, y, root(x, y)]));
  let maximum = Infinity;
  for (let pass = 0; pass < maxPasses; pass++) {
    const edges = new Map(),
      marked = new Set();
    maximum = 0;
    function midpoint(a, b) {
      const id = edgeId(a, b);
      if (!edges.has(id)) {
        const x = (a[0] + b[0]) / 2,
          y = (a[1] + b[1]) / 2,
          z = (a[2] + b[2]) / 2;
        edges.set(id, {
          point: [x, y, root(x, y)],
          error: Math.abs(owner.closest([x, y, z]).distanceUm - t),
        });
      }
      return edges.get(id);
    }
    const triangleErrors = new Map();
    for (const p of faces) {
      const c = p[0].map((v, i) => (v + p[1][i] + p[2][i]) / 3);
      const error = Math.abs(owner.closest(c).distanceUm - t);
      triangleErrors.set(p, error);
      maximum = Math.max(maximum, error);
      for (let i = 0; i < 3; i++) {
        const e = midpoint(p[i], p[(i + 1) % 3]);
        maximum = Math.max(maximum, e.error);
        if (e.error > errorUm) marked.add(edgeId(p[i], p[(i + 1) % 3]));
      }
    }
    if (maximum <= errorUm) return { faces, passes: pass, maxErrorUm: maximum };
    const next = [],
      add = (a, b, c) => {
        if (!(areaXY(a, b, c) > 1e-16)) throw new RangeError('Inverted oxide graph surface');
        next.push([a, b, c]);
      };
    for (const p of faces) {
      const flags = [0, 1, 2].map((i) => marked.has(edgeId(p[i], p[(i + 1) % 3]))),
        count = flags.filter(Boolean).length;
      const mid = (i) => midpoint(p[i], p[(i + 1) % 3]).point;
      if (!count) {
        if (triangleErrors.get(p) > errorUm) {
          const c = p[0].map((v, i) => (v + p[1][i] + p[2][i]) / 3),
            v = [c[0], c[1], root(c[0], c[1])];
          add(p[0], p[1], v);
          add(p[1], p[2], v);
          add(p[2], p[0], v);
        } else next.push(p);
      } else if (count === 3) {
        const a = mid(0),
          b = mid(1),
          c = mid(2);
        add(p[0], a, c);
        add(a, p[1], b);
        add(c, b, p[2]);
        add(a, b, c);
      } else if (count === 1) {
        const i = flags.indexOf(true),
          a = p[i],
          b = p[(i + 1) % 3],
          c = p[(i + 2) % 3],
          d = mid(i);
        add(a, d, c);
        add(d, b, c);
      } else {
        const i = flags.indexOf(false),
          a = p[i],
          b = p[(i + 1) % 3],
          c = p[(i + 2) % 3],
          d = mid((i + 1) % 3),
          e = mid((i + 2) % 3);
        add(c, e, d);
        add(a, b, d);
        add(a, d, e);
      }
    }
    if (next.length > maxTriangles) throw new RangeError('Physical oxide mesh budget exceeded');
    faces = next;
  }
  throw new RangeError(
    'Physical oxide adaptive isosurface failed to meet geometric bound: ' + maximum,
  );
}
export function triangulatePhysicalFacetShell(descriptor, options = {}) {
  const maxCells = options.maxCells ?? 256,
    toleranceUm = options.maxSurfaceErrorUm ?? 0.0005;
  if (!(toleranceUm > 0 && toleranceUm < descriptor.thicknessUm))
    throw new RangeError('Invalid physical film tessellation tolerance');
  const owner = createPhysicalFacetShellQuery(descriptor, { maxCells }),
    t = owner.descriptor.thicknessUm;
  const silicon = physicalPyramidSolidMesh(owner.descriptor.silicon, { maxCells });
  const base = cornerStencil(
    silicon.triangles
      .filter((tri) => tri.face === 'top')
      .map((tri) => tri.vertices.map((v) => v.slice(0, 2))),
    t,
  );
  const expanded = extendRoundedPerimeter(base, t);
  const top = refineGraph(expanded, createRoot(owner, 'top'), owner, t, {
    errorUm: toleranceUm,
    maxTriangles: options.maxTriangles ?? 25000,
  });
  const bottomRoot = createRoot(owner, 'bottom');
  const topSurface = top.faces.map((vertices) => ({ face: 'top', vertices }));
  const bottomSurface = top.faces.map((vertices) => ({
    face: 'bottom',
    vertices: vertices.toReversed().map((p) => [p[0], p[1], bottomRoot(p[0], p[1])]),
  }));
  // Read the true perimeter *after* refinement. Outer side-wall edge segments
  // have exactly the same coordinates as the top and bottom envelope.
  const perimeter = edgeBoundary(top.faces);
  const side = [];
  for (const { a, b } of perimeter) {
    const ba = [a[0], a[1], bottomRoot(a[0], a[1])],
      bb = [b[0], b[1], bottomRoot(b[0], b[1])];
    side.push({ face: 'side', vertices: [a, ba, b] }, { face: 'side', vertices: [ba, bb, b] });
  }
  const exterior = [...topSurface, ...bottomSurface, ...side];
  const interfaceTriangles = silicon.triangles.map((tri) => ({
    face: tri.face,
    vertices: tri.vertices.toReversed().map((v) => [...v]),
  }));
  const audit = auditClosed(exterior, 'Outer SiO2');
  const inner = auditClosed(interfaceTriangles, 'Inner SiO2');
  // Audit every triangle's centroid and all edge midpoints, not only mesh
  // vertices or top-plane training samples. This also covers the 3D sidewalls
  // and independently reconstructed bottom film. Never relax the actual
  // owner-derived error bound to make a screenshot pass.
  let measuredError = 0;
  for (const triangle of exterior) {
    const [a, b, c] = triangle.vertices;
    for (const point of [
      a.map((v, i) => (v + b[i] + c[i]) / 3),
      a.map((v, i) => (v + b[i]) / 2),
      b.map((v, i) => (v + c[i]) / 2),
      c.map((v, i) => (v + a[i]) / 2),
    ]) {
      const phase = owner.sample(point);
      if (phase.materialLayerId === owner.descriptor.silicon.layerId)
        throw new RangeError('Triangulated oxide surface intersects solid Si');
      measuredError = Math.max(measuredError, Math.abs(owner.closest(point).distanceUm - t));
    }
  }
  if (measuredError > toleranceUm + 1e-8)
    throw new RangeError('Physical oxide exterior thickness error exceeds bound: ' + measuredError);
  const volume =
    signedPhysicalMeshVolume({ triangles: exterior }) - signedPhysicalMeshVolume(silicon);
  if (!(volume > 0)) throw new RangeError('Outer SiO2 has non-positive enclosed volume');
  return {
    kind: 'wafercad-physical-tessellated-oxide-evidence-v1',
    exactOwnerKind: owner.descriptor.kind,
    layerId: owner.descriptor.layerId,
    siliconLayerId: owner.descriptor.silicon.layerId,
    thicknessUm: t,
    exterior,
    interfaceTriangles,
    siliconTriangleCount: silicon.triangles.length,
    filmTriangleCount: exterior.length + interfaceTriangles.length,
    siliconVolumeUm3: signedPhysicalMeshVolume(silicon),
    triangulatedFilmVolumeUm3: volume,
    topology: { exterior: audit, interface: inner },
    accuracy: {
      maxSampledSurfaceErrorUm: measuredError,
      targetErrorUm: toleranceUm,
      refinementPasses: top.passes,
      method: 'owner-sampled adaptive XY isoheight and rounded perimeter',
    },
  };
}
