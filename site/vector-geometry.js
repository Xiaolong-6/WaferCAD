const pc = globalThis.polygonClipping;
if (!pc) throw new Error('polygon-clipping must load before vector-geometry.js');

export const EPS = 1e-8;

export function closeRing(points) {
  const ring = (points || [])
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (ring.length < 3) return [];
  const a = ring[0],
    b = ring.at(-1);
  if (Math.abs(a[0] - b[0]) > EPS || Math.abs(a[1] - b[1]) > EPS) ring.push([...a]);
  return ring;
}

export function normalizeMulti(geom) {
  if (!Array.isArray(geom)) return [];
  const out = [];
  for (const poly of geom) {
    if (!Array.isArray(poly)) continue;
    const rings = poly.map(closeRing).filter((r) => r.length >= 4);
    if (rings.length) out.push(rings);
  }
  return out;
}

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

export function unionGeometries(geometries) {
  const list = (geometries || []).map(normalizeMulti).filter((g) => g.length);
  return list.length ? normalizeMulti(pc.union(...list)) : [];
}

export function intersection(a, b) {
  const aa = normalizeMulti(a),
    bb = normalizeMulti(b);
  return aa.length && bb.length ? normalizeMulti(pc.intersection(aa, bb)) : [];
}

export function difference(a, b) {
  const aa = normalizeMulti(a),
    bb = normalizeMulti(b);
  if (!aa.length) return [];
  return bb.length ? normalizeMulti(pc.difference(aa, bb)) : cloneGeom(aa);
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
  const nx = (-dy / len) * radius,
    ny = (dx / len) * radius;
  return [
    [
      closeRing([
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
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
  return unionGeometries(parts);
}

export function bufferMulti(geom, radius, segments = 28) {
  const base = normalizeMulti(geom);
  if (!(radius > EPS) || !base.length) return cloneGeom(base);
  const parts = [base];
  for (const poly of base)
    for (const ring of poly) {
      parts.push(bufferPolyline(ring.slice(0, -1), radius, segments, true));
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
