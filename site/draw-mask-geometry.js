import {
  circleMulti,
  isEmpty,
  pointInMulti,
  rectMulti,
  unionGeometries,
} from './vector-geometry.js';

const EPS = 1e-12;

export function createEmptyDrawMask() {
  return { nextShapeId: 1, shapes: [] };
}

export function normalizeDrawShape(shape) {
  if (!shape || typeof shape !== 'object') return null;
  const id = String(shape.id || '');
  if (!id) return null;

  if (shape.type === 'rect') {
    if (!Array.isArray(shape.a) || !Array.isArray(shape.b)) return null;
    const x0 = Math.min(Number(shape.a[0]), Number(shape.b[0])),
      x1 = Math.max(Number(shape.a[0]), Number(shape.b[0])),
      y0 = Math.min(Number(shape.a[1]), Number(shape.b[1])),
      y1 = Math.max(Number(shape.a[1]), Number(shape.b[1]));
    if (![x0, x1, y0, y1].every(Number.isFinite) || x1 - x0 <= EPS || y1 - y0 <= EPS) {
      return null;
    }
    return { id, type: 'rect', a: [x0, y0], b: [x1, y1] };
  }

  if (shape.type === 'circle') {
    if (!Array.isArray(shape.c)) return null;
    const c = [Number(shape.c[0]), Number(shape.c[1])],
      r = Math.abs(Number(shape.r));
    if (!c.every(Number.isFinite) || !Number.isFinite(r) || r <= EPS) return null;
    return { id, type: 'circle', c, r };
  }

  if (shape.type === 'polygon') {
    const points = Array.isArray(shape.points)
      ? shape.points
          .map((point) => [Number(point?.[0]), Number(point?.[1])])
          .filter((point) => point.every(Number.isFinite))
      : [];
    if (points.length < 3) return null;
    return { id, type: 'polygon', points };
  }

  return null;
}

export function normalizeDrawMask(drawMask) {
  const shapes = (drawMask?.shapes || []).map(normalizeDrawShape).filter(Boolean);
  const maxId = shapes.reduce((max, shape) => {
    const match = /^shape-(\d+)$/.exec(shape.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const requestedNext = Math.max(1, Number(drawMask?.nextShapeId) || 1);
  return { nextShapeId: Math.max(requestedNext, maxId + 1), shapes };
}

export function allocateDrawShapeId(drawMask) {
  const id = `shape-${Math.max(1, Number(drawMask?.nextShapeId) || 1)}`;
  return {
    id,
    nextShapeId: Math.max(1, Number(drawMask?.nextShapeId) || 1) + 1,
  };
}

export function drawShapeGeometry(shape, circleSegments = 96) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized) return [];
  if (normalized.type === 'rect') {
    const width = normalized.b[0] - normalized.a[0],
      height = normalized.b[1] - normalized.a[1];
    return rectMulti(width, height, (normalized.a[0] + normalized.b[0]) / 2, (normalized.a[1] + normalized.b[1]) / 2);
  }
  if (normalized.type === 'circle') {
    return circleMulti(
      normalized.r * 2,
      normalized.r * 2,
      circleSegments,
      normalized.c[0],
      normalized.c[1],
    );
  }
  const ring = normalized.points.map((point) => [...point]);
  ring.push([...ring[0]]);
  return [[ring]];
}

export function drawMaskGeometry(drawMask) {
  const geoms = (drawMask?.shapes || []).map((shape) => drawShapeGeometry(shape)).filter((geom) => !isEmpty(geom));
  return geoms.length ? unionGeometries(geoms) : [];
}

export function drawShapeContainsPoint(shape, point) {
  return pointInMulti(point, drawShapeGeometry(shape));
}

export function drawShapeHandles(shape) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized) return {};
  if (normalized.type === 'rect') {
    const [x0, y0] = normalized.a,
      [x1, y1] = normalized.b;
    return {
      nw: [x0, y0],
      ne: [x1, y0],
      se: [x1, y1],
      sw: [x0, y1],
    };
  }
  if (normalized.type === 'circle') {
    return {
      radius: [normalized.c[0] + normalized.r, normalized.c[1]],
    };
  }
  return Object.fromEntries(normalized.points.map((point, index) => [`v${index}`, point]));
}

export function translateDrawShape(shape, dx, dy) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized) return shape;
  if (normalized.type === 'rect') {
    return {
      ...normalized,
      a: [normalized.a[0] + dx, normalized.a[1] + dy],
      b: [normalized.b[0] + dx, normalized.b[1] + dy],
    };
  }
  if (normalized.type === 'circle') {
    return { ...normalized, c: [normalized.c[0] + dx, normalized.c[1] + dy] };
  }
  return {
    ...normalized,
    points: normalized.points.map(([x, y]) => [x + dx, y + dy]),
  };
}

export function resizeDrawShape(shape, handle, point) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized || !Array.isArray(point)) return normalized || shape;

  if (normalized.type === 'circle') {
    return normalizeDrawShape({
      ...normalized,
      r: Math.hypot(point[0] - normalized.c[0], point[1] - normalized.c[1]),
    });
  }

  if (normalized.type === 'polygon') {
    const index = Number(String(handle).slice(1));
    if (!Number.isInteger(index) || index < 0 || index >= normalized.points.length) return normalized;
    const points = normalized.points.map((value) => [...value]);
    points[index] = [...point];
    return normalizeDrawShape({ ...normalized, points }) || normalized;
  }

  const opposite = {
    nw: normalized.b,
    ne: [normalized.a[0], normalized.b[1]],
    se: normalized.a,
    sw: [normalized.b[0], normalized.a[1]],
  }[handle];
  if (!opposite) return normalized;
  return (
    normalizeDrawShape({
      ...normalized,
      a: [Math.min(point[0], opposite[0]), Math.min(point[1], opposite[1])],
      b: [Math.max(point[0], opposite[0]), Math.max(point[1], opposite[1])],
    }) || normalized
  );
}
