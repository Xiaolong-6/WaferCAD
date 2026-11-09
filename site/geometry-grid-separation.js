// A conservative exact-integer disjointness witness for already persistent-grid
// material contours. Never quantize unsnapped input to manufacture separation.
const GRID = 10000000;
const lattice = (geometry) => {
  if (!Array.isArray(geometry)) return null;
  const polygons = [];
  let edges = 0;
  for (const polygon of geometry) {
    if (polygon.length !== 1) return null; // holes require a fuller topology proof
    const ring = [];
    for (const [x, y] of polygon[0]) {
      const raw = [x * GRID, y * GRID];
      // A near-grid coordinate is not a grid coordinate: rounding it could
      // conceal a positive-area contact that the general validator must reject.
      // Only accept values that round-trip exactly through the material grid.
      if (
        raw.some(
          (v, i) => !Number.isSafeInteger(Math.round(v)) || [x, y][i] !== Math.round(v) / GRID,
        )
      )
        return null;
      ring.push(raw.map((v) => BigInt(Math.round(v))));
    }
    if (ring.length < 4) return null;
    if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    if (ring.length < 3 || (edges += ring.length) > 2500) return null;
    let signed = 0n;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      signed += a[0] * b[1] - a[1] * b[0];
    }
    if (signed === 0n || !simpleRing(ring)) return null;
    polygons.push({ ring, sign: signed > 0n ? 1 : -1 });
  }
  return polygons;
};
const orient = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const onSegment = (a, b, p) =>
  orient(a, b, p) === 0n &&
  p[0] >= (a[0] < b[0] ? a[0] : b[0]) &&
  p[0] <= (a[0] > b[0] ? a[0] : b[0]) &&
  p[1] >= (a[1] < b[1] ? a[1] : b[1]) &&
  p[1] <= (a[1] > b[1] ? a[1] : b[1]);
function insideStrict(ring, p) {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    if (onSegment(a, b, p)) return false;
    if (a[1] > p[1] !== b[1] > p[1]) {
      const cross = orient(a, b, p);
      if (cross === 0n) return false;
      if (cross > 0n === b[1] > a[1]) inside = !inside;
    }
  }
  return inside;
}
function overlapIntervals(a, b, c, d) {
  const axis = a[0] === b[0] ? 1 : 0;
  const min = (x, y) => (x < y ? x : y),
    max = (x, y) => (x > y ? x : y);
  return (
    min(max(a[axis], b[axis]), max(c[axis], d[axis])) >
    max(min(a[axis], b[axis]), min(c[axis], d[axis]))
  );
}

function simpleRing(ring) {
  // Non-simple contours have ambiguous interiors; defer to the normal
  // validator instead of interpreting their even-odd winding here.
  if (ring.length > 256) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      const c = ring[j],
        d = ring[(j + 1) % ring.length];
      const ac = orient(a, b, c),
        ad = orient(a, b, d);
      const ca = orient(c, d, a),
        cb = orient(c, d, b);
      if (
        (ac * ad < 0n && ca * cb < 0n) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        return false;
    }
  }
  return true;
}
function disjointPolygons(left, right) {
  const a = left.ring,
    b = right.ring;
  const aSplits = a.map((point, i) => [point, a[(i + 1) % a.length]]),
    bSplits = b.map((point, i) => [point, b[(i + 1) % b.length]]);
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const u = b[j],
        v = b[(j + 1) % b.length];
      const pu = orient(p, q, u),
        pv = orient(p, q, v);
      const up = orient(u, v, p),
        uq = orient(u, v, q);
      if (pu === 0n && pv === 0n && overlapIntervals(p, q, u, v)) {
        const aligned = (q[0] - p[0]) * (v[0] - u[0]) + (q[1] - p[1]) * (v[1] - u[1]) > 0n;
        if (aligned === (left.sign === right.sign)) return false;
      }
      if (pu * pv < 0n && up * uq < 0n) return false;
      if (pu === 0n && onSegment(p, q, u)) aSplits[i].push(u);
      if (pv === 0n && onSegment(p, q, v)) aSplits[i].push(v);
      if (up === 0n && onSegment(u, v, p)) bSplits[j].push(p);
      if (uq === 0n && onSegment(u, v, q)) bSplits[j].push(q);
    }
  }
  const segmentInside = (splits, other) => {
    const doubled = other.map(([x, y]) => [x * 2n, y * 2n]);
    for (const points of splits) {
      const axis = points[0][0] === points[1][0] ? 1 : 0;
      points.sort((p, q) => (p[axis] < q[axis] ? -1 : p[axis] > q[axis] ? 1 : 0));
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1],
          next = points[i];
        if (prev[0] === next[0] && prev[1] === next[1]) continue;
        if (insideStrict(doubled, [prev[0] + next[0], prev[1] + next[1]])) return true;
      }
    }
    return false;
  };
  return (
    !segmentInside(aSplits, b) &&
    !segmentInside(bSplits, a) &&
    !a.some((point) => insideStrict(b, point)) &&
    !b.some((point) => insideStrict(a, point))
  );
}

/** True only where exact segments prove interiors cannot overlap.
 * Ambiguous, non-grid, hole-bearing or complex inputs fail closed (false).
 */
export function provablyDisjointGridGeometry(left, right) {
  const a = lattice(left),
    b = lattice(right);
  return Boolean(a && b && a.every((p) => b.every((q) => disjointPolygons(p, q))));
}
