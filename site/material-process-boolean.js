import Clipper from './vendor/clipper-lib.js';
import { unionGeometries as vectorUnion, pointInMulti } from './vector-geometry.js';

// Clipper 6.4.2 predates native BigInt. Keep its exact full-range slope
// predicates, using native integer multiplication instead of JSBN objects.
// The input path budget below guarantees exact safe-integer differences.
// Small-range predicates retain the upstream implementation unchanged.
const equalProducts = (a, b, c, d) => BigInt(a) * BigInt(b) === BigInt(c) * BigInt(d);
for (const [name, exact] of [
  ['SlopesEqual3', (a, b) => equalProducts(a.Delta.Y, b.Delta.X, a.Delta.X, b.Delta.Y)],
  ['SlopesEqual4', (a, b, c) => equalProducts(a.Y - b.Y, b.X - c.X, a.X - b.X, b.Y - c.Y)],
  ['SlopesEqual5', (a, b, c, d) => equalProducts(a.Y - b.Y, c.X - d.X, a.X - b.X, c.Y - d.Y)],
]) {
  const original = Clipper.ClipperBase[name];
  Clipper.ClipperBase[name] = (...args) => (args.at(-1) ? exact(...args) : original(...args));
}

// Shared output vertices are exact boundary witnesses. Avoid re-scanning an
// entire linked polygon for each identical vertex while preserving Clipper's
// original point-in-polygon decision for every other point. Build the lookup
// only after repeated boundary decisions: most joins finish on an early point.
// Brent's cycle guard avoids allocating a second node set for every join.
// Do not cache linked rings across calls: JoinCommonEdges mutates them in place.
Clipper.Clipper.prototype.Poly2ContainsPoly1 = function (first, second) {
  const points = [];
  let point = second,
    anchor = second,
    power = 1,
    distance = 0;
  do {
    if (!point?.Pt || points.length >= 1500000)
      throw Error('Malformed or over-budget Clipper output ring.');
    if (!Number.isSafeInteger(point.Pt.X) || !Number.isSafeInteger(point.Pt.Y))
      throw Error('Non-integer Clipper output point.');
    points.push(point.Pt);
    point = point.Next;
    distance++;
    if (point !== second && point === anchor) throw Error('Malformed Clipper output ring.');
    if (distance === power) {
      anchor = point;
      power *= 2;
      distance = 0;
    }
  } while (point !== second);
  let vertices,
    boundary = 0,
    count = 0;
  point = first;
  anchor = first;
  power = 1;
  distance = 0;
  do {
    if (!point?.Pt || count++ >= 1500000)
      throw Error('Malformed or over-budget Clipper output ring.');
    const shared = point.Pt.X === second.Pt.X && point.Pt.Y === second.Pt.Y;
    const result =
      shared || vertices?.has(`${point.Pt.X}|${point.Pt.Y}`)
        ? -1
        : this.PointInPolygon(point.Pt, second);
    if (result >= 0) return result > 0;
    if (!vertices && ++boundary === 4) vertices = new Set(points.map((p) => `${p.X}|${p.Y}`));
    point = point.Next;
    distance++;
    if (point !== first && point === anchor) throw Error('Malformed Clipper output ring.');
    if (distance === power) {
      anchor = point;
      power *= 2;
      distance = 0;
    }
  } while (point !== first);
  return true;
};

// Use a fine internal integer lattice; the owning kernel still performs its
// shared-edge 0.1 nm persistence rounding only after assembling the dose.
const SCALE = 10000000;
export function materialGeometryArea(geometry) {
  const area = (ring) => {
    const origin = ring[0];
    let sum = 0,
      correction = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i];
      const term =
        (a[0] - origin[0]) * (b[1] - origin[1]) -
        (b[0] - origin[0]) * (a[1] - origin[1]) -
        correction;
      const next = sum + term;
      correction = next - sum - term;
      sum = next;
    }
    return Math.abs(sum) / 2;
  };
  let sum = 0,
    correction = 0;
  for (const polygon of geometry) {
    const value = area(polygon[0]) - polygon.slice(1).reduce((n, r) => n + area(r), 0) - correction;
    const next = sum + value;
    correction = next - sum - value;
    sum = next;
  }
  return sum;
}
const pathCache = new WeakMap();
const boundsCache = new WeakMap();
const polygonBoundsCache = new WeakMap();
const ringBoundsCache = new WeakMap();
const polygonIndexes = new WeakMap(),
  holeIndexes = new WeakMap();
const contactEdges = new WeakMap();
function buildBoundsTree(items, getBounds) {
  const entries = items.map((item, index) => ({ item, index, box: getBounds(item) }));
  const build = (selected) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const e of selected) {
      box[0] = Math.min(box[0], e.box[0]);
      box[1] = Math.min(box[1], e.box[1]);
      box[2] = Math.max(box[2], e.box[2]);
      box[3] = Math.max(box[3], e.box[3]);
    }
    if (selected.length <= 12) return { box, entries: selected };
    const axis = box[2] - box[0] >= box[3] - box[1] ? 0 : 1;
    selected.sort((a, b) => a.box[axis] + a.box[axis + 2] - (b.box[axis] + b.box[axis + 2]));
    const middle = selected.length >>> 1;
    return { box, left: build(selected.slice(0, middle)), right: build(selected.slice(middle)) };
  };
  return build(entries);
}
function queryBoundsTree(tree, box, result = []) {
  if (!overlapBounds(tree.box, box)) return result;
  if (tree.entries) {
    for (const e of tree.entries) if (overlapBounds(e.box, box)) result.push(e);
  } else {
    queryBoundsTree(tree.left, box, result);
    queryBoundsTree(tree.right, box, result);
  }
  return result;
}
// Transient broad-phase lookup shared by canonical material contact owners.
export function materialBoundsQuery(items, getBounds) {
  const tree = buildBoundsTree(items, getBounds);
  return (box) => queryBoundsTree(tree, box).map((e) => e.item);
}

// Conservative broad phase only. Keep the two persistence-grid-cell envelope
// used by indexedIntersectionInputs, and preserve original owner order.
export function materialRegionCandidates(regions) {
  if (regions.length < 32) {
    const all = regions.map((_, index) => index);
    return () => all;
  }
  const entries = regions.flatMap((region, index) =>
    region.geom.map((polygon) => ({ index, box: polygonBounds(polygon) })),
  );
  const query = materialBoundsQuery(entries, (entry) => entry.box);
  return (geometry) =>
    [
      ...new Set(
        geometry.flatMap((polygon) => {
          const b = polygonBounds(polygon);
          return query([b[0] - 0.0002, b[1] - 0.0002, b[2] + 0.0002, b[3] + 0.0002]).map(
            (entry) => entry.index,
          );
        }),
      ),
    ].sort((a, b) => a - b);
}
function selectPolygons(geometry, box) {
  if (geometry.length < 16) return geometry.filter((p) => overlapBounds(polygonBounds(p), box));
  if (!polygonIndexes.has(geometry))
    polygonIndexes.set(geometry, buildBoundsTree(geometry, polygonBounds));
  return queryBoundsTree(polygonIndexes.get(geometry), box)
    .sort((a, b) => a.index - b.index)
    .map((e) => e.item);
}
function pruneIntersectionHoles(polygon, box) {
  if (polygon.length < 17)
    return [polygon[0], ...polygon.slice(1).filter((h) => overlapBounds(ringBounds(h), box))];
  if (!holeIndexes.has(polygon))
    holeIndexes.set(polygon, buildBoundsTree(polygon.slice(1), ringBounds));
  const selected = queryBoundsTree(holeIndexes.get(polygon), box)
    .sort((a, b) => a.index - b.index)
    .map((e) => e.item);
  return [polygon[0], ...selected];
}
function ringBounds(ring) {
  if (ringBoundsCache.has(ring)) return ringBoundsCache.get(ring);
  const value = bounds([[ring]]);
  ringBoundsCache.set(ring, value);
  return value;
}
function polygonBounds(p) {
  if (polygonBoundsCache.has(p)) return polygonBoundsCache.get(p);
  const b = bounds([p]);
  polygonBoundsCache.set(p, b);
  return b;
}
const overlapBounds = (x, y) => !(x[0] > y[2] || y[0] > x[2] || x[1] > y[3] || y[1] > x[3]);
function bounds(g) {
  if (boundsCache.has(g)) return boundsCache.get(g);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of g)
    for (const r of p)
      for (const [x, y] of r) {
        b[0] = Math.min(b[0], x);
        b[1] = Math.min(b[1], y);
        b[2] = Math.max(b[2], x);
        b[3] = Math.max(b[3], y);
      }
  boundsCache.set(g, b);
  return b;
}
function disjoint(a, b) {
  const x = bounds(a),
    y = bounds(b);
  return x[0] > y[2] || y[0] > x[2] || x[1] > y[3] || y[1] > x[3];
}
export const materialGeometryBounds = bounds;
function contactIndex(geometry) {
  if (contactEdges.has(geometry)) return contactEdges.get(geometry);
  const edges = geometry.flatMap((p) =>
    p.flatMap((r) =>
      r.slice(1).map((b, i) => {
        const a = r[i];
        return {
          a,
          b,
          box: [
            Math.min(a[0], b[0]),
            Math.min(a[1], b[1]),
            Math.max(a[0], b[0]),
            Math.max(a[1], b[1]),
          ],
        };
      }),
    ),
  );
  const result = { edges, tree: buildBoundsTree(edges, (e) => e.box) };
  contactEdges.set(geometry, result);
  return result;
}
function pointSegmentDistance2(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    px = p[0] - a[0],
    py = p[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0;
  return (px - t * dx) ** 2 + (py - t * dy) ** 2;
}
function segmentsTouch(a, b, c, d, tolerance) {
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orient(a, b, c),
    abD = orient(a, b, d),
    cdA = orient(c, d, a),
    cdB = orient(c, d, b);
  if (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  )
    return true;
  return (
    Math.min(
      pointSegmentDistance2(a, c, d),
      pointSegmentDistance2(b, c, d),
      pointSegmentDistance2(c, a, b),
      pointSegmentDistance2(d, a, b),
    ) <=
    tolerance * tolerance
  );
}
/** Closed-set XY contact without manufacturing a sub-grid buffer polygon. */
export function materialGeometriesTouch(a, b, tolerance = 1e-8) {
  if (!a?.length || !b?.length) return false;
  const expand = (box) => [
    box[0] - tolerance,
    box[1] - tolerance,
    box[2] + tolerance,
    box[3] + tolerance,
  ];
  if (!overlapBounds(expand(bounds(a)), bounds(b))) return false;
  const contained = (left, right) =>
    left.some((p) => {
      const point = p[0][0],
        box = [point[0], point[1], point[0], point[1]];
      const selected = selectPolygons(right, box).map((q) => pruneIntersectionHoles(q, box));
      return selected.length && pointInMulti(point, selected);
    });
  if (contained(a, b) || contained(b, a)) return true;
  let left = contactIndex(a),
    right = contactIndex(b);
  if (left.edges.length > right.edges.length) [left, right] = [right, left];
  for (const edge of left.edges)
    for (const { item: other } of queryBoundsTree(right.tree, expand(edge.box)))
      if (segmentsTouch(edge.a, edge.b, other.a, other.b, tolerance)) return true;
  return false;
}
function segmentsSharePositiveEdge(a, b, c, d, tolerance) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length <= tolerance || Math.hypot(d[0] - c[0], d[1] - c[1]) <= tolerance)
    return false;
  const perpendicular = (p) => Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0]));
  if (perpendicular(c) > tolerance * length || perpendicular(d) > tolerance * length)
    return false;
  const along = (p) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
  const lo = Math.min(along(c), along(d));
  const hi = Math.max(along(c), along(d));
  return Math.min(length, hi) - Math.max(0, lo) > tolerance;
}

/**
 * Positive-length contact with an actual receiving surface.
 * Unlike closed-set contact, a point-only tangent cannot support a
 * physically deposited sidewall film. Preserve the original contact
 * tolerance, ring boundaries (including holes), and indexed broad phase.
 */
export function materialGeometriesShareBoundaryEdge(a, b, tolerance = 1e-8) {
  if (!a?.length || !b?.length) return false;
  const expand = (box) => [
    box[0] - tolerance,
    box[1] - tolerance,
    box[2] + tolerance,
    box[3] + tolerance,
  ];
  if (!overlapBounds(expand(bounds(a)), bounds(b))) return false;
  let left = contactIndex(a);
  let right = contactIndex(b);
  if (left.edges.length > right.edges.length) [left, right] = [right, left];
  for (const edge of left.edges)
    for (const { item: other } of queryBoundsTree(right.tree, expand(edge.box)))
      if (segmentsSharePositiveEdge(edge.a, edge.b, other.a, other.b, tolerance)) return true;
  return false;
}

function paths(geometry, scale = SCALE) {
  if (scale === SCALE && pathCache.has(geometry)) return pathCache.get(geometry);
  const result = (geometry || []).flatMap((polygon) =>
    polygon.map((ring, index) => {
      const path = ring.map(([x, y]) => ({ X: Math.round(x * scale), Y: Math.round(y * scale) }));
      if (
        path.some(
          (p) =>
            !Number.isSafeInteger(p.X) ||
            !Number.isSafeInteger(p.Y) ||
            Math.abs(p.X) > 1e14 ||
            Math.abs(p.Y) > 1e14,
        )
      )
        throw new RangeError('Material process coordinate budget exceeded.');
      const positive =
        scale === SCALE ? Clipper.Clipper.Orientation(path) : integerArea2(path) >= 0n;
      if (positive !== (index === 0)) path.reverse();
      return path;
    }),
  );
  if (geometry && scale === SCALE) pathCache.set(geometry, result);
  return result;
}
function integerArea2(path) {
  let area = 0n;
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    area += BigInt(a.X) * BigInt(b.Y) - BigInt(b.X) * BigInt(a.Y);
  }
  return area;
}
function integerPointInRing(point, path, scale = 1) {
  let inside = false;
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    const ax = a.X * scale,
      ay = a.Y * scale,
      bx = b.X * scale,
      by = b.Y * scale;
    // Most edges cannot meet the horizontal containment ray. Reject them
    // before exact arithmetic; points left of an entire edge need only the
    // usual half-open Y crossing test.
    if (point.Y < Math.min(ay, by) || point.Y > Math.max(ay, by) || point.X > Math.max(ax, bx))
      continue;
    const crossesY = ay > point.Y !== by > point.Y;
    if (point.X < Math.min(ax, bx)) {
      if (crossesY) inside = !inside;
      continue;
    }
    const cross = BigInt(bx - ax) * BigInt(point.Y - ay) - BigInt(by - ay) * BigInt(point.X - ax);
    if (
      cross === 0n &&
      point.X >= Math.min(ax, bx) &&
      point.X <= Math.max(ax, bx) &&
      point.Y >= Math.min(ay, by) &&
      point.Y <= Math.max(ay, by)
    )
      return -1;
    if (crossesY && cross > 0n === by > ay) inside = !inside;
  }
  return inside ? 1 : 0;
}
function nestMaterialPaths(output, originX = 0, originY = 0, scale = SCALE) {
  const contours = output
    .map((path) => ({ path, area: integerArea2(path) }))
    .filter((p) => p.area !== 0n);
  const ring = (path) => {
    const r = path.map((p) => [(p.X + originX) / scale, (p.Y + originY) / scale]);
    r.push([...r[0]]);
    return r;
  };
  const outer = contours.filter((p) => p.area > 0n).map((p) => ({ ...p, polygon: [ring(p.path)] }));
  for (const p of outer) p.box = polygonBounds(p.polygon);
  const tree = buildBoundsTree(outer, (p) => p.box);
  for (const hole of contours.filter((p) => p.area < 0n)) {
    const h = ring(hole.path),
      box = ringBounds(h);
    const candidates = queryBoundsTree(tree, box)
      .map((e) => e.item)
      .filter(
        (p) =>
          p.area > -hole.area &&
          p.box[0] <= box[0] &&
          p.box[1] <= box[1] &&
          p.box[2] >= box[2] &&
          p.box[3] >= box[3],
      )
      .sort((a, b) => (a.area < b.area ? -1 : 1));
    const owner = candidates.find((p) => {
      const vertices = hole.path.map((point) => integerPointInRing(point, p.path));
      if (vertices.includes(0)) return false;
      if (vertices.includes(1)) return true;
      // A triangular hole can have every vertex on its parent's boundary.
      // Test edge midpoints on a doubled integer lattice without rounding.
      const midpoints = hole.path.map((a, i) => {
        const b = hole.path[(i + 1) % hole.path.length];
        return integerPointInRing({ X: a.X + b.X, Y: a.Y + b.Y }, p.path, 2);
      });
      return !midpoints.includes(0) && midpoints.includes(1);
    });
    if (!owner) return null;
    owner.polygon.push(h);
  }
  return outer.map((p) => p.polygon);
}
function execute(kind, subject, clip = [], scale = SCALE) {
  const engine = new Clipper.Clipper();
  engine.StrictlySimple = true;
  const sb = bounds(subject),
    cb = clip.length ? bounds(clip) : sb;
  if (!subject.length) return [];
  // Translate integer coordinates, preserving the exact same Boolean lattice.
  // Local apertures at millimetre wafer positions should not force JSBN
  // full-range arithmetic merely because of their absolute placement.
  const originX = Math.round((Math.min(sb[0], cb[0]) + Math.max(sb[2], cb[2])) * 0.5 * scale);
  const originY = Math.round((Math.min(sb[1], cb[1]) + Math.max(sb[3], cb[3])) * 0.5 * scale);
  const local = (g) =>
    paths(g, scale).map((path) => path.map((p) => ({ X: p.X - originX, Y: p.Y - originY })));
  if (!engine.AddPaths(local(subject), Clipper.PolyType.ptSubject, true)) return [];
  const hasClip = engine.AddPaths(local(clip), Clipper.PolyType.ptClip, true);
  if (!hasClip && kind === Clipper.ClipType.ctIntersection) return [];
  // Flat winding contours avoid Clipper's repeated global FirstLeft tree
  // repairs on many shared material edges. Nest the final contours once,
  // using exact integer orientation/containment and a bounding-box tree.
  const output = new Clipper.Paths();
  if (
    !engine.Execute(kind, output, Clipper.PolyFillType.pftNonZero, Clipper.PolyFillType.pftNonZero)
  )
    throw Error('Integer material clipping failed.');
  const nested = nestMaterialPaths(output, originX, originY, scale);
  if (nested) return nested;
  // A rounded intersection can leave a negative contour crossing a touching
  // outer edge. Re-arrange the signed result once on the same integer lattice
  // before nesting; never attach an exterior hole or change a tolerance.
  const normalizer = new Clipper.Clipper();
  normalizer.StrictlySimple = true;
  normalizer.AddPaths(output, Clipper.PolyType.ptSubject, true);
  const normalized = new Clipper.Paths();
  if (
    !normalizer.Execute(
      Clipper.ClipType.ctUnion,
      normalized,
      Clipper.PolyFillType.pftPositive,
      Clipper.PolyFillType.pftPositive,
    )
  )
    throw Error('Integer material contour normalization failed.');
  const result = nestMaterialPaths(normalized, originX, originY, scale);
  if (!result) {
    // Resolve a rounding ambiguity with finer arithmetic, never a wider
    // contact/ownership tolerance. Successful ordinary clips are unchanged.
    if (scale < SCALE * 1000) return execute(kind, subject, clip, scale * 10);
    throw Error('Integer material clipping produced an unowned hole.');
  }
  return result;
}
export const intersection = (a, b) => {
  if (!a?.length || !b?.length || disjoint(a, b)) return [];
  const left = selectPolygons(a, bounds(b));
  if (!left.length) return [];
  const right = selectPolygons(b, bounds(left));
  if (!right.length) return [];
  // Holes whose bounding boxes cannot meet the other operand have no effect
  // on an intersection. Preserve every potentially relevant hole, including
  // a hole that wholly contains the other operand.
  const prune = (polygons, box) => polygons.map((p) => pruneIntersectionHoles(p, box));
  return execute(
    Clipper.ClipType.ctIntersection,
    prune(left, bounds(right)),
    prune(right, bounds(left)),
  );
};
export const difference = (a, b) => {
  if (!a?.length) return [];
  if (!b?.length || disjoint(a, b)) return a;
  return a.flatMap((p) => {
    const selected = selectPolygons(b, polygonBounds(p));
    return selected.length ? execute(Clipper.ClipType.ctDifference, [p], selected) : [p];
  });
};
export const unionGeometries = (geometries) => {
  try {
    return vectorUnion(geometries);
  } catch {
    // Same winding/union semantics on the fine integer lattice. The material
    // owner and unchanged-source support guards still validate the result.
    const input = geometries.flatMap((g) => g || []);
    return input.length ? execute(Clipper.ClipType.ctUnion, input) : [];
  }
};
// Swept silhouette pieces overlap by construction. One integer arrangement
// avoids a floating union of thousands of narrow, coincident edge quads.
export function unionMaterialSweeps(geometries) {
  const input = geometries.flatMap((g) => g || []);
  return input.length ? execute(Clipper.ClipType.ctUnion, input) : [];
}
/** Polygonal lateral-development front; maximum circular arc sag is 0.5 nm. */
export function offsetMaterialOpening(geometry, distanceUm) {
  if (!Number.isFinite(distanceUm) || distanceUm < 0)
    throw new RangeError('Lateral development must be finite and non-negative.');
  if (!distanceUm) return geometry;
  const offset = new Clipper.ClipperOffset(2, 0.0005 * SCALE);
  offset.AddPaths(paths(geometry), Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
  const output = new Clipper.Paths();
  offset.Execute(output, distanceUm * SCALE);
  return nestMaterialPaths(output);
}
export function isMaterialGridSeam(geometry) {
  // Erode by less than the ordinary 1.5-grid seam envelope. A surviving
  // interior rejects reassignment, including a broad pocket on a thin tail.
  for (const polygon of geometry) {
    const offset = new Clipper.ClipperOffset(2, 1);
    offset.AddPaths(paths([polygon]), Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    const core = new Clipper.Paths();
    offset.Execute(core, -0.00014 * SCALE);
    if (core.some((p) => Math.abs(Clipper.Clipper.Area(p)) > 0)) return false;
  }
  return true;
}
