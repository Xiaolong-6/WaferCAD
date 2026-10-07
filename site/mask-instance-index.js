import { geometryBounds, translateGeometry } from './model-array.js';

// Derived import-time index. Original layout elements remain authoritative;
// only byte-exact translation matches share a template. No index is persisted.
const layoutIndexes = new WeakMap();
function point(p, t) {
  const angle = ((Number(t.rotation) || 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    scale = Number(t.scale) || 1;
  const x = p[0] * scale,
    y = p[1] * scale;
  return [x * c - y * s + (Number(t.x) || 0), x * s + y * c + (Number(t.y) || 0)];
}
export function compileMaskInstanceIndex(elements, transform = {}) {
  const templates = [],
    instances = [],
    keys = new Map();
  for (const [elementIndex, e] of elements.entries()) {
    if (!['polygon', 'path'].includes(e.kind) || !e.points?.length) continue;
    const points = e.points.map((p) => point(p, transform));
    let [x, y] = points[0];
    let local = translateGeometry([[points]], -x, -y)[0][0];
    const reconstructed = translateGeometry([[local]], x, y)[0][0];
    if (JSON.stringify(reconstructed) !== JSON.stringify(points)) {
      x = 0;
      y = 0;
      local = points;
    }
    const width = e.kind === 'path' ? e.width * Math.abs(Number(transform.scale) || 1) : 0;
    const key = JSON.stringify([e.kind, width, local]);
    let templateId = keys.get(key);
    if (templateId === undefined) {
      templateId = templates.length;
      templates.push({ kind: e.kind, width, points: local });
      keys.set(key, templateId);
    }
    const b = geometryBounds([[points]]),
      margin = width / 2;
    instances.push({
      templateId,
      x,
      y,
      elementIndex,
      bounds: {
        minX: b.minX - margin,
        minY: b.minY - margin,
        maxX: b.maxX + margin,
        maxY: b.maxY + margin,
      },
    });
  }
  return withMaskSpatialIndex({ version: 1, templates, instances, elementCount: elements.length });
}
export function prepareMaskInstanceIndex(layout, transform = {}) {
  let cache = layoutIndexes.get(layout);
  if (!cache || cache.elements !== layout.elements) {
    cache = { elements: layout.elements, transforms: new Map() };
    layoutIndexes.set(layout, cache);
  }
  const key = JSON.stringify([
    transform.x || 0,
    transform.y || 0,
    transform.scale ?? 1,
    transform.rotation || 0,
  ]);
  let entry = cache.transforms.get(key);
  if (!entry) {
    entry = {
      index: compileMaskInstanceIndex(layout.elements || [], transform),
      selections: new Map(),
    };
    if (cache.transforms.size >= 8) cache.transforms.clear();
    cache.transforms.set(key, entry);
  }
  return entry;
}
export function selectedMaskInstanceIndex(layout, selectedElement, transform = {}) {
  const entry = prepareMaskInstanceIndex(layout, transform),
    indices = [];
  (layout.elements || []).forEach((e, i) => {
    if (selectedElement(e)) indices.push(i);
  });
  const key = indices.join(',');
  if (!entry.selections.has(key)) {
    if (entry.selections.size >= 16) entry.selections.clear();
    const selected = new Set(indices);
    entry.selections.set(
      key,
      withMaskSpatialIndex({
        ...entry.index,
        instances: entry.index.instances.filter((i) => selected.has(i.elementIndex)),
      }),
    );
  }
  return entry.selections.get(key);
}
export function attachArrayMaskQuery(area, query) {
  Object.defineProperty(area, 'arrayMaskQuery', { value: query });
  return area;
}

function withMaskSpatialIndex(index) {
  const order = index.instances
    .map((_, i) => i)
    .sort((a, b) => index.instances[a].bounds.minX - index.instances[b].bounds.minX);
  let max = -Infinity;
  const minX = [],
    prefixMaxX = [];
  for (const i of order) {
    const b = index.instances[i].bounds;
    minX.push(b.minX);
    max = Math.max(max, b.maxX);
    prefixMaxX.push(max);
  }
  return { ...index, spatial: { order, minX, prefixMaxX } };
}
export function queryMaskInstances(index, bounds) {
  if (!index.spatial)
    return index.instances.filter(
      (i) =>
        i.bounds.minX < bounds.maxX &&
        i.bounds.maxX > bounds.minX &&
        i.bounds.minY < bounds.maxY &&
        i.bounds.maxY > bounds.minY,
    );
  const { order, minX, prefixMaxX } = index.spatial;
  const lowerBound = (values, target) => {
    let lo = 0,
      hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const start = lowerBound(prefixMaxX, bounds.minX),
    end = lowerBound(minX, bounds.maxX),
    hits = [];
  for (let k = start; k < end; k++) {
    const i = index.instances[order[k]],
      b = i.bounds;
    if (b.maxX > bounds.minX && b.minY < bounds.maxY && b.maxY > bounds.minY) hits.push(i);
  }
  return hits;
}
