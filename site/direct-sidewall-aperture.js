import { difference, intersection, isEmpty } from './vector-geometry.js';

/**
 * Exact XY swept-ray envelope for an illuminated, finite-height vertical facet.
 * Every aperture must begin ABOVE the facet. A partially exposed wall cannot
 * be materialized as a single uniform 2.5D wall; the caller must fail closed.
 */
export function sidewallApertureCoverage(facet, incidence) {
  const { a, b, lowZ, highZ } = facet;
  const tiltDeg = incidence?.tiltDeg;
  const azimuthDeg = incidence?.azimuthDeg;
  const apertures = incidence?.apertureStack ?? [];
  if (
    ![...a, ...b, lowZ, highZ, tiltDeg, azimuthDeg].every(Number.isFinite) ||
    !(highZ > lowZ && tiltDeg > 0 && tiltDeg < 89) ||
    !Array.isArray(apertures)
  )
    throw new RangeError('Invalid finite-height facet or fixed incidence.');
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const slope = Math.tan((tiltDeg * Math.PI) / 180);
  const dx = slope * Math.cos(azimuth);
  const dy = slope * Math.sin(azimuth);
  let coverage = 'visible';
  for (const aperture of apertures) {
    const { bottomZUm, topZUm, opening } = aperture;
    if (
      !Number.isFinite(bottomZUm) ||
      !Number.isFinite(topZUm) ||
      topZUm <= bottomZUm ||
      bottomZUm < highZ - 1e-9 ||
      !Array.isArray(opening)
    ) {
      throw new RangeError(
        'Sidewall aperture must have a physical opening entirely above the facet.',
      );
    }
    const near = bottomZUm - highZ;
    const far = topZUm - lowZ;
    const swept = [
      [
        [
          [a[0] + near * dx, a[1] + near * dy],
          [b[0] + near * dx, b[1] + near * dy],
          [b[0] + far * dx, b[1] + far * dy],
          [a[0] + far * dx, a[1] + far * dy],
        ],
      ],
    ];
    if (isEmpty(intersection(swept, opening))) return 'blocked';
    if (!isEmpty(difference(swept, opening))) coverage = 'partial';
  }
  return coverage;
}

/**
 * Exact visible Z intervals for an axis-aligned vertical facet seen through
 * rectangular, Z-resolved openings. The ray position is linear in wall Z, so
 * each rectangular aperture imposes linear inequalities in Z; no height
 * sampling is required. Restrict to uniform exposure along the *entire* wall
 * length. Tangentially clipped and nonrectangular apertures fail closed.
 */
export function sidewallVisibleHeightIntervals(facet, incidence) {
  const { a, b, lowZ, highZ } = facet;
  const apertureStack = incidence?.apertureStack ?? [];
  if (!Array.isArray(apertureStack) || ![...a, ...b, lowZ, highZ].every(Number.isFinite))
    throw new RangeError('Invalid sidewall ray geometry.');
  const theta = incidence?.tiltDeg;
  const phi = incidence?.azimuthDeg;
  if (!(theta > 0 && theta < 89) || !Number.isFinite(phi) || !(highZ > lowZ))
    throw new RangeError('Invalid fixed-angle wall incidence.');
  if (!apertureStack.length) return [[lowZ, highZ]];
  const slope = Math.tan((theta * Math.PI) / 180);
  const velocity = [
    slope * Math.cos((phi * Math.PI) / 180),
    slope * Math.sin((phi * Math.PI) / 180),
  ];
  const tangentialAxis = Math.abs(a[0] - b[0]) > 1e-9 ? 0 : 1;
  const normalAxis = 1 - tangentialAxis;
  let interval = [lowZ, highZ];

  const rectangularBounds = (opening) => {
    if (!Array.isArray(opening) || opening.length !== 1 || opening[0].length !== 1)
      throw new RangeError('Z-segmented sidewall requires a rectangular resist opening.');
    const ring = opening[0][0];
    if (!Array.isArray(ring)) throw new RangeError('Invalid resist polygon.');
    const v = ring.slice();
    if (v.length === 5 && v[0][0] === v[4][0] && v[0][1] === v[4][1]) v.pop();
    if (
      v.length !== 4 ||
      v.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
    )
      throw new RangeError('Z-segmented sidewall requires four finite rectangular corners.');
    const x = v.map((p) => p[0]),
      y = v.map((p) => p[1]);
    const bounds = [
      [Math.min(...x), Math.max(...x)],
      [Math.min(...y), Math.max(...y)],
    ];
    if (!(bounds[0][1] > bounds[0][0] && bounds[1][1] > bounds[1][0]))
      throw new RangeError('Empty resist opening.');
    const corners = new Set(v.map(([px, py]) => px + ',' + py));
    if (
      corners.size !== 4 ||
      ![bounds[0][0], bounds[0][1]].every((px) =>
        [bounds[1][0], bounds[1][1]].every((py) => corners.has(px + ',' + py)),
      )
    )
      throw new RangeError('Z-segmented sidewall requires an axis-aligned rectangle.');
    return bounds;
  };
  const clipConstraint = (start, end, base, v, low, high) => {
    if (Math.abs(v) < 1e-12) {
      return base < low - 1e-10 || base > high + 1e-10 ? null : [start, end];
    }
    const first = (base - high) / v;
    const second = (base - low) / v;
    const newStart = Math.max(start, Math.min(first, second));
    const newEnd = Math.min(end, Math.max(first, second));
    return newEnd > newStart + 1e-9 ? [newStart, newEnd] : null;
  };
  for (const aperture of apertureStack) {
    if (
      !Number.isFinite(aperture.bottomZUm) ||
      !Number.isFinite(aperture.topZUm) ||
      !(aperture.topZUm > aperture.bottomZUm) ||
      aperture.bottomZUm < highZ - 1e-9
    )
      throw new RangeError('Segmented sidewall openings must be entirely above the wall.');
    let box;
    try {
      box = rectangularBounds(aperture.opening);
    } catch (error) {
      // Preserve the prior exact full/blocked solver for arbitrary masks.
      // Only rectangles can support analytic height intervals; never infer a
      // uniform Z-band from an arbitrary partial aperture.
      if (!(error instanceof RangeError)) throw error;
      const classification = sidewallApertureCoverage(facet, {
        ...incidence,
        apertureStack: [aperture],
      });
      if (classification === 'blocked') return [];
      if (classification === 'partial')
        throw new RangeError('Nonrectangular partial wall exposure needs 3D facet partitioning.');
      continue;
    }
    const zLevels = [aperture.bottomZUm, aperture.topZUm];
    // The entire facet length must share one Z-profile. If tangential clipping
    // occurs, a 2.5D uniform-length strip cannot express the physical result.
    const transverse = [];
    for (const end of [a, b])
      for (const level of zLevels)
        for (const z of [lowZ, highZ])
          transverse.push(end[tangentialAxis] + (level - z) * velocity[tangentialAxis]);
    const [tLo, tHi] = box[tangentialAxis];
    if (Math.max(...transverse) < tLo - 1e-9 || Math.min(...transverse) > tHi + 1e-9) return [];
    if (Math.min(...transverse) < tLo - 1e-9 || Math.max(...transverse) > tHi + 1e-9)
      throw new RangeError('Partial exposure along wall length requires a 3D facet partition.');
    for (const end of [a, b]) {
      for (const level of zLevels) {
        const base = end[normalAxis] + level * velocity[normalAxis];
        interval = clipConstraint(...interval, base, velocity[normalAxis], ...box[normalAxis]);
        if (!interval) return [];
      }
    }
  }
  // Z coordinates use the same project 0.1 nm persistence quantum. Snap
  // inward to avoid material outside the mathematically visible ray interval.
  const q = 1e-4;
  const z0 = Math.ceil((interval[0] - 1e-10) / q) * q;
  const z1 = Math.floor((interval[1] + 1e-10) / q) * q;
  return z1 - z0 >= q - 1e-10 ? [[Number(z0.toFixed(4)), Number(z1.toFixed(4))]] : [];
}
