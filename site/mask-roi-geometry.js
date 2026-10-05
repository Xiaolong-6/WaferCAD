const ANCHOR_SIGNS = {
  'top-left': [-1, 1],
  'top-right': [1, 1],
  'bottom-left': [-1, -1],
  'bottom-right': [1, -1],
};

function finitePoint(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

function normalizedAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle % 360) + 360) % 360;
  return Math.abs(wrapped - 360) < 1e-12 ? 0 : wrapped;
}

function basis(rotation) {
  const angle = (normalizedAngle(rotation) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return {
    x: [cos, sin],
    y: [-sin, cos],
  };
}

export function normalizeMaskRoi(roi) {
  if (!roi || typeof roi !== 'object') return null;

  if (roi.type === 'square' && finitePoint(roi.c)) {
    const size = Math.abs(Number(roi.size));
    if (!(size > 0)) return null;
    return {
      type: 'square',
      c: [Number(roi.c[0]), Number(roi.c[1])],
      size,
      rotation: normalizedAngle(roi.rotation),
    };
  }

  // Runtime compatibility for v7/legacy callers. Project migration converts
  // persisted rect ROI into the explicit square representation.
  if (roi.type === 'rect' && finitePoint(roi.a) && finitePoint(roi.b)) {
    const x0 = Math.min(Number(roi.a[0]), Number(roi.b[0])),
      x1 = Math.max(Number(roi.a[0]), Number(roi.b[0])),
      y0 = Math.min(Number(roi.a[1]), Number(roi.b[1])),
      y1 = Math.max(Number(roi.a[1]), Number(roi.b[1])),
      size = Math.max(x1 - x0, y1 - y0);
    if (!(size > 0)) return null;
    return {
      type: 'square',
      c: [(x0 + x1) / 2, (y0 + y1) / 2],
      size,
      rotation: normalizedAngle(roi.rotation),
    };
  }

  if (roi.type === 'circle' && finitePoint(roi.c)) {
    const radius = Math.abs(Number(roi.r));
    if (!(radius > 0)) return null;
    return {
      type: 'circle',
      c: [Number(roi.c[0]), Number(roi.c[1])],
      r: radius,
    };
  }

  return null;
}

export function maskLocalToWorld(point, transform = {}) {
  const angle = ((Number(transform.rotation) || 0) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    scale = Math.max(1e-12, Math.abs(Number(transform.scale) || 1)),
    x = Number(point[0]) * scale,
    y = Number(point[1]) * scale;
  return [
    x * cos - y * sin + (Number(transform.x) || 0),
    x * sin + y * cos + (Number(transform.y) || 0),
  ];
}

export function worldToMaskLocal(point, transform = {}) {
  const angle = (-(Number(transform.rotation) || 0) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    scale = Math.max(1e-12, Math.abs(Number(transform.scale) || 1)),
    dx = Number(point[0]) - (Number(transform.x) || 0),
    dy = Number(point[1]) - (Number(transform.y) || 0);
  return [(dx * cos - dy * sin) / scale, (dx * sin + dy * cos) / scale];
}

export function maskSquareCorners(roi) {
  const shape = normalizeMaskRoi(roi);
  if (!shape || shape.type !== 'square') return {};
  const half = shape.size / 2,
    axes = basis(shape.rotation),
    point = (sx, sy) => [
      shape.c[0] + axes.x[0] * sx * half + axes.y[0] * sy * half,
      shape.c[1] + axes.x[1] * sx * half + axes.y[1] * sy * half,
    ];
  return {
    'top-left': point(-1, 1),
    'top-right': point(1, 1),
    'bottom-right': point(1, -1),
    'bottom-left': point(-1, -1),
  };
}

export function maskRoiHandlePoints(roi) {
  const shape = normalizeMaskRoi(roi);
  if (!shape) return {};
  if (shape.type === 'square') return maskSquareCorners(shape);
  const [cx, cy] = shape.c,
    r = shape.r;
  return {
    'top-left': [cx - r, cy + r],
    'top-right': [cx + r, cy + r],
    'bottom-right': [cx + r, cy - r],
    'bottom-left': [cx - r, cy - r],
  };
}

export function maskRoiAnchorPoint(roi, anchor = 'center') {
  const shape = normalizeMaskRoi(roi);
  if (!shape) return null;
  if (anchor === 'center' || !ANCHOR_SIGNS[anchor]) return [...shape.c];
  if (shape.type === 'square') return maskSquareCorners(shape)[anchor];
  const [sx, sy] = ANCHOR_SIGNS[anchor];
  return [shape.c[0] + sx * shape.r, shape.c[1] + sy * shape.r];
}

export function squareMaskRoiFromAnchor(size, rotation, anchor, x, y) {
  size = Number(size);
  x = Number(x);
  y = Number(y);
  if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const angle = normalizedAngle(rotation);
  if (anchor === 'center' || !ANCHOR_SIGNS[anchor]) {
    return { type: 'square', c: [x, y], size, rotation: angle };
  }
  const [sx, sy] = ANCHOR_SIGNS[anchor],
    axes = basis(angle),
    half = size / 2;
  return {
    type: 'square',
    c: [
      x - axes.x[0] * sx * half - axes.y[0] * sy * half,
      y - axes.x[1] * sx * half - axes.y[1] * sy * half,
    ],
    size,
    rotation: angle,
  };
}

export function circleMaskRoiFromAnchor(radius, anchor, x, y) {
  radius = Number(radius);
  x = Number(x);
  y = Number(y);
  if (!(radius > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (anchor === 'center' || !ANCHOR_SIGNS[anchor]) {
    return { type: 'circle', c: [x, y], r: radius };
  }
  const [sx, sy] = ANCHOR_SIGNS[anchor];
  return { type: 'circle', c: [x - sx * radius, y - sy * radius], r: radius };
}

export function translateMaskRoi(roi, dx, dy) {
  const shape = normalizeMaskRoi(roi);
  dx = Number(dx);
  dy = Number(dy);
  if (!shape || !Number.isFinite(dx) || !Number.isFinite(dy)) return shape;
  return { ...shape, c: [shape.c[0] + dx, shape.c[1] + dy] };
}

export function maskRoiContainsPoint(roi, point) {
  const shape = normalizeMaskRoi(roi);
  if (!shape || !finitePoint(point)) return false;
  const dx = Number(point[0]) - shape.c[0],
    dy = Number(point[1]) - shape.c[1];
  if (shape.type === 'circle') return Math.hypot(dx, dy) <= shape.r;
  const axes = basis(shape.rotation),
    u = dx * axes.x[0] + dy * axes.x[1],
    v = dx * axes.y[0] + dy * axes.y[1],
    half = shape.size / 2,
    tolerance = Math.max(1e-12, half * 1e-9);
  return Math.abs(u) <= half + tolerance && Math.abs(v) <= half + tolerance;
}

export function resizeMaskRoiFromHandle(roi, handle, point) {
  const shape = normalizeMaskRoi(roi);
  if (!shape || !finitePoint(point) || !ANCHOR_SIGNS[handle]) return shape;
  const opposite = {
      'top-left': 'bottom-right',
      'top-right': 'bottom-left',
      'bottom-left': 'top-right',
      'bottom-right': 'top-left',
    }[handle],
    fixed = maskRoiHandlePoints(shape)[opposite];
  if (!fixed) return shape;

  if (shape.type === 'circle') {
    const side = Math.max(
      Math.abs(Number(point[0]) - fixed[0]),
      Math.abs(Number(point[1]) - fixed[1]),
    );
    if (!(side > 1e-12)) return shape;
    const [sx, sy] = ANCHOR_SIGNS[handle],
      dragged = [fixed[0] + sx * side, fixed[1] + sy * side];
    return {
      type: 'circle',
      c: [(fixed[0] + dragged[0]) / 2, (fixed[1] + dragged[1]) / 2],
      r: side / 2,
    };
  }

  const axes = basis(shape.rotation),
    dx = Number(point[0]) - fixed[0],
    dy = Number(point[1]) - fixed[1],
    u = dx * axes.x[0] + dy * axes.x[1],
    v = dx * axes.y[0] + dy * axes.y[1],
    side = Math.max(Math.abs(u), Math.abs(v));
  if (!(side > 1e-12)) return shape;
  const [sx, sy] = ANCHOR_SIGNS[handle],
    oppositeSigns = ANCHOR_SIGNS[opposite],
    dirX = sx - oppositeSigns[0] > 0 ? 1 : -1,
    dirY = sy - oppositeSigns[1] > 0 ? 1 : -1,
    dragged = [
      fixed[0] + axes.x[0] * dirX * side + axes.y[0] * dirY * side,
      fixed[1] + axes.x[1] * dirX * side + axes.y[1] * dirY * side,
    ];
  return {
    type: 'square',
    c: [(fixed[0] + dragged[0]) / 2, (fixed[1] + dragged[1]) / 2],
    size: side,
    rotation: shape.rotation,
  };
}

export function maskRoiWorldGeometry(roi, transform = {}, circleSegments = 96) {
  const shape = normalizeMaskRoi(roi);
  if (!shape) return null;
  if (shape.type === 'square') {
    const corners = maskSquareCorners(shape),
      ring = ['bottom-left', 'bottom-right', 'top-right', 'top-left', 'bottom-left'].map((key) =>
        maskLocalToWorld(corners[key], transform),
      );
    return [[ring]];
  }

  const center = maskLocalToWorld(shape.c, transform),
    scale = Math.max(1e-12, Math.abs(Number(transform.scale) || 1)),
    steps = Math.max(16, Number(circleSegments) || 96),
    ring = [];
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * Math.PI * 2;
    ring.push([
      center[0] + Math.cos(angle) * shape.r * scale,
      center[1] + Math.sin(angle) * shape.r * scale,
    ]);
  }
  return [[ring]];
}

export function multiBounds(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const polygon of geometry || [])
    for (const ring of polygon || [])
      for (const point of ring || []) {
        minX = Math.min(minX, Number(point[0]));
        minY = Math.min(minY, Number(point[1]));
        maxX = Math.max(maxX, Number(point[0]));
        maxY = Math.max(maxY, Number(point[1]));
      }
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
}
