const MIN_EXTENT = 0.025;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSectionDetailRoi(value) {
  if (!value || typeof value !== 'object') return null;

  let x = Number(value.x),
    y = Number(value.y),
    width = Number(value.width),
    height = Number(value.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;

  width = clamp(Math.abs(width), MIN_EXTENT, 1);
  height = clamp(Math.abs(height), MIN_EXTENT, 1);
  x = clamp(x, 0, Math.max(0, 1 - width));
  y = clamp(y, 0, Math.max(0, 1 - height));

  return {
    x,
    y,
    width,
    height,
    shape: value.shape === 'circle' ? 'circle' : 'rect',
  };
}

export function sectionDetailRoiFromPoints(start, end, shape = 'rect') {
  const x0 = clamp(Math.min(Number(start?.x), Number(end?.x)), 0, 1),
    y0 = clamp(Math.min(Number(start?.y), Number(end?.y)), 0, 1),
    x1 = clamp(Math.max(Number(start?.x), Number(end?.x)), 0, 1),
    y1 = clamp(Math.max(Number(start?.y), Number(end?.y)), 0, 1);

  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;

  return normalizeSectionDetailRoi({
    x: x0,
    y: y0,
    width: Math.max(MIN_EXTENT, x1 - x0),
    height: Math.max(MIN_EXTENT, y1 - y0),
    shape,
  });
}

export function translateSectionDetailRoi(value, dx, dy) {
  const roi = normalizeSectionDetailRoi(value);
  if (!roi) return null;
  return normalizeSectionDetailRoi({
    ...roi,
    x: roi.x + Number(dx || 0),
    y: roi.y + Number(dy || 0),
  });
}

export { MIN_EXTENT as SECTION_DETAIL_ROI_MIN_EXTENT };
