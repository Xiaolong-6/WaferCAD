/**
 * GDS keyhole polygons may encode holes with a repeated, zero-width connector.
 * Such connectors have coincident edges traversed in opposite directions.
 * They carry no filled area and must not be shown as physical Mask borders.
 *
 * Return null for ordinary polygons (the existing Canvas fast path). For
 * keyhole rings, return the outline edge pairs after cancelling each matched
 * pair of opposite directed edges. The source points remain untouched.
 */
export function maskVisibleOutlineEdges(points) {
  if (!Array.isArray(points) || points.length < 6) return null;
  const count = points.length;
  const ids = new Map();
  const vertices = points.map(([x, y]) => {
    const key = `${x},${y}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  });
  if (ids.size === count) return null;

  const directions = new Map();
  for (let i = 0; i < count; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % count];
    if (a === b) continue;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let entry = directions.get(k);
    if (!entry) {
      entry = { forward: [], backward: [] };
      directions.set(k, entry);
    }
    entry[a < b ? 'forward' : 'backward'].push(i);
  }
  const skip = new Set();
  for (const { forward, backward } of directions.values()) {
    const paired = Math.min(forward.length, backward.length);
    for (let n = 0; n < paired; n++) {
      skip.add(forward[n]);
      skip.add(backward[n]);
    }
  }
  if (!skip.size) return null;
  const edges = [];
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[(i + 1) % count];
    if (!skip.has(i) && vertices[i] !== vertices[(i + 1) % count]) edges.push([a, b]);
  }
  return edges;
}
