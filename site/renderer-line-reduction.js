// Exact display-only reduction of redundant collinear boundary segments.
// Canonical Process Geometry, Mask and GLB ownership remain unchanged.
const SAME_POINT_TOLERANCE = 1e-10;
const COLLINEAR_TOLERANCE = 1e-12;

function samePoint(a, b) {
  return Boolean(
    a && b &&
    Math.abs(Number(a[0]) - Number(b[0])) <= SAME_POINT_TOLERANCE &&
    Math.abs(Number(a[1]) - Number(b[1])) <= SAME_POINT_TOLERANCE,
  );
}

function straightThrough(a, b, c) {
  if (!a || !b || !c) return false;
  const ax = b[0] - a[0], ay = b[1] - a[1],
    bx = c[0] - b[0], by = c[1] - b[1],
    firstLength = Math.hypot(ax, ay),
    secondLength = Math.hypot(bx, by);
  if (firstLength <= SAME_POINT_TOLERANCE || secondLength <= SAME_POINT_TOLERANCE) return false;
  const cross = Math.abs(ax * by - ay * bx),
    dot = ax * bx + ay * by;
  return dot > 0 && cross <= COLLINEAR_TOLERANCE * firstLength * secondLength;
}

export function reduceCollinearClosedRing(ring) {
  if (!Array.isArray(ring) || ring.length < 5) return ring;
  const closed = samePoint(ring[0], ring.at(-1)),
    points = (closed ? ring.slice(0, -1) : ring).slice();
  if (points.length <= 3) return ring;
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let index = points.length - 1; index >= 0 && points.length > 3; index--) {
      const prev = points[(index - 1 + points.length) % points.length],
        current = points[index],
        next = points[(index + 1) % points.length];
      if (!straightThrough(prev, current, next)) continue;
      points.splice(index, 1);
      changed = true;
    }
  }
  return closed ? [...points, points[0]] : points;
}

export function mergeCollinearSidewallParts(parts) {
  if (!Array.isArray(parts) || parts.length < 2) return parts || [];
  const out = [];
  for (const part of parts) {
    const previous = out.at(-1);
    const compatible =
      previous &&
      !previous.lowerSurface?.appearance &&
      !previous.upperSurface?.appearance &&
      !part.lowerSurface?.appearance &&
      !part.upperSurface?.appearance &&
      previous.z0 === part.z0 &&
      previous.z1 === part.z1 &&
      previous.lowerDepth === part.lowerDepth &&
      previous.upperDepth === part.upperDepth &&
      previous.lowerSurface === part.lowerSurface &&
      previous.upperSurface === part.upperSurface &&
      samePoint(previous.q, part.p) &&
      straightThrough(previous.p, previous.q, part.q);
    if (compatible) {
      out[out.length - 1] = { ...previous, q: part.q };
    } else {
      out.push(part);
    }
  }
  return out;
}

function distanceFromSegmentSquared(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1],
    lengthSquared = dx * dx + dy * dy,
    t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared))
      : 0,
    x = a[0] + t * dx, y = a[1] + t * dy;
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}

export function simplifyDisplayPolyline(points, tolerance) {
  if (!Array.isArray(points) || points.length < 3 || !(Number(tolerance) > 0)) return points;
  const keep = new Uint8Array(points.length),
    stack = [[0, points.length - 1]],
    toleranceSquared = tolerance * tolerance;
  keep[0] = 1;
  keep[points.length - 1] = 1;
  while (stack.length) {
    const [start, end] = stack.pop();
    let bestIndex = -1, bestDistance = toleranceSquared;
    for (let index = start + 1; index < end; index++) {
      const squared = distanceFromSegmentSquared(points[index], points[start], points[end]);
      if (squared > bestDistance) {
        bestDistance = squared;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) {
      keep[bestIndex] = 1;
      stack.push([start, bestIndex], [bestIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function signedArea(points) {
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const p = points[index], q = points[(index + 1) % points.length];
    twice += p[0] * q[1] - p[1] * q[0];
  }
  return twice / 2;
}

function segmentsIntersectStrict(a, b, c, d) {
  const cross = (p, q, r) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const x1 = cross(a, b, c), x2 = cross(a, b, d),
    y1 = cross(c, d, a), y2 = cross(c, d, b);
  return x1 * x2 < 0 && y1 * y2 < 0;
}

function selfIntersects(points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersectStrict(
        points[i], points[(i + 1) % points.length],
        points[j], points[(j + 1) % points.length],
      )) return true;
    }
  }
  return false;
}

// Conservative screen-space display LOD: preserve winding, holes, broad area,
// and forbid self-intersections. Original canonical rings are never mutated.
export function simplifyDisplayRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length < 6 || !(Number(tolerance) > 0)) return ring;
  if (!samePoint(ring[0], ring.at(-1))) return ring;
  const source = ring.slice(0, -1);
  let anchor = 1, farthest = 0;
  for (let index = 1; index < source.length; index++) {
    const distance = (source[index][0] - source[0][0]) ** 2 +
      (source[index][1] - source[0][1]) ** 2;
    if (distance > farthest) { farthest = distance; anchor = index; }
  }
  if (!(farthest > 0)) return ring;
  const first = simplifyDisplayPolyline(source.slice(0, anchor + 1), tolerance),
    second = simplifyDisplayPolyline([...source.slice(anchor), source[0]], tolerance),
    reduced = [...first.slice(0, -1), ...second.slice(0, -1)];
  if (reduced.length < 3 || reduced.length >= source.length) return ring;
  const beforeArea = signedArea(source), afterArea = signedArea(reduced);
  if (
    !Number.isFinite(beforeArea) || Math.abs(beforeArea) < 1e-12 ||
    beforeArea * afterArea <= 0 ||
    Math.abs(afterArea - beforeArea) > 0.05 * Math.abs(beforeArea) ||
    selfIntersects(reduced)
  ) return ring;
  return [...reduced, reduced[0]];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i], q = ring[j],
      crosses = (p[1] > point[1]) !== (q[1] > point[1]);
    if (crosses && point[0] < ((q[0] - p[0]) * (point[1] - p[1])) / (q[1] - p[1]) + p[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function simplifyDisplayPolygons(polys, tolerance) {
  if (!Array.isArray(polys) || !(Number(tolerance) > 0)) return polys;
  return polys.map((poly) => {
    if (!Array.isArray(poly) || !poly.length) return poly;
    const exterior = simplifyDisplayRing(poly[0], tolerance);
    if (exterior === poly[0]) return poly;
    // Keep holes exact and reject any exterior simplification that could cut
    // across a hole. Even distant LOD must not fill a physical void.
    for (const hole of poly.slice(1)) {
      if (!hole.every((point) => pointInRing(point, exterior))) return poly;
    }
    return [exterior, ...poly.slice(1)];
  });
}

function compatibleWall(a, b) {
  return (
    a && b &&
    !a.lowerSurface?.appearance && !a.upperSurface?.appearance &&
    !b.lowerSurface?.appearance && !b.upperSurface?.appearance &&
    a.z0 === b.z0 && a.z1 === b.z1 &&
    a.lowerDepth === b.lowerDepth && a.upperDepth === b.upperDepth &&
    a.lowerSurface === b.lowerSurface && a.upperSurface === b.upperSurface &&
    samePoint(a.q, b.p)
  );
}

export function simplifyDisplaySidewallParts(parts, tolerance) {
  if (!(Number(tolerance) > 0)) return mergeCollinearSidewallParts(parts);
  const exact = mergeCollinearSidewallParts(parts);
  const result = [];
  for (let start = 0; start < exact.length;) {
    let end = start + 1;
    while (end < exact.length && compatibleWall(exact[end - 1], exact[end])) end++;
    if (end - start < 2) {
      result.push(exact[start]);
      start = end;
      continue;
    }
    const points = [exact[start].p, ...exact.slice(start, end).map((part) => part.q)],
      closed = samePoint(points[0], points.at(-1)),
      simplified = closed
        ? simplifyDisplayRing(points, tolerance)
        : simplifyDisplayPolyline(points, tolerance);
    if (simplified.length >= 2 && simplified.length < points.length) {
      for (let index = 1; index < simplified.length; index++) {
        result.push({ ...exact[start], p: simplified[index - 1], q: simplified[index] });
      }
    } else {
      result.push(...exact.slice(start, end));
    }
    start = end;
  }
  return result;
}
