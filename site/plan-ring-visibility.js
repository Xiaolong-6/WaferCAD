// Conservative display-only culling of planar polygon rings. The renderer
// still uses the exact world vertices for every ring touching the viewport.
// No model geometry, polygon ownership, fill winding or exports are changed.
export function ringMayIntersectCanvas(ring, view, width, height, back = false, margin = 6) {
  if (!Array.isArray(ring) || !ring.length) return false;
  if (!Number.isFinite(view?.s) || view.s <= 0) return true;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const point of ring) {
    if (!Number.isFinite(point?.[0]) || !Number.isFinite(point?.[1])) return true;
    xMin = Math.min(xMin, point[0]);
    xMax = Math.max(xMax, point[0]);
    yMin = Math.min(yMin, point[1]);
    yMax = Math.max(yMax, point[1]);
  }
  const a = view.cx + (back ? -xMax : xMin) * view.s;
  const b = view.cx + (back ? -xMin : xMax) * view.s;
  const top = view.cy - yMax * view.s;
  const bottom = view.cy - yMin * view.s;
  return b >= -margin && a <= width + margin && bottom >= -margin && top <= height + margin;
}
