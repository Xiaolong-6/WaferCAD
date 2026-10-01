import {
  circleMulti,
  difference,
  isEmpty,
  pointInMulti,
  rectMulti,
  unionGeometries,
} from './vector-geometry.js';

const EPS = 1e-12;

function finitePoint(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

function radialPoint(center, radius, angleDeg) {
  const angle = (Number(angleDeg) * Math.PI) / 180;
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + Math.sin(angle) * radius,
  ];
}

export function drawSectorSweepDegrees(startDeg, endDeg) {
  const start = Number(startDeg),
    end = Number(endDeg);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const raw = end - start,
    sweep = ((raw % 360) + 360) % 360;
  if (Math.abs(raw) >= 360 - 1e-9 && sweep <= 1e-9) return 360;
  return sweep;
}

function normalizeAnnulus(shape, withAngles = false) {
  if (!finitePoint(shape.c)) return null;
  const c = [Number(shape.c[0]), Number(shape.c[1])],
    innerR = Math.abs(Number(shape.innerR)),
    outerR = Math.abs(Number(shape.outerR));
  if (
    !c.every(Number.isFinite) ||
    !Number.isFinite(innerR) ||
    !Number.isFinite(outerR) ||
    outerR <= EPS ||
    innerR >= outerR - EPS
  ) {
    return null;
  }

  if (!withAngles) return { c, innerR, outerR };

  const startDeg = Number(shape.startDeg),
    endDeg = Number(shape.endDeg);
  if (!Number.isFinite(startDeg) || !Number.isFinite(endDeg)) return null;
  if (!(drawSectorSweepDegrees(startDeg, endDeg) > EPS)) return null;
  return { c, innerR, outerR, startDeg, endDeg };
}

export function createEmptyDrawMask() {
  return { nextShapeId: 1, shapes: [] };
}

export function normalizeDrawShape(shape) {
  if (!shape || typeof shape !== 'object') return null;
  const id = String(shape.id || '');
  if (!id) return null;

  if (shape.type === 'rect') {
    if (!finitePoint(shape.a) || !finitePoint(shape.b)) return null;
    const x0 = Math.min(Number(shape.a[0]), Number(shape.b[0])),
      x1 = Math.max(Number(shape.a[0]), Number(shape.b[0])),
      y0 = Math.min(Number(shape.a[1]), Number(shape.b[1])),
      y1 = Math.max(Number(shape.a[1]), Number(shape.b[1]));
    if (
      ![x0, x1, y0, y1].every(Number.isFinite) ||
      x1 - x0 <= EPS ||
      y1 - y0 <= EPS
    ) {
      return null;
    }
    return { id, type: 'rect', a: [x0, y0], b: [x1, y1] };
  }

  if (shape.type === 'circle') {
    if (!finitePoint(shape.c)) return null;
    const c = [Number(shape.c[0]), Number(shape.c[1])],
      r = Math.abs(Number(shape.r));
    if (!c.every(Number.isFinite) || !Number.isFinite(r) || r <= EPS) return null;
    return { id, type: 'circle', c, r };
  }

  if (shape.type === 'polygon') {
    const points = Array.isArray(shape.points)
      ? shape.points
          .filter(finitePoint)
          .map((point) => [Number(point[0]), Number(point[1])])
      : [];
    if (points.length < 3) return null;
    return { id, type: 'polygon', points };
  }

  if (shape.type === 'ring') {
    const normalized = normalizeAnnulus(shape);
    return normalized ? { id, type: 'ring', ...normalized } : null;
  }

  if (shape.type === 'ring-sector') {
    const normalized = normalizeAnnulus(shape, true);
    return normalized ? { id, type: 'ring-sector', ...normalized } : null;
  }

  return null;
}

export function normalizeDrawMask(drawMask) {
  const shapes = (Array.isArray(drawMask?.shapes) ? drawMask.shapes : [])
    .map(normalizeDrawShape)
    .filter(Boolean);
  const maxId = shapes.reduce((max, shape) => {
    const match = /^shape-(\d+)$/.exec(shape.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const requestedNext = Math.max(1, Number(drawMask?.nextShapeId) || 1);
  return { nextShapeId: Math.max(requestedNext, maxId + 1), shapes };
}

export function allocateDrawShapeId(drawMask) {
  const nextShapeId = Math.max(1, Number(drawMask?.nextShapeId) || 1);
  return {
    id: `shape-${nextShapeId}`,
    nextShapeId: nextShapeId + 1,
  };
}

function polygonMulti(points) {
  const ring = points.map((point) => [...point]);
  ring.push([...ring[0]]);
  return [[ring]];
}

function ringSectorMulti(shape, circleSegments = 96) {
  const sweep = drawSectorSweepDegrees(shape.startDeg, shape.endDeg);
  if (sweep >= 360 - 1e-9) {
    const outer = circleMulti(
      shape.outerR * 2,
      shape.outerR * 2,
      circleSegments,
      shape.c[0],
      shape.c[1],
    );
    const inner =
      shape.innerR > EPS
        ? circleMulti(
            shape.innerR * 2,
            shape.innerR * 2,
            circleSegments,
            shape.c[0],
            shape.c[1],
          )
        : [];
    return inner.length ? difference(outer, inner) : outer;
  }

  const steps = Math.max(2, Math.ceil((Math.max(8, circleSegments) * sweep) / 360)),
    points = [];
  for (let index = 0; index <= steps; index++) {
    points.push(
      radialPoint(
        shape.c,
        shape.outerR,
        shape.startDeg + (sweep * index) / steps,
      ),
    );
  }
  if (shape.innerR > EPS) {
    for (let index = steps; index >= 0; index--) {
      points.push(
        radialPoint(
          shape.c,
          shape.innerR,
          shape.startDeg + (sweep * index) / steps,
        ),
      );
    }
  } else {
    points.push([...shape.c]);
  }
  return polygonMulti(points);
}

export function drawShapeGeometry(shape, circleSegments = 96) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized) return [];

  if (normalized.type === 'rect') {
    const width = normalized.b[0] - normalized.a[0],
      height = normalized.b[1] - normalized.a[1];
    return rectMulti(
      width,
      height,
      (normalized.a[0] + normalized.b[0]) / 2,
      (normalized.a[1] + normalized.b[1]) / 2,
    );
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

  if (normalized.type === 'polygon') return polygonMulti(normalized.points);

  if (normalized.type === 'ring') {
    const outer = circleMulti(
      normalized.outerR * 2,
      normalized.outerR * 2,
      circleSegments,
      normalized.c[0],
      normalized.c[1],
    );
    if (!(normalized.innerR > EPS)) return outer;
    const inner = circleMulti(
      normalized.innerR * 2,
      normalized.innerR * 2,
      circleSegments,
      normalized.c[0],
      normalized.c[1],
    );
    return difference(outer, inner);
  }

  return ringSectorMulti(normalized, circleSegments);
}

export function drawMaskGeometry(drawMask) {
  const geoms = (drawMask?.shapes || [])
    .map((shape) => drawShapeGeometry(shape))
    .filter((geom) => !isEmpty(geom));
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
    return { radius: [normalized.c[0] + normalized.r, normalized.c[1]] };
  }

  if (normalized.type === 'polygon') {
    return Object.fromEntries(
      normalized.points.map((point, index) => [`v${index}`, point]),
    );
  }

  if (normalized.type === 'ring') {
    return {
      inner: [normalized.c[0] + normalized.innerR, normalized.c[1]],
      outer: [normalized.c[0] + normalized.outerR, normalized.c[1]],
    };
  }

  const sweep = drawSectorSweepDegrees(normalized.startDeg, normalized.endDeg),
    middle = normalized.startDeg + sweep / 2;
  return {
    inner: radialPoint(normalized.c, normalized.innerR, middle),
    outer: radialPoint(normalized.c, normalized.outerR, middle),
    start: radialPoint(normalized.c, normalized.outerR, normalized.startDeg),
    end: radialPoint(normalized.c, normalized.outerR, normalized.endDeg),
  };
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

  if (
    normalized.type === 'circle' ||
    normalized.type === 'ring' ||
    normalized.type === 'ring-sector'
  ) {
    return {
      ...normalized,
      c: [normalized.c[0] + dx, normalized.c[1] + dy],
    };
  }

  return {
    ...normalized,
    points: normalized.points.map(([x, y]) => [x + dx, y + dy]),
  };
}

function radiusFromPoint(shape, point) {
  return Math.hypot(point[0] - shape.c[0], point[1] - shape.c[1]);
}

export function resizeDrawShape(shape, handle, point) {
  const normalized = normalizeDrawShape(shape);
  if (!normalized || !finitePoint(point)) return normalized || shape;

  if (normalized.type === 'circle') {
    return (
      normalizeDrawShape({
        ...normalized,
        r: radiusFromPoint(normalized, point),
      }) || normalized
    );
  }

  if (normalized.type === 'polygon') {
    const index = Number(String(handle).slice(1));
    if (!Number.isInteger(index) || index < 0 || index >= normalized.points.length) {
      return normalized;
    }
    const points = normalized.points.map((value) => [...value]);
    points[index] = [Number(point[0]), Number(point[1])];
    return normalizeDrawShape({ ...normalized, points }) || normalized;
  }

  if (normalized.type === 'ring' || normalized.type === 'ring-sector') {
    if (handle === 'inner') {
      const innerR = Math.min(
        radiusFromPoint(normalized, point),
        normalized.outerR - EPS * 10,
      );
      return normalizeDrawShape({ ...normalized, innerR }) || normalized;
    }
    if (handle === 'outer') {
      const outerR = Math.max(
        radiusFromPoint(normalized, point),
        normalized.innerR + EPS * 10,
      );
      return normalizeDrawShape({ ...normalized, outerR }) || normalized;
    }
    if (normalized.type === 'ring-sector' && ['start', 'end'].includes(handle)) {
      const raw =
        (Math.atan2(
          Number(point[1]) - normalized.c[1],
          Number(point[0]) - normalized.c[0],
        ) *
          180) /
        Math.PI;
      const angle = ((raw % 360) + 360) % 360;
      return (
        normalizeDrawShape({
          ...normalized,
          ...(handle === 'start' ? { startDeg: angle } : { endDeg: angle }),
        }) || normalized
      );
    }
    return normalized;
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

export function drawShapeTypeLabel(shape) {
  return {
    rect: 'Rectangle',
    circle: 'Circle',
    polygon: 'Polygon',
    ring: 'Ring',
    'ring-sector': 'Ring Sector',
  }[shape?.type] || 'Shape';
}
