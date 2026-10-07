// Derived edge lookup. Exact signatures detect edits, including in-place edits.
// Geometry remains authoritative; this cache is never saved in a project.
const indexes = new WeakMap();
const sharedIndexes = new Map();
let sharedPoints = 0;
const MAX_POINTS = 250000;
const bounds = (ring) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
};
const overlaps = (a, b, padding = 0.0002) =>
  a.minX <= b.maxX + padding &&
  a.maxX >= b.minX - padding &&
  a.minY <= b.maxY + padding &&
  a.maxY >= b.minY - padding;

export function prepareBoundaryIndex(geometry) {
  const signature = JSON.stringify(geometry);
  const cached = indexes.get(geometry);
  if (cached?.signature === signature) return cached;
  if (sharedIndexes.has(signature)) {
    const hit = sharedIndexes.get(signature);
    indexes.set(geometry, hit);
    return hit;
  }
  const snapshot = structuredClone(geometry);
  const polygons = snapshot.map((polygon) => ({ polygon, rings: polygon.map(bounds) }));
  const rings = snapshot.flatMap((polygon) =>
    polygon.map((ring) => ({
      ring,
      edges: ring.slice(1).map((b, i) => {
        const a = ring[i];
        return {
          a,
          b,
          minX: Math.min(a[0], b[0]),
          maxX: Math.max(a[0], b[0]),
          minY: Math.min(a[1], b[1]),
          maxY: Math.max(a[1], b[1]),
        };
      }),
    })),
  );
  const points = rings.reduce((n, r) => n + r.ring.length, 0);
  const index = { signature, rings, polygons, points };
  if (points <= MAX_POINTS && signature.length <= 2000000) {
    while (sharedIndexes.size >= 128 || sharedPoints + points > MAX_POINTS) {
      const oldest = sharedIndexes.keys().next().value;
      sharedPoints -= sharedIndexes.get(oldest).points;
      sharedIndexes.delete(oldest);
    }
    sharedIndexes.set(signature, index);
    sharedPoints += points;
  }
  indexes.set(geometry, index);
  return index;
}
export function boundaryChains(index, bounds, padding = 0) {
  const chains = [];
  for (const { ring, edges } of index.rings) {
    const selected = edges.map(
      (e) =>
        e.minX <= bounds.maxX + padding &&
        e.maxX >= bounds.minX - padding &&
        e.minY <= bounds.maxY + padding &&
        e.maxY >= bounds.minY - padding,
    );
    if (selected.every(Boolean)) {
      chains.push({ points: ring.slice(0, -1), closed: true });
      continue;
    }
    const gap = selected.findIndex((hit) => !hit);
    let points = [];
    for (let step = 1; step <= edges.length; step++) {
      const i = (gap + step) % edges.length;
      if (selected[i]) {
        if (!points.length) points.push(edges[i].a);
        points.push(edges[i].b);
      } else if (points.length) {
        chains.push({ points, closed: false });
        points = [];
      }
    }
    if (points.length) chains.push({ points, closed: false });
  }
  return chains;
}
export function prepareModelBoundaryIndexes(model) {
  const parts = model?.array?.templates?.map((t) => t.model) || [model];
  for (const part of parts)
    for (const region of part?.regions || []) prepareBoundaryIndex(region.geom);
}

// Omitting polygons and holes whose boxes cannot meet the other input is exact.
// Include two persistence-grid cells so quantized boolean retry stays conservative.
export function indexedIntersectionInputs(a, b, operationCache = null) {
  if (!a.length || !b.length) return [[], []];
  const indexed = (geometry) => {
    if (!operationCache) return prepareBoundaryIndex(geometry);
    if (!operationCache.has(geometry)) operationCache.set(geometry, prepareBoundaryIndex(geometry));
    return operationCache.get(geometry);
  };
  const ai = indexed(a),
    bi = indexed(b);
  const candidates = (own, other) =>
    own.polygons.flatMap(({ polygon, rings }) => {
      const neighbors = other.polygons.filter((p) => overlaps(rings[0], p.rings[0]));
      if (!neighbors.length) return [];
      return [
        [
          polygon[0],
          ...polygon
            .slice(1)
            .filter((_, i) => neighbors.some((p) => overlaps(rings[i + 1], p.rings[0]))),
        ],
      ];
    });
  return [candidates(ai, bi), candidates(bi, ai)];
}
export async function prewarmModelBoundaryIndexes(
  model,
  isCurrent = () => true,
  yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
) {
  const parts = model?.array?.templates?.map((t) => t.model) || [model];
  let count = 0,
    points = 0;
  for (const part of parts)
    for (const region of part?.regions || []) {
      if (!isCurrent()) return { count, cancelled: true };
      const size = region.geom.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
      if (size > 50000 || points + size > MAX_POINTS) return { count, bounded: true };
      const index = prepareBoundaryIndex(region.geom);
      points += index.points;
      count++;
      if (points >= MAX_POINTS) return { count, bounded: true };
      await yieldTask();
    }
  return { count, cancelled: false };
}
