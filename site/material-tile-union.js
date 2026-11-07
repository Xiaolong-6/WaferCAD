import { pointInMulti } from './vector-geometry.js';

const cross = (a, b) => BigInt(a[0]) * BigInt(b[1]) - BigInt(a[1]) * BigInt(b[0]);
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const key = (p) => `${p[0]},${p[1]}`;
function area2(ring) {
  let value = 0n;
  for (let i = 0; i < ring.length; i++) value += cross(ring[i], ring[(i + 1) % ring.length]);
  return value;
}
function greaterTurn(incoming, a, b) {
  const half = (v) => {
    const c = cross(incoming, v),
      d = BigInt(incoming[0]) * BigInt(v[0]) + BigInt(incoming[1]) * BigInt(v[1]);
    return c > 0n || (c === 0n && d < 0n) ? 1 : 0;
  };
  const ha = half(a),
    hb = half(b);
  return ha !== hb ? ha > hb : cross(b, a) > 0n;
}

/** Exact edge cancellation for ALREADY disjoint, shared-node material tiles.
 * Returns null for non-grid coordinates, unmatched duplicate directed edges,
 * graph vertices or unowned holes. Caller then uses ordinary Boolean union.
 * This must never repair or validate overlapping material inputs.
 */
export function unionMaterialTiles(geometries, { gridScale = 10000 } = {}) {
  if (![10000, 10000000].includes(gridScale))
    throw new RangeError('Unsupported material tile grid.');
  const GRID = gridScale;
  const edges = new Map();
  for (const geometry of geometries)
    for (const polygon of geometry)
      for (let j = 0; j < polygon.length; j++) {
        if (polygon[j].length < 3) return null;
        let ring = polygon[j].map(([x, y]) => [x * GRID, y * GRID]);
        if (
          ring.some((p) =>
            p.some(
              (x) =>
                !Number.isSafeInteger(Math.round(x)) ||
                Math.abs(x - Math.round(x)) > Math.max(1e-6, Math.abs(x) * Number.EPSILON * 2),
            ),
          )
        )
          return null;
        ring = ring.map((p) => p.map(Math.round));
        if (key(ring[0]) === key(ring.at(-1))) ring.pop();
        const signed = area2(ring);
        if (signed === 0n) return null;
        if (signed > 0n !== (j === 0)) ring.reverse();
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length],
            from = key(a),
            to = key(b);
          if (from === to) continue;
          const forward = `${from}>${to}`,
            reverse = `${to}>${from}`;
          if (edges.has(reverse)) {
            const previous = edges.get(reverse);
            if (previous.count > 1) previous.count--;
            else edges.delete(reverse);
          } else {
            if (edges.has(forward)) edges.get(forward).count++;
            else edges.set(forward, { a, b, from, to, count: 1 });
          }
        }
      }
  if (!edges.size) return [];
  // Shared snap rounding can leave a zero-area out-and-back spur. Count all
  // directed occurrences before rejecting duplicates: a later opposite edge
  // can cancel an earlier temporary multiplicity. Real duplicates still fail.
  if ([...edges.values()].some((edge) => edge.count !== 1)) return null;
  const outgoing = new Map();
  for (const [id, e] of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, new Set());
    outgoing.get(e.from).add(id);
  }
  const remaining = new Set(edges.keys()),
    loops = [];
  while (remaining.size) {
    let id = remaining.values().next().value;
    const first = edges.get(id),
      ring = [first.a],
      start = first.from;
    for (let count = 0; count <= edges.size; count++) {
      const edge = edges.get(id);
      if (!remaining.delete(id)) return null;
      outgoing.get(edge.from).delete(id);
      ring.push(edge.b);
      if (edge.to === start) break;
      const options = outgoing.get(edge.to);
      if (!options?.size) return null;
      const incoming = subtract(edge.b, edge.a);
      let next;
      for (const candidate of options)
        if (
          next == null ||
          greaterTurn(
            incoming,
            subtract(edges.get(candidate).b, edge.b),
            subtract(edges.get(next).b, edge.b),
          )
        )
          next = candidate;
      id = next;
      if (count === edges.size) return null;
    }
    const signed = area2(ring.slice(0, -1));
    if (signed === 0n) return null;
    // These are derived occluder boundaries, so exact collinear source nodes
    // need not be carried into thousands of redundant swept edge quads.
    const open = ring.slice(0, -1);
    const corners = open.filter((p, i) => {
      const before = subtract(p, open[(i + open.length - 1) % open.length]);
      const after = subtract(open[(i + 1) % open.length], p);
      return cross(before, after) !== 0n || before[0] * after[0] + before[1] * after[1] < 0;
    });
    if (corners.length < 3) return null;
    corners.push(corners[0]);
    loops.push({ ring: corners.map((p) => p.map((x) => x / GRID)), signed });
  }
  const outer = loops.filter((l) => l.signed > 0n).map((l) => ({ ...l, polygon: [l.ring] }));
  for (const hole of loops.filter((l) => l.signed < 0n)) {
    let owner;
    for (const candidate of outer) {
      if (candidate.signed <= -hole.signed) continue;
      if (!hole.ring.some((p) => pointInMulti(p, [[candidate.ring]]))) continue;
      if (!owner || candidate.signed < owner.signed) owner = candidate;
    }
    if (!owner) return null;
    owner.polygon.push(hole.ring);
  }
  return outer.map((o) => o.polygon);
}
