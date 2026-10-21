import { difference, intersection, isEmpty, pointInMulti, rectMulti } from './vector-geometry.js';

const TOL = 1e-8;

/**
 * Ballistic, wafer-normal-thickness input on an isolated vertical rectangular
 * material step. This is a deliberately narrow 2.5D physical geometry contract:
 * no resist, competing obstacles, sloped facets, or time-resolved self-shadow.
 * The material wall occupies the *lower* material column outside the plateau.
 */
export function isolatedDirectSidewallPlan(model, area, incidence, thicknessUm) {
  if (incidence?.sidewallGeometry !== 'isolated-step')
    throw new RangeError('Unsupported Direct sidewall geometry mode.');
  const theta = incidence.tiltDeg;
  const phi = incidence.azimuthDeg;
  if (!(theta > 0 && theta < 89) || !Number.isFinite(phi))
    throw new RangeError('Isolated sidewall requires a finite nonzero Direct tilt.');
  if ((incidence.apertureStack || []).length)
    throw new RangeError('Sidewall deposition through resist requires 3D occlusion; unsupported.');
  if (!isEmpty(difference(model.boundary, area)))
    throw new RangeError('Isolated sidewall requires the complete physical face, not a 2D mask.');
  if (!(Number.isFinite(thicknessUm) && thicknessUm > 0))
    throw new RangeError('Sidewall nominal thickness must be positive.');
  if ((model.regions || []).length !== 2)
    throw new RangeError('Sidewall geometry requires an isolated two-region step.');
  const regionTop = (region) => region.stack.at(-1)?.z1;
  const ascending = [...model.regions].sort((a, b) => regionTop(a) - regionTop(b));
  const [low, high] = ascending;
  const lowZ = regionTop(low),
    highZ = regionTop(high);
  if (!(highZ - lowZ > TOL) || high.geom.length !== 1 || high.geom[0].length !== 1)
    throw new RangeError('Sidewall geometry requires a single rectangular raised region.');
  const ring = high.geom[0][0];
  const vertices =
    ring.at(-1)?.[0] === ring[0]?.[0] && ring.at(-1)?.[1] === ring[0]?.[1]
      ? ring.slice(0, -1)
      : ring;
  if (vertices.length !== 4)
    throw new RangeError('Sidewall geometry currently accepts rectangular steps only.');
  const azimuth = (phi * Math.PI) / 180;
  const incidentX = Math.cos(azimuth),
    incidentY = Math.sin(azimuth);
  const travelWidth = thicknessUm * Math.tan((theta * Math.PI) / 180);
  const strips = [];
  for (let i = 0; i < 4; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 4];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    if (!(Math.abs(dx) < TOL || Math.abs(dy) < TOL) || Math.hypot(dx, dy) <= TOL)
      throw new RangeError('Sidewall geometry currently accepts axis-aligned rectangles only.');
    const length = Math.hypot(dx, dy);
    let nx = -dy / length,
      ny = dx / length;
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const probe = Math.min(0.001, length / 10);
    if (pointInMulti([midpoint[0] + probe * nx, midpoint[1] + probe * ny], high.geom)) {
      nx = -nx;
      ny = -ny;
    }
    const flux = nx * incidentX + ny * incidentY;
    if (flux <= TOL) continue;
    const width = travelWidth * flux;
    if (width < 1e-4)
      throw new RangeError('Projected sidewall thickness is below the 0.1 nm XY grid.');
    const strip =
      Math.abs(dx) < TOL
        ? rectMulti(width, length, midpoint[0] + (nx * width) / 2, midpoint[1])
        : rectMulti(length, width, midpoint[0], midpoint[1] + (ny * width) / 2);
    const clipped = intersection(intersection(strip, low.geom), area);
    if (!isEmpty(clipped)) strips.push({ area: clipped, lowZ, highZ, projectedWidthUm: width });
  }
  if (!strips.length) throw new Error('No illuminated sidewall with exposed lower material.');
  return strips;
}
