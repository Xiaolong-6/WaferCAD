const cross = (x, y, u, v) => BigInt(x) * BigInt(v) - BigInt(y) * BigInt(u);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function roundedRatio(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const sign = n < 0n ? -1n : 1n;
  const a = n < 0n ? -n : n;
  return Number(sign * ((a + d / 2n) / d));
}
function crossesPixel(a, b, p) {
  let lo = 0,
    hi = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (Math.abs(a[axis] - p[axis]) >= 0.5) return false;
      continue;
    }
    const x = (p[axis] - 0.5 - a[axis]) / delta,
      y = (p[axis] + 0.5 - a[axis]) / delta;
    lo = Math.max(lo, Math.min(x, y));
    hi = Math.min(hi, Math.max(x, y));
    if (lo >= hi) return false;
  }
  return hi > 0 && lo < 1;
}
function firstPixelAtOrAfterX(bin, minX) {
  let lo = 0;
  let hi = bin.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bin[mid].point[0] < minX) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
// Shared snap rounding routes every edge through all intersected hot pixels.
// All crossings are computed before any boundary is bent onto the 0.1 nm grid.
export function nodeMaterialProcessInputs(geometries, { sourceCount = 0, gridScale = 10000 } = {}) {
  if (![10000, 10000000].includes(gridScale))
    throw new RangeError('Unsupported material noding grid.');
  const SCALE = gridScale,
    BIN = gridScale;
  const shapes = geometries.map((g) =>
    g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]))),
  );
  const edges = [],
    rings = [],
    hot = new Map();
  const addHot = (p) => hot.set(`${p[0]}|${p[1]}`, p);
  for (const [group, g] of shapes.entries())
    for (const p of g)
      for (const ring of p) {
        const vertices = same(ring[0], ring.at(-1)) ? ring.slice(0, -1) : ring.slice(),
          indices = [];
        for (let i = 0; i < vertices.length; i++) {
          const a = vertices[i],
            b = vertices[(i + 1) % vertices.length];
          addHot(a);
          if (same(a, b)) continue;
          indices.push(edges.length);
          edges.push({
            a,
            b,
            group,
            nodes: [{ t: 0, p: a }],
            minX: Math.min(a[0], b[0]),
            maxX: Math.max(a[0], b[0]),
            minY: Math.min(a[1], b[1]),
            maxY: Math.max(a[1], b[1]),
          });
        }
        rings.push({ ring, indices });
      }
  if (edges.length > 1500000) throw new RangeError('Material shared-edge budget exceeded.');
  const ordered = edges.map((e, i) => ({ ...e, index: i })).sort((a, b) => a.minX - b.minX),
    activeSource = [],
    activeNew = [];
  let comparisons = 0;
  for (const current of ordered) {
    for (let i = activeNew.length - 1; i >= 0; i--)
      if (activeNew[i].maxX < current.minX) activeNew.splice(i, 1);
    const source = current.group < sourceCount;
    // Validated source/source edges need no crossing calculation. Keep a
    // separate active set, expiring it when a new edge actually queries it.
    // This avoids quadratic scans over tens of thousands of wafer perforations.
    if (!source)
      for (let i = activeSource.length - 1; i >= 0; i--)
        if (activeSource[i].maxX < current.minX) activeSource.splice(i, 1);
    const candidates = source ? activeNew : [...activeSource, ...activeNew];
    for (const previous of candidates) {
      if (previous.maxY < current.minY || current.maxY < previous.minY) continue;
      if (++comparisons > 30000000)
        throw new RangeError('Material shared-edge intersection budget exceeded.');
      const a = current.a,
        b = current.b,
        c = previous.a,
        d = previous.b,
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        ux = d[0] - c[0],
        uy = d[1] - c[1];
      let den = cross(dx, dy, ux, uy),
        t = cross(c[0] - a[0], c[1] - a[1], ux, uy),
        u = cross(c[0] - a[0], c[1] - a[1], dx, dy);
      if (den === 0n) continue;
      if (den < 0n) {
        den = -den;
        t = -t;
        u = -u;
      }
      if (t < 0n || t > den || u < 0n || u > den) continue;
      addHot([
        roundedRatio(BigInt(a[0]) * den + BigInt(dx) * t, den),
        roundedRatio(BigInt(a[1]) * den + BigInt(dy) * t, den),
      ]);
    }
    (source ? activeSource : activeNew).push(current);
  }
  const bins = new Map();
  let ordinal = 0;
  for (const p of hot.values()) {
    const key = `${Math.floor(p[0] / BIN)}|${Math.floor(p[1] / BIN)}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push({ point: p, ordinal: ordinal++ });
  }
  for (const bin of bins.values()) bin.sort((a, b) => a.point[0] - b.point[0]);
  for (const edge of edges) {
    const { a, b } = edge,
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    let x = Math.floor(a[0] / BIN),
      y = Math.floor(a[1] / BIN);
    const endX = Math.floor(b[0] / BIN),
      endY = Math.floor(b[1] / BIN),
      sx = Math.sign(dx),
      sy = Math.sign(dy);
    let tx = dx === 0 ? Infinity : ((sx > 0 ? x + 1 : x) * BIN - a[0]) / dx,
      ty = dy === 0 ? Infinity : ((sy > 0 ? y + 1 : y) * BIN - a[1]) / dy;
    const stepx = dx === 0 ? Infinity : BIN / Math.abs(dx),
      stepy = dy === 0 ? Infinity : BIN / Math.abs(dy),
      visited = new Set(),
      points = new Set();
    for (let n = 0; n < 1000000; n++) {
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const key = `${x + i}|${y + j}`;
          if (visited.has(key)) continue;
          const visitOrder = visited.size;
          visited.add(key);
          const bin = bins.get(key);
          if (!bin) continue;
          // Integer pixel centers outside the edge's bounds cannot meet
          // its open half-pixel neighborhood. Keep the old bin and insertion
          // order for ties in the projected position along the edge.
          for (let k = firstPixelAtOrAfterX(bin, edge.minX); k < bin.length; k++) {
            const { point: p, ordinal } = bin[k];
            if (p[0] > edge.maxX) break;
            if (p[1] < edge.minY || p[1] > edge.maxY) continue;
            if (points.has(p) || same(p, a) || same(p, b) || !crossesPixel(a, b, p)) continue;
            points.add(p);
            const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
            if (t > 0 && t < 1) edge.nodes.push({ t, p, visitOrder, ordinal });
          }
        }
      if (x === endX && y === endY) break;
      if (x === endX) {
        y += sy;
        ty += stepy;
      } else if (y === endY) {
        x += sx;
        tx += stepx;
      } else if (tx < ty) {
        x += sx;
        tx += stepx;
      } else {
        y += sy;
        ty += stepy;
      }
      if (n === 999999) throw Error('Material hot-pixel traversal budget exceeded.');
    }
  }
  for (const { ring, indices } of rings) {
    const next = indices
      .flatMap((i) =>
        edges[i].nodes
          .sort((a, b) => a.t - b.t || a.visitOrder - b.visitOrder || a.ordinal - b.ordinal)
          .map((n) => n.p),
      )
      .filter((p, i, a) => i === 0 || !same(p, a[i - 1]));
    if (next.length) next.push([...next[0]]);
    ring.splice(0, ring.length, ...next);
  }
  return shapes.map((g) => g.map((p) => p.map((r) => r.map(([x, y]) => [x / SCALE, y / SCALE]))));
}

// A crop creates fine-lattice intersection points on both material owners.
// Persist those owners on one shared arrangement, not independent polylines.
export function synchronizeMaterialPartition(regions) {
  const geoms = nodeMaterialProcessInputs(
    regions.map((r) => r.geom),
    { sourceCount: regions.length },
  );
  const hasArea = (ring) => {
    let sum = 0n;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1].map((x) => BigInt(Math.round(x * 10000))),
        b = ring[i].map((x) => BigInt(Math.round(x * 10000)));
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return sum !== 0n;
  };
  return regions
    .map((r, i) => ({
      ...r,
      geom: geoms[i].filter((p) => hasArea(p[0])).map((p) => [p[0], ...p.slice(1).filter(hasArea)]),
    }))
    .filter((r) => r.geom.length);
}
