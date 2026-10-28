// Exact display signed-distance lookup with a conservative spatial hierarchy.
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

// Derived display geometry samples the same physical signed distance at many
// nearby XY vertices. Compile the immutable source segments once and use a
// conservative AABB hierarchy for nearest-edge queries; never approximate or
// quantize the distance. Point-in-ring classification keeps the exact contract.
export function compileContinuousFootprintDistance(multi) {
  const polygons = (multi || []).map((poly) => ({
    rings: poly,
    outerBounds: poly[0]?.reduce(
      (b, p) => [
        Math.min(b[0], p[0]),
        Math.min(b[1], p[1]),
        Math.max(b[2], p[0]),
        Math.max(b[3], p[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    ),
  }));
  const segments = [];
  for (const poly of multi || [])
    for (const ring of poly)
      for (let k = 1; k < ring.length; k++) {
        const a = ring[k - 1],
          b = ring[k];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        segments.push({
          x: a[0],
          y: a[1],
          dx,
          dy,
          length2: dx * dx + dy * dy,
          minX: Math.min(a[0], b[0]),
          minY: Math.min(a[1], b[1]),
          maxX: Math.max(a[0], b[0]),
          maxY: Math.max(a[1], b[1]),
        });
      }
  function tree(list) {
    if (!list.length) return null;
    const box = list.reduce(
      (b, e) => {
        b.minX = Math.min(b.minX, e.minX);
        b.minY = Math.min(b.minY, e.minY);
        b.maxX = Math.max(b.maxX, e.maxX);
        b.maxY = Math.max(b.maxY, e.maxY);
        return b;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    if (list.length <= 8) return { ...box, segments: list };
    const axis = box.maxX - box.minX >= box.maxY - box.minY ? 'x' : 'y';
    list.sort((a, b) =>
      axis === 'x' ? a.minX + a.maxX - (b.minX + b.maxX) : a.minY + a.maxY - (b.minY + b.maxY),
    );
    const half = Math.floor(list.length / 2);
    return { ...box, left: tree(list.slice(0, half)), right: tree(list.slice(half)) };
  }
  const root = tree(segments);
  const boxDist2 = (node, x, y) => {
    const dx = Math.max(node.minX - x, 0, x - node.maxX),
      dy = Math.max(node.minY - y, 0, y - node.maxY);
    return dx * dx + dy * dy;
  };
  function nearest(node, x, y, best) {
    if (!node || boxDist2(node, x, y) > best) return best;
    if (node.segments) {
      for (const seg of node.segments) {
        if (boxDist2(seg, x, y) > best) continue;
        // Identical arithmetic and segment endpoints to the original O(N)
        // distance function. The tree only prunes provably non-nearest edges.
        const t = seg.length2
          ? Math.max(0, Math.min(1, ((x - seg.x) * seg.dx + (y - seg.y) * seg.dy) / seg.length2))
          : 0;
        const rx = x - seg.x - t * seg.dx,
          ry = y - seg.y - t * seg.dy;
        best = Math.min(best, rx * rx + ry * ry);
      }
      return best;
    }
    const dl = boxDist2(node.left, x, y),
      dr = boxDist2(node.right, x, y);
    if (dl <= dr) {
      best = nearest(node.left, x, y, best);
      return dr <= best ? nearest(node.right, x, y, best) : best;
    }
    best = nearest(node.right, x, y, best);
    return dl <= best ? nearest(node.left, x, y, best) : best;
  }
  return (x, y) => {
    let inside = false;
    for (const { rings, outerBounds } of polygons) {
      if (x < outerBounds[0] || x > outerBounds[2] || y < outerBounds[1] || y > outerBounds[3])
        continue;
      if (pointInRing(x, y, rings[0]) && !rings.slice(1).some((r) => pointInRing(x, y, r)))
        inside = true;
    }
    const magnitude = Math.sqrt(nearest(root, x, y, Infinity));
    return inside ? magnitude : -magnitude;
  };
}
