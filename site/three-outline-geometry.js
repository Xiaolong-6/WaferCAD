import { roughProfileOffsetAtPoint } from './surface-rendering.js';

// Presentation-only contour ownership for transparent 3D inspection.
// Never derive contour lines from triangle edges: LOD boundaries are not physical interfaces.
const coord = (value) => Number(value).toPrecision(12);
const pointKey = (point) => point.map(coord).join(',');
const segmentKey = (a, b) => {
  const x = pointKey(a), y = pointKey(b);
  return x < y ? x + '|' + y : y + '|' + x;
};
const same = (a, b) => pointKey(a) === pointKey(b);

export function ownedContourSegments(segments = []) {
  const found = new Map();
  for (const segment of segments) {
    const a = segment?.[0], b = segment?.[1];
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
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (!a || !b) continue;
        const ax = Number(a[0]), ay = Number(a[1]);
        const bx = Number(b[0]), by = Number(b[1]);
        const length = Math.hypot(bx - ax, by - ay);
        const subdivisions = appearance
          ? Math.min(48, Math.max(1, Math.ceil(length / Math.max(1e-9, Number(appearance.featureSize) || 1) * 3)))
          : 1;
        let previous = [ax, ay, heightAt(ax, ay)];
        for (let step = 1; step <= subdivisions; step++) {
          const t = step / subdivisions;
          const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
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
  return ownedContourSegments(
    caps.filter((cap) => cap?.buried)
      .flatMap((cap) => {
        const boundary = capPerimeter(cap);
        return cap.instanceTranslations?.length
          ? cap.instanceTranslations.flatMap((delta) => boundary.map((line) => translate(line, delta)))
          : boundary;
      }),
  );
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
