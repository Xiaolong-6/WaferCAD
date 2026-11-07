import { canonicalLineInterval, lineIntervalKey } from './line-intervals.js';
import { roughDisplayProfileOffsetAtPoint } from './surface-rendering.js';
import { glbWorldBoundaryPositions, glbWorldAtFloat32Precision } from './glb-export-precision.js';

// These are renderer coordinates, never canonical material geometry. Retain the
// actual Float32 cap endpoints instead of evaluating another morphology curve.
export function boundaryProfileFromPositions(positions = new Float32Array(), origin = null) {
  positions = glbWorldBoundaryPositions(positions, origin);
  const segments = [],
    byLine = new Map();
  for (let index = 0; index + 5 < positions.length; index += 6) {
    const p = Array.from(positions.slice(index, index + 3)),
      q = Array.from(positions.slice(index + 3, index + 6)),
      line = canonicalLineInterval(p, q);
    if (!line) continue;
    const key = lineIntervalKey(line),
      segment = { p, q, line, key };
    segments.push(segment);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(segment);
  }
  return { positions, segments, byLine, origin };
}

function matchingSegments(profile, line) {
  if (!profile || !line) return [];
  const exact = profile.byLine.get(lineIntervalKey(line));
  if (exact) return exact;
  // A slanted canonical edge changes its line coefficients when endpoints enter
  // a Float32 GPU buffer. Match within that representation's rounding bound.
  return profile.segments.filter(({ p, q }) => {
    const tolerance = Math.max(
      1e-10,
      ...[...p.slice(0, 2), ...q.slice(0, 2)].map(
        (value, axis) => Math.abs(value - (profile.origin?.[axis % 2] || 0)) * 2 ** -22,
      ),
    );
    return [p, q].every(
      (point) => Math.abs(line.nx * point[0] + line.ny * point[1] - line.offset) <= tolerance,
    );
  });
}

function profileZ(segments, line, t, fallback, origin = null) {
  const epsilon = Math.max(1e-10, (origin ? Math.abs(line.length) : Math.abs(t)) * 2 ** -22);
  for (const segment of segments) {
    const a = line.ux * segment.p[0] + line.uy * segment.p[1],
      b = line.ux * segment.q[0] + line.uy * segment.q[1];
    if (t < Math.min(a, b) - epsilon || t > Math.max(a, b) + epsilon) continue;
    const fraction = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return segment.p[2] + (segment.q[2] - segment.p[2]) * fraction;
  }
  return fallback();
}

export function sidewallBoundarySamples(
  part,
  { lowerProfile = null, upperProfile = null, fallbackSegments = null, positionOrigin = null } = {},
) {
  const line = part.line || canonicalLineInterval(part.p, part.q);
  if (!line) return [];
  const lower = matchingSegments(lowerProfile, line),
    upper = matchingSegments(upperProfile, line),
    samples = new Map(),
    project = (point) => line.ux * point[0] + line.uy * point[1],
    pT = project(part.p),
    qT = project(part.q),
    epsilon = positionOrigin
      ? Math.max(1e-10, Math.abs(qT - pT) * 2 ** -22)
      : Math.max(1e-10, Math.abs(pT) * 2 ** -22, Math.abs(qT) * 2 ** -22);
  const roundXY = (point) => [
    glbWorldAtFloat32Precision(point[0], 0, positionOrigin),
    glbWorldAtFloat32Precision(point[1], 1, positionOrigin),
  ];
  samples.set(pT, roundXY(part.p));
  samples.set(qT, roundXY(part.q));
  const missing = [
    [lower, part.lowerSurface],
    [upper, part.upperSurface],
  ].filter(([segments, surface]) => !segments.length && surface?.appearance?.kind === 'rough');
  if (missing.length) {
    const feature = Math.min(
        ...missing.map(([, surface]) =>
          Math.max(1e-6, Number(surface.appearance.featureSize) || 1),
        ),
      ),
      count = Math.max(
        1,
        Math.min(128, fallbackSegments ?? Math.ceil((line.length * 4) / feature)),
      );
    for (let index = 1; index < count; index++) {
      const fraction = index / count,
        t = pT + (qT - pT) * fraction;
      samples.set(
        t,
        roundXY([
          part.p[0] + (part.q[0] - part.p[0]) * fraction,
          part.p[1] + (part.q[1] - part.p[1]) * fraction,
        ]),
      );
    }
  }
  for (const segment of [...lower, ...upper]) {
    for (const point of [segment.p, segment.q]) {
      const t = project(point);
      if (t < line.t0 - epsilon || t > line.t1 + epsilon) continue;
      const endpointT = Math.abs(t - pT) <= epsilon ? pT : Math.abs(t - qT) <= epsilon ? qT : t;
      samples.set(endpointT, point.slice(0, 2));
    }
  }
  const displaced = (point, z, surface) =>
    surface?.appearance?.kind === 'rough'
      ? z +
        (Number(surface.profileNormal) || 1) *
          roughDisplayProfileOffsetAtPoint(point[0], point[1], surface.appearance)
      : z;
  const result = [...samples]
    .sort((a, b) => (a[0] - b[0]) * (line.forward ? 1 : -1))
    .map(([t, point]) => ({
      point,
      lowerZ: profileZ(
        lower,
        line,
        t,
        () => displaced(point, part.z0, part.lowerSurface),
        positionOrigin,
      ),
      upperZ: profileZ(
        upper,
        line,
        t,
        () => displaced(point, part.z1, part.upperSurface),
        positionOrigin,
      ),
    }));
  return result;
}

// A display-only annotation can follow a neighboring conformal layer's
// resolved XY mesh boundary while retaining its own physical Z offset.
export function shiftedBoundaryProfile(profile, dz = 0) {
  if (!profile || !Number.isFinite(dz)) return null;
  if (dz === 0) return profile;
  const positions = new Float32Array(profile.positions);
  for (let index = 2; index < positions.length; index += 3) {
    positions[index] = Math.fround(positions[index] + dz);
  }
  return boundaryProfileFromPositions(positions);
}

export function boundaryProfileOverlapsEdge(profile, p, q) {
  const line = canonicalLineInterval(p, q);
  if (!line) return false;
  return matchingSegments(profile, line).some(({ p: a, q: b }) => {
    const ta = line.ux * a[0] + line.uy * a[1];
    const tb = line.ux * b[0] + line.uy * b[1];
    const overlap = Math.min(line.t1, Math.max(ta, tb)) - Math.max(line.t0, Math.min(ta, tb));
    return overlap > 1e-8;
  });
}
