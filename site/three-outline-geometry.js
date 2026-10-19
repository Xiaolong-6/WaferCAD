import { roughProfileOffsetAtPoint } from './surface-rendering.js';
import { sidewallBoundarySamples } from './rough-boundary-profile.js';
import { canonicalLineInterval, lineIntervalKey } from './line-intervals.js';

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
export function buriedInterfaceContours(
  caps = [],
  { boundaryProfiles = null, includeCap = null } = {},
) {
  const segments = [];
  for (const [capIndex, cap] of caps.entries()) {
    if (!cap?.buried || (includeCap && !includeCap(cap))) continue;
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

// Internal, physically owned vertical junctions. A wall partition is not by
// itself an edge: only vertices where two non-collinear buried wall spans meet
// (or where their Z coverage changes) form a structural contour.
export function buriedSidewallContours(sidewalls = [], exposed = []) {
  const corners = new Map(),
    spans = new Map();
  for (const wall of sidewalls) {
    for (const part of wall.parts || [wall]) {
      if (!part?.buried || !(part.z1 > part.z0)) continue;
      const offsets = wall.instanceTranslations?.length ? wall.instanceTranslations : [[0, 0]];
      for (const [dx, dy] of offsets) {
        const p = [part.p[0] + dx, part.p[1] + dy];
        const q = [part.q[0] + dx, part.q[1] + dy];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (length <= 1e-12) continue;
        const ux = (q[0] - p[0]) / length;
        const uy = (q[1] - p[1]) / length;
        for (const point of [p, q]) {
          const key = `${pointKey(point)}|${part.layerId}`;
          if (!corners.has(key)) corners.set(key, []);
          corners.get(key).push({ point, z0: part.z0, z1: part.z1, ux, uy });
        }
        const pKey = pointKey(p),
          qKey = pointKey(q);
        const edgeKey = `${part.layerId}|${pKey < qKey ? `${pKey}|${qKey}` : `${qKey}|${pKey}`}`;
        if (!spans.has(edgeKey)) spans.set(edgeKey, { p, q, intervals: [] });
        spans.get(edgeKey).intervals.push([part.z0, part.z1]);
      }
    }
  }
  const lines = [];
  for (const entries of corners.values()) {
    const levels = [...new Set(entries.flatMap(({ z0, z1 }) => [z0, z1]))].sort((a, b) => a - b);
    for (let i = 1; i < levels.length; i++) {
      const z0 = levels[i - 1],
        z1 = levels[i];
      if (z1 - z0 <= 1e-9) continue;
      const active = entries.filter((w) => w.z0 <= z0 + 1e-9 && w.z1 >= z1 - 1e-9);
      if (!active.length) continue;
      // Straight collinear partitions are computational seams; a wall's real
      // endpoint or non-collinear junction is a physical structural corner.
      const corner =
        active.length === 1 ||
        active.some((w, j) =>
          active.slice(j + 1).some((other) => Math.abs(w.ux * other.uy - w.uy * other.ux) > 1e-8),
        );
      if (corner)
        lines.push([
          [...active[0].point, z0],
          [...active[0].point, z1],
        ]);
    }
  }
  for (const { p, q, intervals } of spans.values()) {
    // Coalesce adjacent same-material spans so a split slab does not acquire
    // an artificial horizontal seam through the middle of a buried wall.
    intervals.sort((a, b) => a[0] - b[0]);
    let [lower, upper] = intervals[0];
    const appendEnds = () => {
      lines.push(
        [
          [...p, lower],
          [...q, lower],
        ],
        [
          [...p, upper],
          [...q, upper],
        ],
      );
    };
    for (const [z0, z1] of intervals.slice(1)) {
      if (z0 <= upper + 1e-9) upper = Math.max(upper, z1);
      else {
        appendEnds();
        lower = z0;
        upper = z1;
      }
    }
    appendEnds();
  }
  return unownedContourSegments(lines, exposed);
}

// Physical classes are independent of line style and transparent scene depth.
// Exterior strong borders remain owned by Process topology; the buried groups
// intentionally retain actual internal material interfaces for inspection.
export function borderInspectorContours(plan, options = {}) {
  const exterior = ownedContourSegments(plan?.borderLines || []);
  const caps = plan?.caps || [];
  // Preserve canonical indices: boundaryProfiles is keyed by the complete
  // surface plan, not by an independently filtered presentation category.
  const interfaces = unownedContourSegments(
    buriedInterfaceContours(caps, {
      ...options,
      includeCap: (cap) => Boolean(cap.interfaceLayerId),
    }),
    exterior,
  );
  const embeddedCaps = buriedInterfaceContours(caps, {
    ...options,
    includeCap: (cap) => !cap.interfaceLayerId,
  });
  const embeddedWalls = buriedSidewallContours(plan?.sidewalls || [], [...exterior, ...interfaces]);
  const buried = unownedContourSegments(
    [...embeddedCaps, ...embeddedWalls],
    [...exterior, ...interfaces],
  );
  return { exterior, interface: interfaces, buried };
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
export function sectionCutContours(
  sidewalls = [],
  clip = null,
  { boundaryProfiles = null, ownedCapBorderIndices = null } = {},
) {
  const edges = clipBoundaryEdges(clip);
  if (!edges.length) return [];
  const result = [],
    horizontal = [],
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
      // Use the actual rough mesh border as the sole outline owner. A
      // second cut-profile line can diverge by a pixel at close zoom.
      const lowerOwned = ownedCapBorderIndices?.has(wall.lowerSurface?.capIndex) ?? false;
      const upperOwned = ownedCapBorderIndices?.has(wall.upperSurface?.capIndex) ?? false;
      for (let i = 0; i + 1 < samples.length; i++) {
        if (!lowerOwned) {
          horizontal.push({
            line: [at(samples[i], 'lowerZ'), at(samples[i + 1], 'lowerZ')],
            layerId: wall.layerId,
            face: 'lower',
          });
        }
        if (!upperOwned) {
          horizontal.push({
            line: [at(samples[i], 'upperZ'), at(samples[i + 1], 'upperZ')],
            layerId: wall.layerId,
            face: 'upper',
          });
        }
      }
      for (const [sample, direction] of [
        [samples[0], 1],
        [samples.at(-1), -1],
      ]) {
        if (!sample) continue;
        const line = [at(sample, 'lowerZ'), at(sample, 'upperZ')];
        // Group by the physical cut point and material, not the complete
        // vertical Z span. Adjacent segments can have slightly different
        // rough LOD heights or a genuine shallow top step while sharing
        // the same buried material wall.
        const key = `${wall.layerId ?? ''}|${pointKey(sample.point)}`;
        if (!verticals.has(key)) verticals.set(key, []);
        verticals.get(key).push({
          line,
          tangent: [(direction * (q[0] - p[0])) / length, (direction * (q[1] - p[1])) / length],
        });
      }
    }
  }
  // The same physical material can be partitioned into adjacent Z slabs by
  // a neighboring etch. Their matching upper/lower contour is an internal
  // computational seam, not an exposed interface on the ROI cut.
  const adjacentFaces = new Map();
  for (const { line, layerId, face } of horizontal) {
    if (layerId == null) continue;
    const key = `${layerId}|${segmentKey(...line)}`;
    if (!adjacentFaces.has(key)) adjacentFaces.set(key, new Set());
    adjacentFaces.get(key).add(face);
  }
  // Different Z slabs can have different XY subdivisions. Remove only the
  // *overlapping* section-line span when both sides belong to the same layer.
  // A real exposed step stays outlined on its uncovered remainder.
  const planarSupport = ({ line, layerId }) => {
    if (layerId == null || Math.abs(line[0][2] - line[1][2]) > 1e-9) return null;
    const axis = canonicalLineInterval(...line);
    if (!axis) return null;
    return {
      axis,
      key: `${layerId}|${Number(line[0][2]).toPrecision(10)}|${lineIntervalKey(axis, 10)}`,
    };
  };
  const planar = horizontal.map((item) => ({ ...item, support: planarSupport(item) }));
  const bySupport = new Map();
  for (const item of planar) {
    if (!item.support) continue;
    if (!bySupport.has(item.support.key)) bySupport.set(item.support.key, []);
    bySupport.get(item.support.key).push(item);
  }
  for (const { line, layerId, face, support } of planar) {
    const key = layerId == null ? null : `${layerId}|${segmentKey(...line)}`;
    if (key && adjacentFaces.get(key)?.size === 2) continue;
    if (!support) {
      result.push(line);
      continue;
    }
    const axis = support.axis;
    let remaining = [[axis.t0, axis.t1]];
    for (const other of bySupport.get(support.key) || []) {
      if (other.face === face) continue;
      const from = other.support.axis.t0;
      const to = other.support.axis.t1;
      remaining = remaining.flatMap(([start, end]) => {
        if (to <= start + 1e-8 || from >= end - 1e-8) return [[start, end]];
        const pieces = [];
        if (from > start + 1e-8) pieces.push([start, Math.min(end, from)]);
        if (to < end - 1e-8) pieces.push([Math.max(start, to), end]);
        return pieces;
      });
      if (!remaining.length) break;
    }
    // Keep existing Float32 endpoints and line orientation bit-identical
    // whenever subtraction leaves the full original segment unchanged.
    if (
      remaining.length === 1 &&
      Math.abs(remaining[0][0] - axis.t0) <= 1e-8 &&
      Math.abs(remaining[0][1] - axis.t1) <= 1e-8
    ) {
      result.push(line);
      continue;
    }
    const aT = axis.ux * line[0][0] + axis.uy * line[0][1];
    const bT = axis.ux * line[1][0] + axis.uy * line[1][1];
    const pointAt = (t) => {
      if (Math.abs(t - aT) <= 1e-8) return line[0].slice();
      if (Math.abs(t - bT) <= 1e-8) return line[1].slice();
      const fraction = (t - aT) / (bT - aT);
      return line[0].map((value, i) => value + (line[1][i] - value) * fraction);
    };
    for (const [start, end] of remaining) {
      if (end - start > 1e-8) result.push([pointAt(start), pointAt(end)]);
    }
  }
  for (const candidates of verticals.values()) {
    // Cancel only the *overlap* of co-linear, opposing walls of the same
    // material. A contact/rough-cap subdivision can perturb the upper
    // sampled Z, but must not draw a full-height line through the Si body.
    // Keep any real uncovered height step, ROI corner and material junction.
    for (const [index, candidate] of candidates.entries()) {
      const z0 = Math.min(candidate.line[0][2], candidate.line[1][2]),
        z1 = Math.max(candidate.line[0][2], candidate.line[1][2]);
      let remaining = [[z0, z1]];
      for (const [otherIndex, other] of candidates.entries()) {
        const dot =
          candidate.tangent[0] * other.tangent[0] + candidate.tangent[1] * other.tangent[1];
        if (otherIndex === index || dot >= -1 + 1e-7) continue;
        const otherLow = Math.min(other.line[0][2], other.line[1][2]),
          otherHigh = Math.max(other.line[0][2], other.line[1][2]);
        remaining = remaining.flatMap(([start, end]) => {
          if (otherHigh <= start + 1e-9 || otherLow >= end - 1e-9) return [[start, end]];
          const parts = [];
          if (otherLow > start + 1e-9) parts.push([start, Math.min(end, otherLow)]);
          if (otherHigh < end - 1e-9) parts.push([Math.max(start, otherHigh), end]);
          return parts;
        });
        if (!remaining.length) break;
      }
      for (const [start, end] of remaining) {
        if (end - start <= 1e-9) continue;
        const p = candidate.line[0];
        result.push([
          [p[0], p[1], start],
          [p[0], p[1], end],
        ]);
      }
    }
  }
  return ownedContourSegments(result);
}

// An owned material/cap border must not be drawn a second time by the
// inspection-cut pass. Keep true cut-only edges (including material junctions).
export function unownedContourSegments(segments = [], alreadyOutlined = []) {
  const owned = new Set(ownedContourSegments(alreadyOutlined).map(([a, b]) => segmentKey(a, b)));
  return ownedContourSegments(segments).filter(([a, b]) => !owned.has(segmentKey(a, b)));
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
