import { roughProfileOffsetAtPoint } from './surface-rendering.js';

// Presentation-only contour ownership for transparent 3D inspection.
// Never derive contour lines from triangle edges: LOD boundaries are not physical interfaces.
const coord = (value) => Number(value).toPrecision(12);
const pointKey = (point) => point.map(coord).join(',');
const segmentKey = (a, b) => {
  const x = pointKey(a),
    y = pointKey(b);
  return x < y ? x + '|' + y : y + '|' + x;
};
const same = (a, b) => pointKey(a) === pointKey(b);

export function ownedContourSegments(segments = []) {
  const found = new Map();
  for (const segment of segments) {
    const a = segment?.[0],
      b = segment?.[1];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) continue;
    if (![...a, ...b].every(Number.isFinite) || same(a, b)) continue;
    const key = segmentKey(a, b);
    if (!found.has(key)) found.set(key, [a.slice(), b.slice()]);
  }
  return [...found.values()];
}

function capPerimeter(cap) {
  const z = Number(cap?.z);
  if (!Number.isFinite(z)) return [];
  const positions = [];
  const appearance = cap.appearance?.kind === 'rough' ? cap.appearance : null;
  const normal = Number(cap.profileNormal ?? cap.normal) < 0 ? -1 : 1;
  const heightAt = (x, y) =>
    z + (appearance ? normal * roughProfileOffsetAtPoint(x, y, appearance) : 0);
  for (const poly of cap.polys || []) {
    for (const ring of poly || []) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (!a || !b) continue;
        const ax = Number(a[0]),
          ay = Number(a[1]),
          bx = Number(b[0]),
          by = Number(b[1]);
        const length = Math.hypot(bx - ax, by - ay);
        const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1);
        const subdivisions = appearance
          ? Math.min(48, Math.max(1, Math.ceil((length * 3) / feature)))
          : 1;
        let previous = [ax, ay, heightAt(ax, ay)];
        for (let step = 1; step <= subdivisions; step++) {
          const t = step / subdivisions;
          const x = ax + (bx - ax) * t,
            y = ay + (by - ay) * t;
          const next = [x, y, heightAt(x, y)];
          positions.push([previous, next]);
          previous = next;
        }
      }
    }
  }
  return positions;
}

function translate(segment, delta) {
  return segment.map((p) => [p[0] + delta[0], p[1] + delta[1], p[2]]);
}

// Buried caps are owned material interfaces; their perimeters include true
// material edges and clipped inspection edges. Ignore all artificial LOD edges.
export function buriedInterfaceContours(caps = []) {
  const segments = [];
  for (const cap of caps) {
    if (!cap?.buried) continue;
    const boundary = capPerimeter(cap);
    if (cap.instanceTranslations?.length) {
      for (const delta of cap.instanceTranslations) {
        for (const line of boundary) segments.push(translate(line, delta));
      }
    } else {
      segments.push(...boundary);
    }
  }
  return ownedContourSegments(segments);
}

// Only inspection-ROI cuts own these additional material interface contours.
// An ordinary triangulated sidewall may contain many display/LOD seams; none
// of those are appropriate for a structural edge overlay.
function clipBoundaryEdges(clip) {
  const edges = [];
  for (const polygon of clip || []) {
    for (const ring of polygon || []) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      const last = ring.length > 2 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
        ? ring.length - 1
        : ring.length;
      for (let i = 0; i < last; i++) {
        const a = ring[i], b = ring[(i + 1) % last];
        if (Number.isFinite(a?.[0]) && Number.isFinite(a?.[1]) &&
            Number.isFinite(b?.[0]) && Number.isFinite(b?.[1])) edges.push([a, b]);
      }
    }
  }
  return edges;
}

function pointNearSegment(point, a, b, tolerance) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-24) return false;
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
  if (t < -1e-7 || t > 1 + 1e-7) return false;
  const x = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const y = a[1] + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(point[0] - x, point[1] - y) <= tolerance;
}

function displacedCutZ(point, z, surface) {
  const appearance = surface?.appearance;
  const normal = Number(surface?.profileNormal) < 0 ? -1 : 1;
  return z + (appearance?.kind === 'rough' ? normal * roughProfileOffsetAtPoint(
    point[0], point[1], appearance,
  ) : 0);
}

// Outline the *real* material intersections exposed on a section/ROI cut.
// Include both rough interfaces and smooth ones. Sampling follows the same
// deterministic physical profile used by the cut sidewall triangles.
export function sectionCutContours(sidewalls = [], clip = null) {
  const edges = clipBoundaryEdges(clip);
  if (!edges.length) return [];
  const result = [];
  for (const wall of sidewalls || []) {
    const p = wall?.p, q = wall?.q;
    if (!p || !q || !(Number(wall.z1) > Number(wall.z0))) continue;
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const tolerance = Math.max(1e-8, length * 1e-7);
    if (!edges.some(([a, b]) =>
      pointNearSegment(p, a, b, tolerance) && pointNearSegment(q, a, b, tolerance))) continue;
    const featureSizes = [wall.lowerSurface, wall.upperSurface]
      .map((surface) => Number(surface?.appearance?.featureSize))
      .filter((value) => Number.isFinite(value) && value > 0);
    const step = featureSizes.length ? Math.min(...featureSizes) / 3 : length;
    const sections = Math.max(1, Math.min(128, Math.ceil(length / Math.max(step, 1e-9))));
    const sample = (t, z, surface) => {
      const xy = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      return [...xy, displacedCutZ(xy, z, surface)];
    };
    for (let i = 0; i < sections; i++) {
      const t0 = i / sections, t1 = (i + 1) / sections;
      result.push([sample(t0, wall.z0, wall.lowerSurface),
        sample(t1, wall.z0, wall.lowerSurface)]);
      result.push([sample(t0, wall.z1, wall.upperSurface),
        sample(t1, wall.z1, wall.upperSurface)]);
    }
    result.push([sample(0, wall.z0, wall.lowerSurface),
      sample(0, wall.z1, wall.upperSurface)]);
    result.push([sample(1, wall.z0, wall.lowerSurface),
      sample(1, wall.z1, wall.upperSurface)]);
  }
  return ownedContourSegments(result);
}

export function contoursToPositions(lines) {
  return ownedContourSegments(lines).flat(2);
}

// Physical outline spans are also used for the subdued hidden-line reference.
// Includes exposed perimeter/cut edges, but never triangulation or LOD seams.
export function transparentInspectionContours(plan) {
  const exposed = ownedContourSegments(plan?.borderLines || []);
  const buried = buriedInterfaceContours(plan?.caps || []);
  const exposedKeys = new Set(exposed.map(([a, b]) => segmentKey(a, b)));
  return {
    exposed,
    buried: buried.filter(([a, b]) => !exposedKeys.has(segmentKey(a, b))),
  };
}
