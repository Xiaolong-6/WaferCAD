// Fig. 1c shared-contour geometry: one source-of-truth release cavity edge.
// Returns planar positive Si and Cr/Au Mask contours; it is NOT a conformal
// film-deposition simulation. Paper specifies metal evaporation + lift-off.
// Lithographic vertices, offsets and net-isolation slots are illustrative.
export const SWX_RELEASE_CAVITY_CONTOUR_UM = Object.freeze([
  [-78, -39], [-75, -39], [-71, -54], [-48, -54],
  [-36, -51], [42, -51], [55, -46], [55, 46],
  [48, 54], [-22, 54], [-34, 59], [-65, 57],
  [-75, 39], [-78, 39],
].map((p) => Object.freeze(p)));

export const SWX_PERIMETER_GEOMETRY_UM = Object.freeze({
  siliconOffset: 20,
  metalInset: 1,
  isolationSlot: 2,
  groundedSpringRouteWidth: 1.2,
  metalRouteWidth: 0.6,
});

const area = (points) => points.reduce((acc, point, i) => {
  const next = points[(i + 1) % points.length];
  return acc + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

export function offsetSharedContour(points, distance) {
  if (points.length < 3 || area(points) <= 0) {
    throw new Error('SWX perimeter requires a CCW, nondegenerate cavity contour');
  }
  const normals = points.map((p, i) => {
    const q = points[(i + 1) % points.length], dx = q[0] - p[0], dy = q[1] - p[1];
    const length = Math.hypot(dx, dy);
    if (length <= 1e-9) throw new Error('Degenerate SWX perimeter segment');
    return [dy / length, -dx / length];
  });
  return points.map((p, i) => {
    const a = normals[(i + points.length - 1) % points.length], b = normals[i];
    const denom = 1 + a[0] * b[0] + a[1] * b[1];
    if (denom < 0.2) throw new Error('SWX perimeter join requires beveling');
    return [p[0] + distance * (a[0] + b[0]) / denom,
      p[1] + distance * (a[1] + b[1]) / denom];
  });
}

export function buildSwxConformalPerimeter({ addPolygon, addPath }) {
  const points = SWX_RELEASE_CAVITY_CONTOUR_UM,
    cfg = SWX_PERIMETER_GEOMETRY_UM,
    n = points.length,
    netAt = (i) => i >= 2 && i <= 7 ? 'SIGNAL' : 'GROUND',
    edges = {
      siliconInner: offsetSharedContour(points, 0),
      siliconOuter: offsetSharedContour(points, cfg.siliconOffset),
      metalInner: offsetSharedContour(points, cfg.metalInset),
      metalOuter: offsetSharedContour(points, cfg.siliconOffset - cfg.metalInset),
    },
    interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (!(cfg.isolationSlot > 0 && cfg.siliconOffset > 2 * cfg.metalInset)) {
    throw new Error('Invalid SWX electrode isolation geometry');
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n, net = netAt(i),
      length = Math.hypot(points[next][0] - points[i][0], points[next][1] - points[i][1]),
      begin = netAt((i + n - 1) % n) === net ? -0.015 : cfg.isolationSlot / (2 * length),
      end = netAt(next) === net ? 1.015 : 1 - cfg.isolationSlot / (2 * length);
    if (begin >= end) throw new Error('Isolation slot removes entire perimeter segment');
    const band = (inner, outer) => [
      interpolate(inner[i], inner[next], begin),
      interpolate(inner[i], inner[next], end),
      interpolate(outer[i], outer[next], end),
      interpolate(outer[i], outer[next], begin),
    ];
    addPolygon({
      name: `PERIMETER_${net}_SUPPORTED_SI_${i}`, layer: 1, part: 'fixed',
      points: band(edges.siliconInner, edges.siliconOuter),
      evidence: 'Fig. 1c shared cavity edge; offset and coordinates inferred',
    });
    addPolygon({
      name: `PERIMETER_${net}_CR_AU_${i}`, layer: 3, part: 'metal',
      points: band(edges.metalInner, edges.metalOuter),
      evidence: 'Cr50/Au300 patterned evaporation and lift-off; XY contour inferred',
    });
  }
  const routes = [
    { net: 'GROUND', points: [[-15, 48], [-15, 64]] },
    { net: 'SIGNAL', points: [[-9, 21], [-9, 50], [49, 50], [56, 44], [64, 44]] },
    { net: 'SIGNAL', points: [[-9, -11], [-9, -63]] },
  ];
  const next = { GROUND: 0, SIGNAL: 0 };
  for (const route of routes) {
    const id = next[route.net]++;
    addPath({
      name: `${route.net}_SUPPORTED_SI_ROUTE_${id}`, layer: 1, part: 'fixed',
      points: route.points, width: cfg.groundedSpringRouteWidth,
      evidence: 'BOX-supported Si lead to a common-contour land; XY inferred',
    });
    addPath({
      name: `${route.net}_METAL_ROUTE_${id}`, layer: 3, part: 'metal',
      points: route.points, width: cfg.metalRouteWidth,
      evidence: 'Directional evaporated patterned metal lead; XY inferred',
    });
  }
  return {
    cavityContour: points.map((p) => [...p]),
    siliconOuter: edges.siliconOuter,
    metalInner: edges.metalInner,
    metalOuter: edges.metalOuter,
    nets: ['GROUND', 'SIGNAL'],
    perimeterSegments: n,
    isolationSlotUm: cfg.isolationSlot,
  };
}
