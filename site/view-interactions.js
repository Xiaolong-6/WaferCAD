export function nearestNamedPoint(point, points, radius = 18) {
  if (!Array.isArray(point) || !points || !(radius >= 0)) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const [name, candidate] of Object.entries(points)) {
    if (!Array.isArray(candidate)) continue;
    const distance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
    if (distance <= radius && distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

export function availableSelectedLayers(layers, selectedKeys, scopeCells) {
  if (!Array.isArray(layers) || !selectedKeys || !scopeCells) return [];
  return layers.filter(
    (item) =>
      selectedKeys.has(item.key) &&
      item.cells &&
      [...item.cells].some((cell) => scopeCells.has(cell)),
  );
}

export function minimumSegmentLength(pointGroups, extraSizes = []) {
  let minimum = Infinity;
  for (const size of extraSizes || []) {
    const value = Math.abs(Number(size));
    if (Number.isFinite(value) && value > 1e-12) minimum = Math.min(minimum, value);
  }
  for (const points of pointGroups || []) {
    if (!Array.isArray(points) || points.length < 2) continue;
    for (let i = 1; i < points.length; i++) {
      const dx = Number(points[i][0]) - Number(points[i - 1][0]);
      const dy = Number(points[i][1]) - Number(points[i - 1][1]);
      const length = Math.hypot(dx, dy);
      if (Number.isFinite(length) && length > 1e-12) minimum = Math.min(minimum, length);
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}

export function zoomLimitForFeature(
  basePixelsPerUnit,
  minimumFeature,
  { minimumZoom = 12, targetPixels = 72, maximumZoom = 1e8 } = {},
) {
  const base = Math.abs(Number(basePixelsPerUnit));
  const feature = Math.abs(Number(minimumFeature));
  if (!(base > 0) || !(feature > 0)) return minimumZoom;
  const desired = targetPixels / (base * feature);
  return Math.max(minimumZoom, Math.min(maximumZoom, desired));
}
