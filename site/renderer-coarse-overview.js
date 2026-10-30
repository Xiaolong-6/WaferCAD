// Conservative, display-only wafer overview when the exact cap sketch exceeds
// the first-frame budget. Each occupied cell over-approximates polygon coverage;
// it is never a valid owned surface, manufacturing mask, export or query input.
const GRID = 48;
const MAX_CAPS = 4096;
const MAX_LINES = 120000;
const MAX_POINTS = 120000;

function boundsOfVisibleGeometry(model, visible) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const region of model.regions) {
    if (!(region.stack || []).some((part) => visible.has(part.layerId))) continue;
    for (const poly of region.geom || []) {
      if (!Array.isArray(poly) || !poly.length) return null;
      for (const ring of poly) {
        if (!Array.isArray(ring) || ring.length < 4) return null;
        for (const point of ring) {
          const x = Number(point?.[0]);
          const y = Number(point?.[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite) && maxX > minX && maxY > minY
    ? { minX, minY, maxX, maxY }
    : null;
}

function mergeOccupiedTiles(cells, bounds, stepX, stepY) {
  const rectangles = [];
  let active = new Map();
  // Merge identical horizontal runs across adjacent rows. This avoids
  // thousands of coplanar triangles for a full-wafer substrate.
  for (let y = 0; y <= GRID; y++) {
    const next = new Map();
    for (let x = 0; x < GRID && y < GRID;) {
      if (!cells[y * GRID + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < GRID && cells[y * GRID + x]) x++;
      const key = start + ':' + x;
      const rectangle = active.get(key) || { x0: start, x1: x, y0: y, y1: y };
      rectangle.y1 = y + 1;
      next.set(key, rectangle);
    }
    for (const [key, rectangle] of active) {
      if (!next.has(key)) rectangles.push(rectangle);
    }
    active = next;
  }
  return rectangles.map(({ x0, x1, y0, y1 }) => {
    const left = bounds.minX + x0 * stepX;
    const right = bounds.minX + x1 * stepX;
    const bottom = bounds.minY + y0 * stepY;
    const top = bounds.minY + y1 * stepY;
    return [
      [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
        [left, bottom],
      ],
    ];
  });
}

export function buildCoarseCoveragePreview(model) {
  if (!model || !Array.isArray(model.regions) || model.array) return null;
  const visible = new Set(
    (model.layers || []).filter((layer) => layer.visible !== false).map((layer) => layer.id),
  );
  const bounds = boundsOfVisibleGeometry(model, visible);
  if (!bounds) return null;
  const stepX = (bounds.maxX - bounds.minX) / GRID;
  const stepY = (bounds.maxY - bounds.minY) / GRID;
  const borderPositions = new Float32Array(MAX_LINES * 6);
  let lines = 0;
  let points = 0;
  const caps = [];
  const addEdge = (x0, y0, x1, y1, z) => {
    if (lines >= MAX_LINES) return false;
    const i = lines++ * 6;
    borderPositions[i] = x0;
    borderPositions[i + 1] = y0;
    borderPositions[i + 2] = z;
    borderPositions[i + 3] = x1;
    borderPositions[i + 4] = y1;
    borderPositions[i + 5] = z;
    return true;
  };

  for (const region of model.regions) {
    const stack = (region.stack || []).filter((part) => visible.has(part.layerId));
    if (!stack.length) continue;
    const bottom = stack[0];
    const top = stack[stack.length - 1];
    if (![bottom.z0, top.z1].every(Number.isFinite)) return null;
    if (caps.length + 2 > MAX_CAPS) return null;
    const cells = new Uint8Array(GRID * GRID);
    for (const poly of region.geom || []) {
      if (!Array.isArray(poly) || !poly.length) return null;
      // The outer ring bounds conservatively cover holes and narrow slivers.
      const ring = poly[0];
      if (!Array.isArray(ring) || ring.length < 4) return null;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const points of poly) {
        if (!Array.isArray(points) || points.length < 4) return null;
        for (const point of points) {
          const x = Number(point?.[0]);
          const y = Number(point?.[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        }
      }
      for (const point of ring) {
        x0 = Math.min(x0, point[0]);
        y0 = Math.min(y0, point[1]);
        x1 = Math.max(x1, point[0]);
        y1 = Math.max(y1, point[1]);
      }
      const left = Math.max(0, Math.min(GRID - 1, Math.floor((x0 - bounds.minX) / stepX)));
      const right = Math.max(0, Math.min(GRID - 1, Math.floor((x1 - bounds.minX) / stepX)));
      const bottomRow = Math.max(0, Math.min(GRID - 1, Math.floor((y0 - bounds.minY) / stepY)));
      const topRow = Math.max(0, Math.min(GRID - 1, Math.floor((y1 - bounds.minY) / stepY)));
      for (let row = bottomRow; row <= topRow; row++) {
        cells.fill(1, row * GRID + left, row * GRID + right + 1);
      }
    }
    const polys = mergeOccupiedTiles(cells, bounds, stepX, stepY);
    points += polys.length * 5;
    if (points > MAX_POINTS) return null;
    if (!polys.length) continue;
    caps.push({ layerId: top.layerId, z: top.z1, normal: 1, polys });
    caps.push({ layerId: bottom.layerId, z: bottom.z0, normal: -1, polys });
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (!cells[row * GRID + col]) continue;
        const x0 = bounds.minX + col * stepX;
        const x1 = x0 + stepX;
        const y0 = bounds.minY + row * stepY;
        const y1 = y0 + stepY;
        if (col === 0 || !cells[row * GRID + col - 1])
          if (!addEdge(x0, y0, x0, y1, top.z1)) return null;
        if (col === GRID - 1 || !cells[row * GRID + col + 1])
          if (!addEdge(x1, y0, x1, y1, top.z1)) return null;
        if (row === 0 || !cells[(row - 1) * GRID + col])
          if (!addEdge(x0, y0, x1, y0, top.z1)) return null;
        if (row === GRID - 1 || !cells[(row + 1) * GRID + col])
          if (!addEdge(x0, y1, x1, y1, top.z1)) return null;
      }
    }
  }
  if (!caps.length) return null;
  return {
    kind: 'approximate-caps-preview',
    approximation: 'coverage-grid',
    gridSize: GRID,
    caps,
    borderPositions: borderPositions.slice(0, lines * 6),
    lineCount: lines,
  };
}
