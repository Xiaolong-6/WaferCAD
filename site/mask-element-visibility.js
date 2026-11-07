/**
 * Conservative screen-space culling for source GDS polygons and paths.
 * Transform every corner of the original bounding rectangle; an affine
 * mask transform (including rotation/reflection) cannot escape this envelope.
 * Unknown/degenerate transforms fail open rather than silently hide a mask.
 * Source vertices and Process material remain untouched.
 */
export function maskSourceBounds(points) {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

export function maskElementInCanvas(
  bounds,
  transformPoint,
  worldToCanvas,
  view,
  width,
  height,
  padding = 3,
) {
  if (!bounds || !Number.isFinite(view?.s) || view.s <= 0 || !(width > 0 && height > 0))
    return true;
  const [minX, minY, maxX, maxY] = bounds;
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const corner of [
    [minX, minY],
    [minX, maxY],
    [maxX, minY],
    [maxX, maxY],
  ]) {
    const pixel = worldToCanvas(transformPoint(corner), view);
    if (!pixel?.every(Number.isFinite)) return true;
    left = Math.min(left, pixel[0]);
    right = Math.max(right, pixel[0]);
    top = Math.min(top, pixel[1]);
    bottom = Math.max(bottom, pixel[1]);
  }
  return !(
    right < -padding ||
    left > width + padding ||
    bottom < -padding ||
    top > height + padding
  );
}
