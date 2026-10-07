export const EPS = 1e-8;
export const BOOLEAN_RETRY_GRID_UM = 1e-4;
const BOOLEAN_RETRY_AREA_EPSILON_UM2 = BOOLEAN_RETRY_GRID_UM * BOOLEAN_RETRY_GRID_UM * 0.01;

function polygonKernel() {
  const kernel = globalThis.polygonClipping;
  if (!kernel) throw new Error('polygon-clipping is required for polygon boolean operations.');
  return kernel;
}

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
    const rings = poly.map(closeRing).filter((ring) => ring.length >= 4);
    if (!rings.length || Math.abs(signedRingArea(rings[0])) <= 1e-18) continue;
    out.push([
      rings[0],
      ...rings.slice(1).filter((ring) => Math.abs(signedRingArea(ring)) > 1e-18),
    ]);
  }
  return out;
}

function signedRingArea(ring) {
  let twiceArea = 0;
  for (let index = 1; index < (ring || []).length; index++) {
    const a = ring[index - 1],
      b = ring[index];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea / 2;
}

function snappedValue(value, grid = BOOLEAN_RETRY_GRID_UM) {
  const rounded = Math.round(Number(value) / grid) * grid;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toFixed(10));
}

function samePoint(a, b, tolerance = EPS) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance
  );
}

function canonicalBooleanRing(ring, grid = BOOLEAN_RETRY_GRID_UM) {
  const points = [];
  for (const point of ring || []) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const next = [snappedValue(point[0], grid), snappedValue(point[1], grid)];
    if (!samePoint(points.at(-1), next, grid * 1e-6)) points.push(next);
  }
  if (points.length && samePoint(points[0], points.at(-1), grid * 1e-6)) points.pop();
  if (points.length < 3) return [];

  let changed = true;
  while (changed && points.length >= 3) {
    changed = false;
    for (let index = 0; index < points.length; index++) {
      const prev = points[(index - 1 + points.length) % points.length],
        current = points[index],
        next = points[(index + 1) % points.length],
        abx = current[0] - prev[0],
        aby = current[1] - prev[1],
        bcx = next[0] - current[0],
        bcy = next[1] - current[1],
        cross = abx * bcy - aby * bcx,
        scale = Math.max(1, Math.hypot(abx, aby), Math.hypot(bcx, bcy));
      if (
        samePoint(prev, current, grid * 1e-6) ||
        samePoint(current, next, grid * 1e-6) ||
        Math.abs(cross) <= grid * 1e-8 * scale
      ) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  if (points.length < 3) return [];
  points.push([...points[0]]);
  return Math.abs(signedRingArea(points)) > BOOLEAN_RETRY_AREA_EPSILON_UM2 ? points : [];
}

export function canonicalizeBooleanGeometry(geom, grid = BOOLEAN_RETRY_GRID_UM) {
  const out = [];
  for (const poly of normalizeMulti(geom)) {
    const rings = poly
      .map((ring) => canonicalBooleanRing(ring, grid))
      .filter((ring) => ring.length >= 4);
    if (!rings.length) continue;
    const outer = rings[0];
    if (Math.abs(signedRingArea(outer)) <= BOOLEAN_RETRY_AREA_EPSILON_UM2) continue;
    out.push([
      outer,
      ...rings
        .slice(1)
        .filter((ring) => Math.abs(signedRingArea(ring)) > BOOLEAN_RETRY_AREA_EPSILON_UM2),
    ]);
  }
  return out;
}

function geometryBounds(geom) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const polygon of geom || []) {
    for (const ring of polygon || []) {
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
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function boundsMayOverlap(a, b, tolerance = EPS) {
  return Boolean(
    a &&
      b &&
      a.maxX >= b.minX - tolerance &&
      b.maxX >= a.minX - tolerance &&
      a.maxY >= b.minY - tolerance &&
      b.maxY >= a.minY - tolerance,
  );
}

const BOOLEAN_FALLBACK_GRIDS_UM = [
  BOOLEAN_RETRY_GRID_UM,
  BOOLEAN_RETRY_GRID_UM * 2,
  BOOLEAN_RETRY_GRID_UM * 5,
];

function runCanonicalBoolean(operation, geometries) {
  let lastError = null;
  for (const grid of BOOLEAN_FALLBACK_GRIDS_UM) {
    const canonical = geometries.map((geometry) => canonicalizeBooleanGeometry(geometry, grid));
    try {
      return normalizeMulti(operation(...canonical));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Polygon boolean retry failed.');
}

function componentwiseIntersection(operation, left, right) {
  const out = [];
  for (const a of normalizeMulti(left)) {
    const aa = [a],
      aBounds = geometryBounds(aa);
    for (const b of normalizeMulti(right)) {
      const bb = [b];
      if (!boundsMayOverlap(aBounds, geometryBounds(bb))) continue;
      out.push(...runCanonicalBoolean(operation, [aa, bb]));
    }
  }
  return canonicalizeBooleanGeometry(out);
}

function componentwiseDifference(operation, left, right) {
  let pieces = normalizeMulti(left).map((polygon) => [polygon]);
  for (const clipPolygon of normalizeMulti(right)) {
    const clip = [clipPolygon],
      clipBounds = geometryBounds(clip),
      next = [];
    for (const piece of pieces) {
      if (!boundsMayOverlap(geometryBounds(piece), clipBounds)) {
        next.push(piece);
        continue;
      }
      const result = runCanonicalBoolean(operation, [piece, clip]);
      for (const polygon of result) next.push([polygon]);
    }
    pieces = next;
    if (!pieces.length) break;
  }
  return canonicalizeBooleanGeometry(pieces.flatMap((piece) => piece));
}

function componentwiseUnion(operation, geometries) {
  const pending = geometries
      .flatMap((geometry) => normalizeMulti(geometry))
      .map((polygon) => [polygon]),
    out = [];

  while (pending.length) {
    let current = pending.shift(),
      merged = true;
    while (merged) {
      merged = false;
      const currentBounds = geometryBounds(current);
      for (let index = 0; index < out.length; index++) {
        const candidate = out[index];
        if (!boundsMayOverlap(currentBounds, geometryBounds(candidate))) continue;

        const result = runCanonicalBoolean(operation, [current, candidate]);
        // A true overlap/touch collapses to one polygon. Bounding boxes can
        // overlap for geometrically disjoint polygons; leave those separate.
        if (result.length !== 1) continue;
        current = result;
        out.splice(index, 1);
        merged = true;
        break;
      }
    }
    out.push(current);
  }
  return canonicalizeBooleanGeometry(out.flatMap((piece) => piece));
}

export function booleanWithQuantizedRetry(operationName, geometries) {
  const kernel = polygonKernel(),
    operation = kernel?.[operationName];
  if (typeof operation !== 'function') {
    throw new Error(`polygon-clipping does not provide ${operationName}().`);
  }

  const normalized = geometries.map(normalizeMulti);
  try {
    return normalizeMulti(operation(...normalized));
  } catch (initialError) {
    try {
      return runCanonicalBoolean(operation, normalized);
    } catch (retryError) {
      try {
        if (operationName === 'intersection' && normalized.length === 2) {
          return componentwiseIntersection(operation, normalized[0], normalized[1]);
        }
        if (operationName === 'difference' && normalized.length === 2) {
          return componentwiseDifference(operation, normalized[0], normalized[1]);
        }
        if (operationName === 'union') {
          return componentwiseUnion(operation, normalized);
        }
      } catch (componentError) {
        componentError.cause = retryError;
        throw componentError;
      }
      retryError.cause = initialError;
      throw retryError;
    }
  }
}

export function robustIntersection(a, b) {
  const aa = normalizeMulti(a),
    bb = normalizeMulti(b);
  return aa.length && bb.length ? booleanWithQuantizedRetry('intersection', [aa, bb]) : [];
}

export function robustDifference(a, b) {
  const aa = normalizeMulti(a),
    bb = normalizeMulti(b);
  if (!aa.length) return [];
  return bb.length ? booleanWithQuantizedRetry('difference', [aa, bb]) : structuredClone(aa);
}
