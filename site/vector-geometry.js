import { connectedBoundingBoxGroups } from './polygon-bounds-groups.js';
import {
  BOOLEAN_RETRY_GRID_UM,
  EPS,
  booleanWithNormalizedRetry,
  canonicalizeBooleanGeometry,
  closeRing,
  normalizeMulti,
  robustDifference,
  robustIntersection,
} from './polygon-boolean.js';

if (!globalThis.polygonClipping) {
  throw new Error('polygon-clipping must load before vector-geometry.js');
}

export { BOOLEAN_RETRY_GRID_UM, EPS, canonicalizeBooleanGeometry, closeRing, normalizeMulti };

export const cloneGeom = (geom) => structuredClone(geom || []);
export const isEmpty = (geom) => !geom || geom.length === 0;

export function rectMulti(width, height, cx = 0, cy = 0) {
  const x0 = cx - width / 2,
    x1 = cx + width / 2;
  const y0 = cy - height / 2,
    y1 = cy + height / 2;
  return [
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  ];
}

export function circleMulti(width, height = width, segments = 192, cx = 0, cy = 0) {
  const rx = width / 2,
    ry = height / 2,
    ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i * Math.PI * 2) / segments;
    ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  ring.push([...ring[0]]);
  return [[ring]];
}

function polygonBounds(poly) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of poly || []) {
    for (const point of ring || []) {
      const x = Number(point?.[0]),
        y = Number(point?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function unionPolygonComponents(geometries) {
  const entries = [];
  for (const geom of geometries || []) {
    for (const poly of normalizeMulti(geom)) {
      const bounds = polygonBounds(poly);
      if (bounds) entries.push({ geom: [poly], bounds });
    }
  }
  if (!entries.length) return [];
  // normalizeMulti already copied every point and closed every ring. Returning
  // the sole detached polygon avoids a redundant structuredClone over a large
  // mask while keeping the caller's geometry independent.
  if (entries.length === 1) return entries[0].geom;

  // Wafer arrays commonly contain thousands of identical, non-touching polygons.
  // Sending all of them through one Martinez sweep is both slow and a source of
  // output-ring failures. A sweep over bounding boxes first partitions the input
  // into overlap-connected components; singleton components are already exact
  // union results and never enter polygon-clipping.
  const components = connectedBoundingBoxGroups(
    entries.map((entry) => entry.bounds),
    EPS,
  ).map((indices) => indices.map((index) => entries[index].geom));

  const out = [];
  let mergedComponents = false;
  for (const component of components.values()) {
    if (component.length === 1) {
      out.push(...component[0]);
      continue;
    }
    mergedComponents = true;
    const merged = booleanWithNormalizedRetry('union', component);
    out.push(...merged);
  }
  // Singleton components are already independent, normalized geometry.
  // Avoid cloning every coordinate a second time for disjoint wafer arrays.
  // Preserve the original canonicalization when Boolean merging occurred.
  return mergedComponents ? normalizeMulti(out) : out;
}

export function unionGeometries(geometries) {
  return unionPolygonComponents(geometries);
}

function unionGeometriesPairwise(geometries) {
  let level = (geometries || []).map(normalizeMulti).filter((g) => g.length);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 >= level.length) next.push(level[i]);
      else next.push(booleanWithNormalizedRetry('union', [level[i], level[i + 1]]));
    }
    level = next;
  }
  return level[0] || [];
}

export function intersection(a, b) {
  return robustIntersection(a, b);
}

export function difference(a, b) {
  return robustDifference(a, b);
}

export function transformMulti(geom, transform) {
  return normalizeMulti((geom || []).map((poly) => poly.map((ring) => ring.map(transform))));
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi) inside = !inside;
  }
  return inside;
}

export function pointInMulti(point, geom) {
  for (const poly of geom || []) {
    if (!poly.length || !pointInRing(point, poly[0])) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(point, poly[i])) {
        hole = true;
        break;
      }
    }
    if (!hole) return true;
  }
  return false;
}

export function multiBounds(geom) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of geom || [])
    for (const ring of poly)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return Number.isFinite(minX)
    ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
}

function circleAt([cx, cy], radius, segments = 28) {
  return radius > EPS ? circleMulti(radius * 2, radius * 2, segments, cx, cy) : [];
}

function segmentBand(a, b, radius) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  if (len < EPS) return circleAt(a, radius);
  const ux = dx / len,
    uy = dy / len,
    nx = -uy * radius,
    ny = ux * radius,
    overlap = Math.max(EPS * 10, radius * 1e-6),
    ax = a[0] - ux * overlap,
    ay = a[1] - uy * overlap,
    bx = b[0] + ux * overlap,
    by = b[1] + uy * overlap;
  return [
    [
      closeRing([
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx - nx, by - ny],
        [ax - nx, ay - ny],
      ]),
    ],
  ];
}

export function bufferPolyline(points, radius, segments = 28, closed = false) {
  if (!(radius > EPS) || !points?.length) return [];
  const parts = [];
  for (let i = 1; i < points.length; i++) parts.push(segmentBand(points[i - 1], points[i], radius));
  if (closed && points.length > 2) {
    const a = points[0],
      b = points.at(-1);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > EPS) parts.push(segmentBand(b, a, radius));
  }
  for (const p of points) parts.push(circleAt(p, radius, segments));
  return unionGeometriesPairwise(parts);
}

export function bufferMulti(geom, radius, segments = 28, keepSegment = null) {
  const base = normalizeMulti(geom);
  if (!(radius > EPS) || !base.length) return cloneGeom(base);
  const parts = [base];
  for (const poly of base)
    for (const ring of poly) {
      if (!keepSegment) {
        parts.push(bufferPolyline(ring.slice(0, -1), radius, segments, true));
        continue;
      }
      const bands = [];
      const ends = new Map();
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        if (!keepSegment(a, b)) continue;
        bands.push(segmentBand(a, b, radius));
        ends.set(`${a[0]},${a[1]}`, a);
        ends.set(`${b[0]},${b[1]}`, b);
      }
      for (const point of ends.values()) bands.push(circleAt(point, radius, segments));
      if (bands.length) parts.push(unionGeometriesPairwise(bands));
    }
  return unionGeometries(parts);
}

function segmentEdgeT(a, b, c, d) {
  const rx = b[0] - a[0],
    ry = b[1] - a[1],
    sx = d[0] - c[0],
    sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const qx = c[0] - a[0],
    qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t > EPS && t < 1 - EPS && u > -EPS && u < 1 + EPS ? t : null;
}

export function lineIntervalsInMulti(a, b, geom) {
  const ts = [0, 1];
  for (const poly of geom || [])
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const t = segmentEdgeT(a, b, ring[i - 1], ring[i]);
        if (t != null) ts.push(t);
      }
    }
  ts.sort((x, y) => x - y);
  const unique = ts.filter((t, i) => i === 0 || Math.abs(t - ts[i - 1]) > 1e-7);
  const intervals = [];
  for (let i = 1; i < unique.length; i++) {
    const t0 = unique[i - 1],
      t1 = unique[i];
    if (t1 - t0 < 1e-7) continue;
    const tm = (t0 + t1) / 2;
    const p = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
    if (pointInMulti(p, geom)) intervals.push([t0, t1]);
  }
  return intervals;
}
