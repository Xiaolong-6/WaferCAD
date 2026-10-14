// Exact bounding-box connectivity for polygon Boolean union broad phases.
// Process only pairs whose x/y intervals overlap (inclusive of tolerance).
// A sweep over X expires finished boxes, and a segment tree indexed by the
// lower Y coordinate prunes disjoint rows without quadratic active-set scans.
// Geometry is never rounded, simplified or mutated here.
export function connectedBoundingBoxGroups(bounds, tolerance = 0) {
  const count = bounds.length;
  if (!count) return [];

  const parent = Array.from({ length: count }, (_, i) => i);
  const rank = new Uint8Array(count);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const join = (aIndex, bIndex) => {
    let a = find(aIndex);
    let b = find(bIndex);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };

  const indices = Array.from({ length: count }, (_, index) => index);
  const xOrder = [...indices].sort(
    (a, b) => bounds[a].minX - bounds[b].minX || a - b,
  );
  const yOrder = [...indices].sort(
    (a, b) => bounds[a].minY - bounds[b].minY || a - b,
  );
  const expiration = [...indices].sort(
    (a, b) => bounds[a].maxX - bounds[b].maxX || a - b,
  );
  const yPosition = new Uint32Array(count);
  yOrder.forEach((index, position) => {
    yPosition[index] = position;
  });

  let size = 1;
  while (size < count) size *= 2;
  const maxY = new Float64Array(2 * size);
  maxY.fill(-Infinity);
  const active = new Uint8Array(count);
  const setActive = (index, enabled) => {
    let node = size + yPosition[index];
    maxY[node] = enabled ? bounds[index].maxY : -Infinity;
    while (node > 1) {
      node = Math.floor(node / 2);
      maxY[node] = Math.max(maxY[node * 2], maxY[node * 2 + 1]);
    }
    active[index] = enabled ? 1 : 0;
  };

  const query = (node, left, right, end, minY, current) => {
    if (left >= end || maxY[node] < minY) return;
    if (right - left === 1) {
      join(current, yOrder[left]);
      return;
    }
    const middle = (left + right) / 2;
    query(node * 2, left, middle, end, minY, current);
    query(node * 2 + 1, middle, right, end, minY, current);
  };

  let expired = 0;
  for (const index of xOrder) {
    const current = bounds[index];
    // Equality matters: touching boundaries must still pass through the
    // original exact Boolean path, including the EPS tolerance.
    while (expired < count && bounds[expiration[expired]].maxX < current.minX - tolerance) {
      const candidate = expiration[expired++];
      if (active[candidate]) setActive(candidate, false);
    }

    const yLimit = current.maxY + tolerance;
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (bounds[yOrder[middle]].minY <= yLimit) low = middle + 1;
      else high = middle;
    }
    if (low) query(1, 0, size, low, current.minY - tolerance, index);
    setActive(index, true);
  }

  const groups = new Map();
  // Preserve the source ordering of both groups and members regardless of
  // the union-find root or spatial sweep order.
  for (let index = 0; index < count; index++) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  }
  return [...groups.values()];
}
