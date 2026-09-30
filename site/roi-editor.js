const ANCHORS = new Set(['center', 'top-left', 'bottom-left', 'top-right', 'bottom-right']);

function validAnchor(anchor) {
  return ANCHORS.has(anchor) ? anchor : 'center';
}

function finitePoint(x, y) {
  return Number.isFinite(x) && Number.isFinite(y);
}

export function sectorSweepDegrees(startDeg, endDeg) {
  const start = Number(startDeg),
    end = Number(endDeg);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const raw = end - start;
  if (Math.abs(raw) < 1e-12) return 360;
  const wrapped = ((raw % 360) + 360) % 360;
  return wrapped < 1e-12 ? 360 : wrapped;
}

function radialPoint(center, radius, angleDeg) {
  const angle = (Number(angleDeg) * Math.PI) / 180,
    rawCos = Math.cos(angle),
    rawSin = Math.sin(angle),
    cos =
      Math.abs(rawCos) < 1e-12
        ? 0
        : Math.abs(Math.abs(rawCos) - 1) < 1e-12
          ? Math.sign(rawCos)
          : rawCos,
    sin =
      Math.abs(rawSin) < 1e-12
        ? 0
        : Math.abs(Math.abs(rawSin) - 1) < 1e-12
          ? Math.sign(rawSin)
          : rawSin;
  return [center[0] + cos * radius, center[1] + sin * radius];
}

export function sectorBoundaryPoints(roi, segments = 96) {
  const shape = normalizeRoi(roi);
  if (!shape || shape.type !== 'sector') return [];
  const sweep = sectorSweepDegrees(shape.startDeg, shape.endDeg);
  if (!(sweep > 0)) return [];
  const steps = Math.max(2, Math.ceil((Math.max(8, segments) * sweep) / 360));
  const points = [[...shape.c]];
  for (let i = 0; i <= steps; i++)
    points.push(radialPoint(shape.c, shape.r, shape.startDeg + (sweep * i) / steps));
  points.push([...shape.c]);
  return points;
}

export function sectorAngleHandlePoints(roi) {
  const shape = normalizeRoi(roi);
  if (!shape || shape.type !== 'sector') return {};
  return {
    start: radialPoint(shape.c, shape.r, shape.startDeg),
    end: radialPoint(shape.c, shape.r, shape.endDeg),
  };
}

export function setSectorAngleFromPoint(roi, handle, point) {
  const shape = normalizeRoi(roi);
  if (
    !shape ||
    shape.type !== 'sector' ||
    !['start', 'end'].includes(handle) ||
    !Array.isArray(point)
  )
    return shape;

  const dx = Number(point[0]) - shape.c[0],
    dy = Number(point[1]) - shape.c[1];
  if (!finitePoint(dx, dy) || Math.hypot(dx, dy) <= 1e-12) return shape;

  const raw = (Math.atan2(dy, dx) * 180) / Math.PI,
    angle = ((raw % 360) + 360) % 360;
  return {
    ...shape,
    ...(handle === 'start' ? { startDeg: angle } : { endDeg: angle }),
  };
}

export function normalizeRoi(roi) {
  if (!roi || typeof roi !== 'object') return null;
  if (roi.type === 'rect' && Array.isArray(roi.a) && Array.isArray(roi.b)) {
    const x0 = Math.min(Number(roi.a[0]), Number(roi.b[0])),
      x1 = Math.max(Number(roi.a[0]), Number(roi.b[0])),
      y0 = Math.min(Number(roi.a[1]), Number(roi.b[1])),
      y1 = Math.max(Number(roi.a[1]), Number(roi.b[1]));
    if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
    return { type: 'rect', a: [x0, y0], b: [x1, y1] };
  }
  if ((roi.type === 'circle' || roi.type === 'sector') && Array.isArray(roi.c)) {
    const x = Number(roi.c[0]),
      y = Number(roi.c[1]),
      radius = Math.abs(Number(roi.r));
    if (!finitePoint(x, y) || !Number.isFinite(radius)) return null;
    if (roi.type === 'sector') {
      const startDeg = Number(roi.startDeg),
        endDeg = Number(roi.endDeg);
      if (!Number.isFinite(startDeg) || !Number.isFinite(endDeg)) return null;
      return { type: 'sector', c: [x, y], r: radius, startDeg, endDeg };
    }
    return { type: 'circle', c: [x, y], r: radius };
  }
  return null;
}

export function roiAnchorPoint(roi, anchor = 'center') {
  const shape = normalizeRoi(roi);
  if (!shape) return null;
  const key = validAnchor(anchor);
  if (shape.type === 'circle' || shape.type === 'sector') {
    const [cx, cy] = shape.c,
      r = shape.r;
    if (key === 'top-left') return [cx - r, cy + r];
    if (key === 'bottom-left') return [cx - r, cy - r];
    if (key === 'top-right') return [cx + r, cy + r];
    if (key === 'bottom-right') return [cx + r, cy - r];
    return [cx, cy];
  }
  const [x0, y0] = shape.a,
    [x1, y1] = shape.b;
  if (key === 'top-left') return [x0, y1];
  if (key === 'bottom-left') return [x0, y0];
  if (key === 'top-right') return [x1, y1];
  if (key === 'bottom-right') return [x1, y0];
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export function rectRoiFromAnchor(width, height, anchor, x, y) {
  width = Number(width);
  height = Number(height);
  x = Number(x);
  y = Number(y);
  if (!(width > 0) || !(height > 0) || !finitePoint(x, y)) return null;
  const key = validAnchor(anchor);
  let x0, x1, y0, y1;
  if (key === 'top-left') {
    x0 = x;
    x1 = x + width;
    y0 = y - height;
    y1 = y;
  } else if (key === 'bottom-left') {
    x0 = x;
    x1 = x + width;
    y0 = y;
    y1 = y + height;
  } else if (key === 'top-right') {
    x0 = x - width;
    x1 = x;
    y0 = y - height;
    y1 = y;
  } else if (key === 'bottom-right') {
    x0 = x - width;
    x1 = x;
    y0 = y;
    y1 = y + height;
  } else {
    x0 = x - width / 2;
    x1 = x + width / 2;
    y0 = y - height / 2;
    y1 = y + height / 2;
  }
  return { type: 'rect', a: [x0, y0], b: [x1, y1] };
}

function radialCenterFromAnchor(radius, anchor, x, y) {
  radius = Number(radius);
  x = Number(x);
  y = Number(y);
  if (!(radius > 0) || !finitePoint(x, y)) return null;
  const key = validAnchor(anchor);
  let cx = x,
    cy = y;
  if (key === 'top-left') {
    cx += radius;
    cy -= radius;
  } else if (key === 'bottom-left') {
    cx += radius;
    cy += radius;
  } else if (key === 'top-right') {
    cx -= radius;
    cy -= radius;
  } else if (key === 'bottom-right') {
    cx -= radius;
    cy += radius;
  }
  return [cx, cy];
}

export function circleRoiFromAnchor(radius, anchor, x, y) {
  const center = radialCenterFromAnchor(radius, anchor, x, y);
  return center ? { type: 'circle', c: center, r: Number(radius) } : null;
}

export function sectorRoiFromAnchor(radius, startDeg, endDeg, anchor, x, y) {
  const center = radialCenterFromAnchor(radius, anchor, x, y),
    start = Number(startDeg),
    end = Number(endDeg);
  if (!center || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { type: 'sector', c: center, r: Number(radius), startDeg: start, endDeg: end };
}

export function translateRoi(roi, dx, dy) {
  const shape = normalizeRoi(roi);
  dx = Number(dx);
  dy = Number(dy);
  if (!shape || !finitePoint(dx, dy)) return shape;
  if (shape.type === 'circle' || shape.type === 'sector')
    return { ...shape, c: [shape.c[0] + dx, shape.c[1] + dy] };
  return {
    ...shape,
    a: [shape.a[0] + dx, shape.a[1] + dy],
    b: [shape.b[0] + dx, shape.b[1] + dy],
  };
}

export function roiContainsPoint(roi, point) {
  const shape = normalizeRoi(roi);
  if (!shape || !Array.isArray(point)) return false;
  const x = Number(point[0]),
    y = Number(point[1]);
  if (!finitePoint(x, y)) return false;
  if (shape.type === 'circle') return Math.hypot(x - shape.c[0], y - shape.c[1]) <= shape.r;
  if (shape.type === 'sector') {
    const dx = x - shape.c[0],
      dy = y - shape.c[1];
    if (Math.hypot(dx, dy) > shape.r) return false;
    const sweep = sectorSweepDegrees(shape.startDeg, shape.endDeg);
    if (!(sweep > 0)) return false;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = (((angle - shape.startDeg) % 360) + 360) % 360;
    return delta <= sweep + 1e-9;
  }
  return x >= shape.a[0] && x <= shape.b[0] && y >= shape.a[1] && y <= shape.b[1];
}

export function roiHandlePoints(roi) {
  const shape = normalizeRoi(roi);
  if (!shape) return {};
  if (shape.type === 'circle' || shape.type === 'sector') {
    const [cx, cy] = shape.c;
    const r = shape.r;
    return {
      'top-left': [cx - r, cy + r],
      'top-right': [cx + r, cy + r],
      'bottom-left': [cx - r, cy - r],
      'bottom-right': [cx + r, cy - r],
    };
  }
  return {
    'top-left': [shape.a[0], shape.b[1]],
    'top-right': [shape.b[0], shape.b[1]],
    'bottom-left': [shape.a[0], shape.a[1]],
    'bottom-right': [shape.b[0], shape.a[1]],
  };
}

export function resizeRoiFromHandle(roi, handle, point) {
  const shape = normalizeRoi(roi);
  if (!shape || !Array.isArray(point) || !finitePoint(Number(point[0]), Number(point[1])))
    return shape;

  const opposite = {
    'top-left': 'bottom-right',
    'top-right': 'bottom-left',
    'bottom-left': 'top-right',
    'bottom-right': 'top-left',
  }[handle];
  if (!opposite) return shape;

  const fixed = roiHandlePoints(shape)[opposite];
  if (!fixed) return shape;

  const px = Number(point[0]);
  const py = Number(point[1]);

  if (shape.type === 'rect') {
    if (Math.abs(px - fixed[0]) <= 1e-12 || Math.abs(py - fixed[1]) <= 1e-12) return shape;
    return normalizeRoi({ type: 'rect', a: fixed, b: [px, py] });
  }

  const side = Math.max(Math.abs(px - fixed[0]), Math.abs(py - fixed[1]));
  if (!(side > 1e-12)) return shape;

  const signX = Math.sign(px - fixed[0]) || (handle.includes('left') ? -1 : 1);
  const signY = Math.sign(py - fixed[1]) || (handle.includes('top') ? 1 : -1);
  const dragged = [fixed[0] + signX * side, fixed[1] + signY * side];
  return {
    ...shape,
    c: [(fixed[0] + dragged[0]) / 2, (fixed[1] + dragged[1]) / 2],
    r: side / 2,
  };
}
