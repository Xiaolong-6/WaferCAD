// Restricted 2D, axis-aligned section of a true 3D physical Si facet.
// A curved convex ridge and a mitered concave valley MUST NOT be replaced
// by a vertical displacement or by joining independently extruded patches.
// This is a scientific Section oracle, not a 3D coating owner or Process.
import { squarePyramidSample } from './physical-facet-math.js';
import { restorePhysicalPyramidOwner } from './physical-facet-owner.js';
import { physicalPyramidSection } from './physical-facet-surface.js';

export const PHYSICAL_FACET_OFFSET_SECTION_KIND = 'wafercad-axial-facet-offset-section-v1';

const EPS = 1e-10;

function normal(slope, faceSign) {
  const length = Math.hypot(slope, 1);
  return [(-faceSign * slope) / length, faceSign / length];
}

function plus(point, vector, amount) {
  return [point[0] + amount * vector[0], point[1] + amount * vector[1]];
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const d2 = dx * dx + dz * dz;
  if (d2 <= EPS * EPS) throw new RangeError('Collapsed facet segment');
  const s = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / d2));
  return Math.hypot(p[0] - a[0] - s * dx, p[1] - a[1] - s * dz);
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

function simplify(points) {
  const result = [];
  for (const point of points) {
    result.push(point);
    while (result.length >= 3) {
      const n = result.length;
      const a = result[n - 3];
      const b = result[n - 2];
      const c = result[n - 1];
      const ab = (b[1] - a[1]) / (b[0] - a[0]);
      const bc = (c[1] - b[1]) / (c[0] - b[0]);
      if (Math.abs(ab - bc) > EPS) break;
      result.splice(n - 2, 1);
    }
  }
  return result;
}

// A/B must be increasing X, at a *pyramid centerline* Y, so the true
// 3D facet normal lies exactly in the axial XZ section. A diagonal
// Section has a different normal projection and explicitly fails closed.
export function physicalAxialFacetCoatingSection(
  owner,
  a,
  b,
  { face = 'front', layerId, thicknessUm, maxArcStepRadians = Math.PI / 36 } = {},
) {
  const valid = restorePhysicalPyramidOwner(owner);
  if (face !== 'front' && face !== 'back') throw new RangeError('Unknown coating face');
  if (typeof layerId !== 'string' || !layerId.trim() || layerId === valid.layerId) {
    throw new RangeError('A distinct coating layerId is required');
  }
  if (!Number.isFinite(thicknessUm) || thicknessUm <= 0) {
    throw new RangeError('Normal coating thickness must be finite and positive');
  }
  // A cropped axial Section cannot certify contact with adjacent 3D
  // cells once the film reaches half a lateral pitch. Fail closed
  // rather than extrapolating a valid single-apex arc to a full wafer.
  if (thicknessUm >= valid.pitch / 2) {
    throw new RangeError('Physical facet coating exceeds the axial half-pitch applicability');
  }
  if (
    !Number.isFinite(maxArcStepRadians) ||
    maxArcStepRadians <= 0 ||
    maxArcStepRadians > Math.PI / 6
  ) {
    throw new RangeError('Invalid angular sampling step');
  }
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== 2 ||
    b.length !== 2 ||
    !a.every(Number.isFinite) ||
    !b.every(Number.isFinite) ||
    a[1] !== b[1] ||
    !(b[0] > a[0])
  ) {
    throw new RangeError('Axial coating requires a left-to-right X Section');
  }
  const row = (a[1] - valid.originY) / valid.pitch;
  if (Math.abs(row - Math.round(row)) > EPS) {
    throw new RangeError('Section must follow a physical pyramid Y centerline');
  }
  const raw = physicalPyramidSection(valid, a, b);
  const source = simplify(raw.points.map((p) => [p.x, face === 'front' ? p.z1 : p.z0]));
  if (source.length < 2) throw new RangeError('Insufficient physical facet Section');
  const faceSign = face === 'front' ? 1 : -1;
  const edges = [];
  for (let i = 0; i < source.length - 1; i++) {
    const start = source[i];
    const end = source[i + 1];
    const slope = (end[1] - start[1]) / (end[0] - start[0]);
    if (!Number.isFinite(slope)) throw new RangeError('Invalid physical facet slope');
    const x = (start[0] + end[0]) / 2;
    const s = squarePyramidSample(x, a[1], {
      pitch: valid.pitch,
      height: valid.height,
      originX: valid.originX,
      originY: valid.originY,
      planeZ: face === 'front' ? valid.topPlaneZ : valid.bottomPlaneZ,
      face,
    });
    if (
      !s.normal ||
      !s.gradient ||
      Math.abs(s.gradient[0] - slope) > EPS ||
      Math.abs(s.gradient[1]) > EPS
    ) {
      throw new RangeError('Section does not follow one true axial facet normal');
    }
    edges.push({ start, end, slope, normal: normal(slope, faceSign) });
  }

  const offset = [plus(source[0], edges[0].normal, thicknessUm)];
  const joins = [];
  const curvedEdgeIndices = new Set();
  let circularCorrection = 0;
  for (let i = 1; i < source.length - 1; i++) {
    const before = edges[i - 1];
    const after = edges[i];
    const pivot = source[i];
    const theta = Math.atan2(
      before.normal[0] * after.normal[1] - before.normal[1] * after.normal[0],
      before.normal[0] * after.normal[0] + before.normal[1] * after.normal[1],
    );
    if (Math.abs(theta) < EPS) {
      offset.push(plus(pivot, before.normal, thicknessUm));
      continue;
    }
    const convex = faceSign * (before.slope - after.slope) > 0;
    if (convex) {
      const start = plus(pivot, before.normal, thicknessUm);
      const end = plus(pivot, after.normal, thicknessUm);
      offset.push(start);
      const firstCurvedVertex = offset.length - 1;
      const steps = Math.ceil(Math.abs(theta) / maxArcStepRadians);
      const startAngle = Math.atan2(before.normal[1], before.normal[0]);
      for (let j = 1; j < steps; j++) {
        const angle = startAngle + (theta * j) / steps;
        offset.push([
          pivot[0] + thicknessUm * Math.cos(angle),
          pivot[1] + thicknessUm * Math.sin(angle),
        ]);
      }
      offset.push(end);
      for (let j = firstCurvedVertex; j < offset.length - 1; j++) {
        curvedEdgeIndices.add(j);
      }
      circularCorrection +=
        (thicknessUm *
          thicknessUm *
          (Math.abs(theta) - steps * Math.sin(Math.abs(theta) / steps))) /
        2;
      joins.push({
        type: 'convex-round',
        source: [...pivot],
        angleRadians: Math.abs(theta),
        samples: steps + 1,
      });
    } else {
      // Intersection of the two offset planes. For an X-monotone curve
      // the X position follows from matching their linear Z equations.
      const n0 = before.normal;
      const n1 = after.normal;
      const z0 = pivot[1] + thicknessUm * n0[1];
      const z1 = pivot[1] + thicknessUm * n1[1];
      const x0 = pivot[0] + thicknessUm * n0[0];
      const x1 = pivot[0] + thicknessUm * n1[0];
      const x = (z1 - z0 + before.slope * x0 - after.slope * x1) / (before.slope - after.slope);
      const point = [x, z0 + before.slope * (x - x0)];
      // The nearest point to each original facet must be within that
      // original facet segment. Otherwise a true offset would switch
      // ownership at another vertex and the miter is physically invalid.
      for (const edge of [before, after]) {
        const n = edge.normal;
        const contact = plus(point, n, -thicknessUm);
        const along = (contact[0] - edge.start[0]) / (edge.end[0] - edge.start[0]);
        if (along < -EPS || along > 1 + EPS) {
          throw new RangeError('Concave coating miter exceeds physical facet segment');
        }
      }
      offset.push(point);
      joins.push({ type: 'concave-miter', source: [...pivot], intersection: [...point] });
    }
  }
  offset.push(plus(source.at(-1), edges.at(-1).normal, thicknessUm));

  // Check the entire boundary against *every* Si segment; a neighboring
  // material facet may be nearer than the facet that generated the point.
  // This rejects excessive coating thickness and hidden intersections.
  const samples = [...offset];
  for (let i = 0; i < offset.length - 1; i++) {
    // Arc chords intentionally lie inside the exact circle. Only the
    // curved vertices carry a true distance=t guarantee.
    if (curvedEdgeIndices.has(i)) continue;
    samples.push([(offset[i][0] + offset[i + 1][0]) / 2, (offset[i][1] + offset[i + 1][1]) / 2]);
  }
  const allowed = Math.max(EPS, thicknessUm * 1e-9);
  for (const point of samples) {
    const actual = Math.min(...edges.map((edge) => distanceToSegment(point, edge.start, edge.end)));
    if (actual < thicknessUm - allowed) {
      throw new RangeError('Offset coating intersects a neighboring silicon facet');
    }
  }
  const ring = [...source, ...offset.toReversed()];
  return {
    kind: PHYSICAL_FACET_OFFSET_SECTION_KIND,
    layerId,
    substrateLayerId: valid.layerId,
    face,
    thicknessUm,
    source,
    offset,
    joins,
    closedSectionRing: ring,
    areaUm2: polygonArea(ring) + circularCorrection,
    // Exact in this axial 2D plane, NOT a complete 3D conformal
    // layer around all pyramid edges, corners or mask boundaries.
    complete3DCoating: false,
  };
}
