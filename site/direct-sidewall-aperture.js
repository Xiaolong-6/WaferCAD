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
