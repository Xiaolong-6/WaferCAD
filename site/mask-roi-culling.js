// Conservative Mask-ROI broad-phase culling. Both imported File elements and
// Mask ROI are stored in mask-local coordinates; alignment applies to both.
// This rejects only disjoint bounds, never alters source polygons or precision.
import { normalizeMaskRoi } from './mask-roi-geometry.js';

function overlap(a, b) {
  if (!a || !b) return true; // Invalid inputs fail open to the exact geometry kernel.
  const magnitude = Math.max(
    1,
    Math.abs(a.minX),
    Math.abs(a.minY),
    Math.abs(a.maxX),
    Math.abs(a.maxY),
    Math.abs(b.minX),
    Math.abs(b.minY),
    Math.abs(b.maxX),
    Math.abs(b.maxY),
  );
  const tolerance = Math.max(1e-10, magnitude * 1e-12);
  return (
    a.minX <= b.maxX + tolerance &&
    a.maxX >= b.minX - tolerance &&
    a.minY <= b.maxY + tolerance &&
    a.maxY >= b.minY - tolerance
  );
}

function pointBounds(points, margin = 0) {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const [x, y] = point.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };
}

export function maskRoiLocalBounds(roi) {
  const shape = normalizeMaskRoi(roi);
  if (!shape) return null;
  const extent =
    shape.type === 'circle'
      ? shape.r
      : (shape.size / 2) *
        (Math.abs(Math.cos((shape.rotation * Math.PI) / 180)) +
          Math.abs(Math.sin((shape.rotation * Math.PI) / 180)));
  return {
    minX: shape.c[0] - extent,
    minY: shape.c[1] - extent,
    maxX: shape.c[0] + extent,
    maxY: shape.c[1] + extent,
  };
}

export function maskElementMayDefineArea(element) {
  return (
    (element?.kind === 'polygon' && element.points?.length >= 3) ||
    (element?.kind === 'path' && element.points?.length >= 2 && Number(element.width) > 0)
  );
}

export function maskElementMayIntersectRoi(element, roiBounds) {
  if (!roiBounds) return true;
  const margin =
    element?.kind === 'path' && Number.isFinite(Number(element.width))
      ? Math.abs(Number(element.width)) / 2
      : 0;
  return overlap(pointBounds(element?.points, margin), roiBounds);
}

export function drawShapeMayIntersectRoi(shape, roiBounds) {
  if (!roiBounds) return true;
  if (!shape || typeof shape !== 'object') return true;
  if (shape.type === 'rect') {
    return overlap(pointBounds([shape.a, shape.b]), roiBounds);
  }
  if (shape.type === 'polygon') {
    return overlap(pointBounds(shape.points), roiBounds);
  }
  if (['circle', 'ring', 'ring-sector'].includes(shape.type)) {
    const radius = Number(shape.type === 'circle' ? shape.r : shape.outerR);
    if (!Array.isArray(shape.c) || !Number.isFinite(radius)) return true;
    const [x, y] = shape.c.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const r = Math.abs(radius);
    return overlap({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }, roiBounds);
  }
  return true;
}
