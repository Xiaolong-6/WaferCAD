const TRIANGULATION_RELATIVE_TOLERANCE = 1e-6;
const TRIANGULATION_ABSOLUTE_TOLERANCE = 1e-9;
const ANGLE_EPSILON = 1e-10;

function samePoint(a, b, tolerance = 1e-12) {
  return Boolean(
    a &&
      b &&
      Math.abs(Number(a[0]) - Number(b[0])) <= tolerance &&
      Math.abs(Number(a[1]) - Number(b[1])) <= tolerance,
  );
}

function openRing(ring) {
  const points = [];
  for (const point of ring || []) {
    const next = [Number(point?.[0]), Number(point?.[1])];
    if (!next.every(Number.isFinite) || samePoint(points.at(-1), next)) continue;
    points.push(next);
  }
  if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
  return points;
}

function closeRing(ring) {
  return ring?.length ? [...ring.map((point) => [...point]), [...ring[0]]] : [];
}

function signedRingArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index],
      b = ring[(index + 1) % ring.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea / 2;
}

function polygonArea(rings) {
  if (!rings[0]?.length) return 0;
  return Math.max(
    0,
    Math.abs(signedRingArea(rings[0])) -
      rings.slice(1).reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0),
  );
}

function triangleArea([a, b, c]) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function trianglesArea(triangles) {
  return (triangles || []).reduce((sum, triangle) => sum + triangleArea(triangle), 0);
}

function areaMatches(expected, actual) {
  const tolerance = Math.max(
    TRIANGULATION_ABSOLUTE_TOLERANCE,
    expected * TRIANGULATION_RELATIVE_TOLERANCE,
  );
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function ringCentroid(ring) {
  return [
    ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
    ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
  ];
}

function normalizedAngle(value) {
  const full = Math.PI * 2;
  let angle = value % full;
  if (angle < 0) angle += full;
  return angle;
}

function cross2d(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function rayIntersection(ring, center, angle, tolerance) {
  const direction = [Math.cos(angle), Math.sin(angle)],
    hits = [];

  for (let index = 0; index < ring.length; index++) {
    const p = ring[index],
      q = ring[(index + 1) % ring.length],
      edge = [q[0] - p[0], q[1] - p[1]],
      relative = [p[0] - center[0], p[1] - center[1]],
      denominator = cross2d(direction, edge);
    if (Math.abs(denominator) <= 1e-15) continue;

    const distance = cross2d(relative, edge) / denominator,
      edgeT = cross2d(relative, direction) / denominator;
    if (
      distance >= -tolerance &&
      edgeT >= -tolerance &&
      edgeT <= 1 + tolerance &&
      Number.isFinite(distance)
    ) {
      hits.push(distance);
    }
  }

  hits.sort((a, b) => a - b);
  const unique = [];
  for (const hit of hits) {
    if (hit < -tolerance) continue;
    if (!unique.length || Math.abs(hit - unique.at(-1)) > tolerance) unique.push(hit);
  }
  if (unique.length !== 1) return null;

  const distance = unique[0];
  return [center[0] + direction[0] * distance, center[1] + direction[1] * distance, distance];
}

function primaryTriangles(THREE, rings) {
  const threeRings = rings.map((ring) => ring.map(([x, y]) => new THREE.Vector2(x, y))),
    points = threeRings.flat(),
    faces = THREE.ShapeUtils.triangulateShape(threeRings[0], threeRings.slice(1)),
    triangles = faces
      .map((face) => face.map((index) => [points[index].x, points[index].y]))
      .filter((triangle) => triangleArea(triangle) > TRIANGULATION_ABSOLUTE_TOLERANCE);
  return { triangles, area: trianglesArea(triangles) };
}

function uniqueSorted(values, tolerance = 1e-12) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b),
    out = [];
  for (const value of sorted) {
    if (!out.length || Math.abs(value - out.at(-1)) > tolerance) out.push(value);
  }
  return out;
}

// Earcut can over-triangulate wafer-scale thin or heavily clipped rings. When
// both the direct path and the annulus-specialized path fail, decompose the
// valid polygon into vertex-aligned horizontal slabs. Polygon-clipping performs
// the exact 2D intersection; each slab is then triangulated independently. This
// fallback is renderer-only and never changes canonical process geometry.
function slabFallbackTriangles(THREE, rings, expectedArea) {
  const kernel = globalThis.polygonClipping;
  if (!kernel?.intersection || !rings?.length) return null;

  const xs = rings.flat().map((point) => point[0]),
    ys = uniqueSorted(rings.flat().map((point) => point[1]));
  if (ys.length < 2 || !xs.length) return null;

  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    span = Math.max(1, maxX - minX),
    margin = span * 1e-6 + 1e-6,
    subject = [rings.map(closeRing)],
    triangles = [];

  for (let index = 1; index < ys.length; index++) {
    const y0 = ys[index - 1],
      y1 = ys[index];
    if (!(y1 > y0 + 1e-12)) continue;

    const slab = [
      [
        [
          [minX - margin, y0],
          [maxX + margin, y0],
          [maxX + margin, y1],
          [minX - margin, y1],
          [minX - margin, y0],
        ],
      ],
    ];

    let clipped;
    try {
      clipped = kernel.intersection(subject, slab);
    } catch {
      return null;
    }

    for (const polygon of clipped || []) {
      const piece = (polygon || []).map(openRing).filter((ring) => ring.length >= 3);
      if (!piece.length) continue;
      const primary = primaryTriangles(THREE, piece);
      if (!areaMatches(polygonArea(piece), primary.area)) return null;
      triangles.push(...primary.triangles);
    }
  }

  return triangles.length && areaMatches(expectedArea, trianglesArea(triangles)) ? triangles : null;
}

function radialAnnulusTriangles(rings) {
  if (rings.length !== 2 || rings.some((ring) => ring.length < 3)) return null;

  const [outer, hole] = rings,
    center = ringCentroid(hole),
    span = Math.max(
      ...outer.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])),
      1,
    ),
    hitTolerance = Math.max(1e-8, span * 1e-8),
    gapTolerance = Math.max(1e-9, span * 1e-12),
    angles = [...outer, ...hole]
      .map((point) => normalizedAngle(Math.atan2(point[1] - center[1], point[0] - center[0])))
      .sort((a, b) => a - b),
    uniqueAngles = [];

  for (const angle of angles) {
    if (!uniqueAngles.length || Math.abs(angle - uniqueAngles.at(-1)) > ANGLE_EPSILON) {
      uniqueAngles.push(angle);
    }
  }
  if (
    uniqueAngles.length > 1 &&
    Math.PI * 2 - uniqueAngles.at(-1) + uniqueAngles[0] <= ANGLE_EPSILON
  ) {
    uniqueAngles.pop();
  }
  if (uniqueAngles.length < 3) return null;

  const outerPoints = [],
    holePoints = [];
  for (const angle of uniqueAngles) {
    const outerHit = rayIntersection(outer, center, angle, hitTolerance),
      holeHit = rayIntersection(hole, center, angle, hitTolerance);
    if (!outerHit || !holeHit || outerHit[2] <= holeHit[2] + gapTolerance) return null;
    outerPoints.push(outerHit.slice(0, 2));
    holePoints.push(holeHit.slice(0, 2));
  }

  const triangles = [];
  for (let index = 0; index < uniqueAngles.length; index++) {
    const next = (index + 1) % uniqueAngles.length;
    triangles.push(
      [outerPoints[index], outerPoints[next], holePoints[next]],
      [outerPoints[index], holePoints[next], holePoints[index]],
    );
  }
  return triangles;
}

export function triangulatePolygon(THREE, polygon) {
  const rings = (polygon || []).map(openRing).filter((ring) => ring.length >= 3);
  if (!rings[0]?.length) return [];

  const expectedArea = polygonArea(rings);
  if (expectedArea <= TRIANGULATION_ABSOLUTE_TOLERANCE) return [];

  const primary = primaryTriangles(THREE, rings);
  if (areaMatches(expectedArea, primary.area)) return primary.triangles;

  const annulus = radialAnnulusTriangles(rings)?.filter(
    (triangle) => triangleArea(triangle) > TRIANGULATION_ABSOLUTE_TOLERANCE,
  );
  if (annulus?.length && areaMatches(expectedArea, trianglesArea(annulus))) return annulus;

  const slabs = slabFallbackTriangles(THREE, rings, expectedArea);
  if (slabs?.length) return slabs;

  // A missing cap is preferable to a malformed triangle spanning unrelated material.
  return [];
}
