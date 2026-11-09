const TRIANGLE_AREA_EPSILON = 1e-9;

// Exact vertical decomposition of validated multi-ring polygon geometry.
// This display-only fast path returns null on uncertainty so existing Earcut
// and slab fallback retain responsibility for general scientific geometry.
export function scanlineTriangulatePolygon(
  rings,
  { minEdges = 3000, maxTriangles = 1200000 } = {},
) {
  if (!Array.isArray(rings) || !rings.length) return null;
  const edges = [];
  const yCoords = new Set();
  let expectedArea = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const points =
      ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
        ? ring.slice(0, -1)
        : ring;
    if (points.length < 3) return null;
    let twice = 0;
    for (let j = 0; j < points.length; j++) {
      const a = points[j],
        b = points[(j + 1) % points.length];
      if (![a?.[0], a?.[1], b?.[0], b?.[1]].every(Number.isFinite)) return null;
      twice += a[0] * b[1] - b[0] * a[1];
      if (a[1] === b[1]) continue;
      const y0 = Math.min(a[1], b[1]),
        y1 = Math.max(a[1], b[1]);
      edges.push({
        id: edges.length,
        x0: a[0],
        yAtX0: a[1],
        slope: (b[0] - a[0]) / (b[1] - a[1]),
        y0,
        y1,
      });
      yCoords.add(y0);
      yCoords.add(y1);
    }
    expectedArea += (ri ? -1 : 1) * Math.abs(twice / 2);
  }
  if (edges.length < minEdges || !Number.isFinite(expectedArea) || expectedArea <= 0) return null;
  const ys = [...yCoords].sort((a, b) => a - b);
  const started = edges.slice().sort((a, b) => a.y0 - b.y0 || a.id - b.id);
  const ending = edges.slice().sort((a, b) => a.y1 - b.y1 || a.id - b.id);
  const active = new Map();
  let si = 0,
    ei = 0,
    outputArea = 0;
  const triangles = [];
  let previousSpans = new Map();
  const flush = (span) => {
    const { bl, br, tl, tr } = span;
    const twice1 = Math.abs((br[0] - bl[0]) * (tr[1] - bl[1]) - (br[1] - bl[1]) * (tr[0] - bl[0]));
    const twice2 = Math.abs((tr[0] - bl[0]) * (tl[1] - bl[1]) - (tr[1] - bl[1]) * (tl[0] - bl[0]));
    if (twice1 > TRIANGLE_AREA_EPSILON) {
      triangles.push([bl, br, tr]);
      outputArea += twice1 / 2;
    }
    if (twice2 > TRIANGLE_AREA_EPSILON) {
      triangles.push([bl, tr, tl]);
      outputArea += twice2 / 2;
    }
  };
  const xAt = (edge, y) => edge.x0 + (y - edge.yAtX0) * edge.slope;
  for (let yi = 1; yi < ys.length; yi++) {
    const low = ys[yi - 1],
      high = ys[yi],
      mid = low + (high - low) / 2;
    while (ei < ending.length && ending[ei].y1 <= low) active.delete(ending[ei++].id);
    while (si < started.length && started[si].y0 <= low) {
      const edge = started[si++];
      if (edge.y1 > low) active.set(edge.id, edge);
    }
    if (high <= low) continue;
    const sorted = [...active.values()].sort((a, b) => xAt(a, mid) - xAt(b, mid) || a.id - b.id);
    if (sorted.length % 2) return null;
    const nextSpans = new Map();
    for (let j = 0; j < sorted.length; j += 2) {
      const left = sorted[j],
        right = sorted[j + 1];
      const bl = [xAt(left, low), low],
        br = [xAt(right, low), low];
      const tl = [xAt(left, high), high],
        tr = [xAt(right, high), high];
      if (xAt(right, mid) < xAt(left, mid) - 1e-10) return null;
      const key = left.id + ':' + right.id;
      const previous = previousSpans.get(key);
      if (previous && previous.high === low) {
        previous.tl = tl;
        previous.tr = tr;
        previous.high = high;
        nextSpans.set(key, previous);
      } else {
        nextSpans.set(key, { bl, br, tl, tr, high });
      }
    }
    for (const [key, span] of previousSpans) if (!nextSpans.has(key)) flush(span);
    previousSpans = nextSpans;
    if (triangles.length + nextSpans.size * 2 > maxTriangles) return null;
  }
  for (const span of previousSpans.values()) flush(span);
  const tolerance = Math.max(1e-9, Math.abs(expectedArea) * 1e-6);
  if (!triangles.length || Math.abs(outputArea - expectedArea) > tolerance) return null;
  return triangles;
}
