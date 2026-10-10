// Display-only Section viewport. Coordinates are CSS pixels, physical geometry stays in µm.
// A single affine map is applied inside the Section compositor, never as a CSS transform.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 32;
const MAX_PAN = 100000;
const finiteOr = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function normalizeSectionViewport(input = null) {
  return {
    zoom: clamp(finiteOr(input?.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    panX: clamp(finiteOr(input?.panX, 0), -MAX_PAN, MAX_PAN),
    panY: clamp(finiteOr(input?.panY, 0), -MAX_PAN, MAX_PAN),
  };
}

export function sectionViewportMap(value, extent, pan, zoom) {
  return (value - extent / 2) * zoom + extent / 2 + pan;
}

export function sectionViewportUnmap(value, extent, pan, zoom) {
  return (value - extent / 2 - pan) / zoom + extent / 2;
}

export function panSectionViewport(view, dx, dy) {
  const current = normalizeSectionViewport(view);
  return normalizeSectionViewport({
    ...current,
    panX: current.panX + finiteOr(dx, 0),
    panY: current.panY + finiteOr(dy, 0),
  });
}

export function zoomSectionViewportAt(view, factor, x, y, width, height) {
  const current = normalizeSectionViewport(view);
  const next = normalizeSectionViewport({
    ...current,
    zoom: current.zoom * clamp(finiteOr(factor, 1), 0.05, 20),
  });
  const zoom = next.zoom;
  const cx = Math.max(1, finiteOr(width, 1)) / 2;
  const cy = Math.max(1, finiteOr(height, 1)) / 2;
  const px = finiteOr(x, cx), py = finiteOr(y, cy);
  // Keep the material/physical point under the pointer fixed during zoom.
  const baseX = (px - cx - current.panX) / current.zoom;
  const baseY = (py - cy - current.panY) / current.zoom;
  return normalizeSectionViewport({
    zoom,
    panX: px - cx - baseX * zoom,
    panY: py - cy - baseY * zoom,
  });
}
