import { roughProfileOffsetAtPoint } from './surface-rendering.js';
import { sidewallBoundarySamples } from './rough-boundary-profile.js';

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
export function buriedInterfaceContours(caps = [], { boundaryProfiles = null } = {}) {
  const segments = [];
  for (const [capIndex, cap] of caps.entries()) {
    if (!cap?.buried) continue;
    const profile = boundaryProfiles?.get(capIndex),
      boundary = profile?.positions
        ? Array.from({ length: Math.floor(profile.positions.length / 6) }, (_, index) => [
            Array.from(profile.positions.slice(index * 6, index * 6 + 3)),
            Array.from(profile.positions.slice(index * 6 + 3, index * 6 + 6)),
          ])
        : capPerimeter(cap);
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
      const last =
        ring.length > 2 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
          ? ring.length - 1
          : ring.length;
      for (let i = 0; i < last; i++) {
        const a = ring[i],
          b = ring[(i + 1) % last];
        if (
          Number.isFinite(a?.[0]) &&
          Number.isFinite(a?.[1]) &&
          Number.isFinite(b?.[0]) &&
          Number.isFinite(b?.[1])
        )
          edges.push([a, b]);
      }
    }
  }
  return edges;
}

function cutBoundarySpans(p, q, edges, tolerance) {
  const dx = q[0] - p[0],
    dy = q[1] - p[1],
    length = Math.hypot(dx, dy);
  if (length <= tolerance) return [];
  const spans = [];
  for (const [a, b] of edges) {
    // Match the union of collinear ROI intervals. A polygon kernel may split
    // an ROI edge without splitting the corresponding owned material wall.
    if (
      Math.abs((a[0] - p[0]) * dy - (a[1] - p[1]) * dx) / length > tolerance ||
      Math.abs((b[0] - p[0]) * dy - (b[1] - p[1]) * dx) / length > tolerance
    )
      continue;
    const ta = ((a[0] - p[0]) * dx + (a[1] - p[1]) * dy) / (dx * dx + dy * dy),
      tb = ((b[0] - p[0]) * dx + (b[1] - p[1]) * dy) / (dx * dx + dy * dy),
      start = Math.max(0, Math.min(ta, tb)),
      end = Math.min(1, Math.max(ta, tb));
    if ((end - start) * length > tolerance) spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && (span[0] - previous[1]) * length <= tolerance) {
      previous[1] = Math.max(previous[1], span[1]);
    } else merged.push(span.slice());
  }
  return merged;
}

// Outline the *real* material intersections exposed on a section/ROI cut.
// Include both rough interfaces and smooth ones. Sampling follows the same
// deterministic physical profile used by the cut sidewall triangles.
export function sectionCutContours(sidewalls = [], clip = null, { boundaryProfiles = null } = {}) {
  const edges = clipBoundaryEdges(clip);
  if (!edges.length) return [];
  const result = [],
    verticals = new Map();
  for (const wall of sidewalls || []) {
    const p = wall?.p,
      q = wall?.q;
    if (
      !p ||
      !q ||
      ![...p, ...q, wall.z0, wall.z1].every(Number.isFinite) ||
      !(Number(wall.z1) > Number(wall.z0))
    )
      continue;
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const tolerance = Math.max(1e-8, length * 1e-10);
    const spans = cutBoundarySpans(p, q, edges, tolerance);
    if (!spans.length) continue;
    const xyAt = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (const [start, end] of spans) {
      const samples = sidewallBoundarySamples(
        { ...wall, line: null, p: xyAt(start), q: xyAt(end) },
        {
          lowerProfile: boundaryProfiles?.get(wall.lowerSurface?.capIndex),
          upperProfile: boundaryProfiles?.get(wall.upperSurface?.capIndex),
        },
      );
      const at = (sample, face) => [...sample.point, sample[face]];
      for (let i = 0; i + 1 < samples.length; i++) {
        result.push([at(samples[i], 'lowerZ'), at(samples[i + 1], 'lowerZ')]);
        result.push([at(samples[i], 'upperZ'), at(samples[i + 1], 'upperZ')]);
      }
      for (const [sample, direction] of [
        [samples[0], 1],
        [samples.at(-1), -1],
      ]) {
        if (!sample) continue;
        const line = [at(sample, 'lowerZ'), at(sample, 'upperZ')],
          key = `${wall.layerId ?? ''}|${segmentKey(...line)}`;
        if (!verticals.has(key)) verticals.set(key, []);
        verticals.get(key).push({
          line,
          tangent: [(direction * (q[0] - p[0])) / length, (direction * (q[1] - p[1])) / length],
        });
      }
    }
  }
  for (const candidates of verticals.values()) {
    // Equal material spans meeting on one straight cut are artificial wall
    // partitions. Keep genuine ROI corners and changes in material ownership.
    const continuation = candidates.some((a, i) =>
      candidates.some(
        (b, j) => i !== j && a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1] < -1 + 1e-7,
      ),
    );
    if (!continuation) result.push(candidates[0].line);
  }
  return ownedContourSegments(result);
}

export function contoursToPositions(lines) {
  return ownedContourSegments(lines).flat(2);
}

// Physical outline spans are also used for the subdued hidden-line reference.
// Includes exposed perimeter/cut edges, but never triangulation or LOD seams.
export function transparentInspectionContours(plan, options = {}) {
  const exposed = ownedContourSegments(plan?.borderLines || []);
  const buried = buriedInterfaceContours(plan?.caps || [], options);
  const exposedKeys = new Set(exposed.map(([a, b]) => segmentKey(a, b)));
  return {
    exposed,
    buried: buried.filter(([a, b]) => !exposedKeys.has(segmentKey(a, b))),
  };
}
