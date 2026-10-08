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
