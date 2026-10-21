/**
 * Clip one axis-aligned vertical facet to the tangential footprint of upper,
 * rectangular resist apertures. Fixed-direction rays must have zero tangent
 * component: otherwise the visible tangent interval changes with Z and the
 * current 2.5D column representation cannot express that geometry.
 *
 * Nonrectangular openings are left for the existing fail-closed visibility
 * solver. All output coordinates are snapped inward to the 0.1 nm XY grid.
 */
export function clipFixedSidewallLength(facet, incidence) {
  const { a, b, lowZ, highZ } = facet;
  if (![...a, ...b, lowZ, highZ].every(Number.isFinite) || !(highZ > lowZ))
    throw new RangeError('Invalid sidewall facet.');
  const horizontal = Math.abs(a[1] - b[1]) < 1e-9;
  const vertical = Math.abs(a[0] - b[0]) < 1e-9;
  if (horizontal === vertical) throw new RangeError('Wall facet must be axis aligned.');
  const tangent = horizontal ? 0 : 1;
  const min = Math.min(a[tangent], b[tangent]);
  const max = Math.max(a[tangent], b[tangent]);
  let low = min;
  let high = max;
  const theta = incidence?.tiltDeg;
  const azimuth = incidence?.azimuthDeg;
  if (!(theta > 0 && theta < 89) || !Number.isFinite(azimuth))
    throw new RangeError('Fixed incidence tilt and azimuth are required.');
  const transverseVelocity =
    Math.tan((theta * Math.PI) / 180) *
    (tangent === 0 ? Math.cos((azimuth * Math.PI) / 180) : Math.sin((azimuth * Math.PI) / 180));

  for (const aperture of incidence.apertureStack || []) {
    if (
      !Number.isFinite(aperture.bottomZUm) ||
      !Number.isFinite(aperture.topZUm) ||
      aperture.topZUm <= aperture.bottomZUm ||
      aperture.bottomZUm < highZ - 1e-9
    )
      throw new RangeError('Upper aperture must be entirely above the wall.');
    const opening = aperture.opening;
    // Nonrectangular coverage is still handled by the existing fail-closed solver.
    if (!Array.isArray(opening) || opening.length !== 1 || opening[0]?.length !== 1) continue;
    const ring = opening[0][0];
    if (!Array.isArray(ring)) continue;
    const v =
      ring.length === 5 && ring[0]?.[0] === ring[4]?.[0] && ring[0]?.[1] === ring[4]?.[1]
        ? ring.slice(0, -1)
        : ring;
    if (
      v.length !== 4 ||
      v.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
    )
      continue;
    const xs = v.map((p) => p[0]);
    const ys = v.map((p) => p[1]);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs);
    const y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const corners = new Set(v.map(([x, y]) => x + ',' + y));
    const expectedCorners = [[x0, y0], [x0, y1], [x1, y0], [x1, y1]];
    if (corners.size !== 4 || expectedCorners.some(([x, y]) => !corners.has(x + ',' + y)))
      continue;
    const window = tangent === 0 ? [x0, x1] : [y0, y1];
    // Nonzero tangential ray drift couples XY and Z; reject partial illumination
    // downstream rather than wrongly modeling a uniform-height rectangular strip.
    if (Math.abs(transverseVelocity) > 1e-10) continue;
    low = Math.max(low, window[0]);
    high = Math.min(high, window[1]);
    if (high - low < 1e-4 - 1e-9) return [];
  }
  // Preserve already-validated full-length Direct geometry byte for byte.
  if (low === min && high === max) return [facet];
  const quantum = 1e-4;
  const lo = Number((Math.ceil((low - 1e-10) / quantum) * quantum).toFixed(4));
  const hi = Number((Math.floor((high + 1e-10) / quantum) * quantum).toFixed(4));
  if (hi - lo < quantum - 1e-9) return [];
  const endpoint = (t) => (tangent === 0 ? [t, a[1]] : [a[0], t]);
  return [{ ...facet, a: endpoint(lo), b: endpoint(hi) }];
}
