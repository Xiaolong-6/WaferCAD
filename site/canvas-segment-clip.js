/** Clip a display-only line to a Canvas viewport before costly dashed strokes. */
export function clipCanvasSegment(a, b, width, height, margin = 4) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height))
    return [a, b];
  if (![...a, ...b].every(Number.isFinite)) return null;
  const x0 = a[0],
    y0 = a[1],
    dx = b[0] - x0,
    dy = b[1] - y0;
  const minX = -margin,
    maxX = width + margin,
    minY = -margin,
    maxY = height + margin;
  let enter = 0,
    leave = 1;
  for (const [p, q] of [
    [-dx, x0 - minX],
    [dx, maxX - x0],
    [-dy, y0 - minY],
    [dy, maxY - y0],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const fraction = q / p;
      if (p < 0) enter = Math.max(enter, fraction);
      else leave = Math.min(leave, fraction);
      if (enter > leave) return null;
    }
  }
  return [
    [x0 + enter * dx, y0 + enter * dy],
    [x0 + leave * dx, y0 + leave * dy],
  ];
}
