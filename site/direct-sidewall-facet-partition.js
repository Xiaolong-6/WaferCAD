/**
 * Conservative fixed-incidence facet visibility for a single vertical,
 * axis-aligned wall and one or more rectangular openings entirely above it.
 *
 * A 2.5D material region represents one XY strip with one constant Z interval.
 * For a beam with a tangent component, the true visible facet is generally
 * oblique in (tangent,Z). Convert it into inward-rounded rectangular patches:
 * every ray from EVERY point of an emitted patch clears every aperture.
 *
 * Missing corner triangles are intentional under-approximation. Convergence
 * must be checked against a smaller maximumSliceUm. No PVD process is added.
 */
export function partitionFixedSidewallFacet(facet, incidence, options = {}) {
  const { a, b, lowZ, highZ } = facet ?? {};
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== 2 ||
    b.length !== 2 ||
    ![...a, ...b, lowZ, highZ].every(Number.isFinite) ||
    highZ <= lowZ
  )
    throw new RangeError('Invalid physical vertical facet.');
  const horizontal = Math.abs(a[1] - b[1]) <= 1e-9;
  const vertical = Math.abs(a[0] - b[0]) <= 1e-9;
  if (horizontal === vertical)
    throw new RangeError('Facet must be axis aligned and nonzero length.');
  const tiltDeg = incidence?.tiltDeg;
  const azimuthDeg = incidence?.azimuthDeg;
  const stack = incidence?.apertureStack;
  if (
    !(Number.isFinite(tiltDeg) && tiltDeg > 0 && tiltDeg < 89) ||
    !Number.isFinite(azimuthDeg) ||
    !Array.isArray(stack) ||
    !stack.length
  )
    throw new RangeError('Finite fixed incidence and upper apertureStack required.');
  const maximumSliceUm = options.maximumSliceUm ?? incidence.facetSliceUm ?? 0.05;
  const maxSlices = options.maxSlices ?? incidence.maxFacetSlices ?? 256;
  const quantum = options.quantumUm ?? 1e-4;
  if (
    !Number.isFinite(maximumSliceUm) ||
    maximumSliceUm <= 0 ||
    !Number.isFinite(quantum) ||
    quantum <= 0 ||
    !Number.isInteger(maxSlices) ||
    maxSlices < 1
  )
    throw new RangeError('Invalid facet resolution/budget.');
  const tangent = horizontal ? 0 : 1;
  const normal = 1 - tangent;
  const v = Math.tan((tiltDeg * Math.PI) / 180);
  const velocity = [
    v * Math.cos((azimuthDeg * Math.PI) / 180),
    v * Math.sin((azimuthDeg * Math.PI) / 180),
  ];
  const limits = [];
  let lastTop = null;
  for (const aperture of stack) {
    if (
      !Number.isFinite(aperture.bottomZUm) ||
      !Number.isFinite(aperture.topZUm) ||
      aperture.topZUm <= aperture.bottomZUm ||
      aperture.bottomZUm < highZ - 1e-9 ||
      (lastTop !== null && Math.abs(lastTop - aperture.bottomZUm) > 1e-9)
    )
      throw new RangeError('Only contiguous upper-only physical resist openings are supported.');
    lastTop = aperture.topZUm;
    const geom = aperture.opening;
    if (!Array.isArray(geom) || geom.length !== 1 || geom[0].length !== 1)
      throw new RangeError('Partial facet visibility requires one rectangular aperture per level.');
    let corners = geom[0][0];
    if (!Array.isArray(corners)) throw new RangeError('Invalid rectangular opening.');
    if (corners.length === 5 && corners[0][0] === corners[4][0] && corners[0][1] === corners[4][1])
      corners = corners.slice(0, 4);
    if (
      corners.length !== 4 ||
      corners.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
    )
      throw new RangeError('Partial facet visibility requires four rectangle corners.');
    const xs = corners.map((p) => p[0]),
      ys = corners.map((p) => p[1]);
    const bounds = [
      [Math.min(...xs), Math.max(...xs)],
      [Math.min(...ys), Math.max(...ys)],
    ];
    const seen = new Set(corners.map(([x, y]) => x + ',' + y));
    const expected = [
      [bounds[0][0], bounds[1][0]],
      [bounds[0][0], bounds[1][1]],
      [bounds[0][1], bounds[1][0]],
      [bounds[0][1], bounds[1][1]],
    ];
    if (
      seen.size !== 4 ||
      expected.some(([x, y]) => !seen.has(x + ',' + y)) ||
      bounds.some(([lo, hi]) => !(hi > lo))
    )
      throw new RangeError('Oblique facet visibility requires an axis-aligned rectangle.');
    limits.push({ z: [aperture.bottomZUm, aperture.topZUm], bounds });
  }
  const lo = Math.min(a[tangent], b[tangent]);
  const hi = Math.max(a[tangent], b[tangent]);
  const slices = Math.ceil((hi - lo) / maximumSliceUm);
  if (slices > maxSlices)
    throw new RangeError(
      'Facet-partition sampling budget exceeded; refine ROI or increase declared budget.',
    );
  const result = [];
  // Solve min <= t + (za - z)*v <= max at all 4 combinations of
  // tangent-bin endpoint and upper-aperture Z endpoint, for both axes.
  function clampZ(interval, base, velocityAxis, min, max) {
    if (Math.abs(velocityAxis) < 1e-13)
      return base < min - 1e-10 || base > max + 1e-10 ? null : interval;
    let z0 = (base - max) / velocityAxis;
    let z1 = (base - min) / velocityAxis;
    if (z0 > z1) [z0, z1] = [z1, z0];
    const left = Math.max(interval[0], z0),
      right = Math.min(interval[1], z1);
    return right > left + 1e-12 ? [left, right] : null;
  }
  for (let i = 0; i < slices; i++) {
    const rawLo = lo + ((hi - lo) * i) / slices;
    const rawHi = lo + ((hi - lo) * (i + 1)) / slices;
    const binLo = Math.ceil((rawLo - 1e-11) / quantum) * quantum;
    const binHi = Math.floor((rawHi + 1e-11) / quantum) * quantum;
    if (binHi - binLo < quantum - 1e-10) continue;
    let visible = [lowZ, highZ];
    for (const mask of limits) {
      for (const t of [binLo, binHi]) {
        for (const h of mask.z) {
          for (const axis of [0, 1]) {
            const coord = axis === tangent ? t : a[normal];
            visible = clampZ(
              visible,
              coord + h * velocity[axis],
              velocity[axis],
              mask.bounds[axis][0],
              mask.bounds[axis][1],
            );
            if (!visible) break;
          }
          if (!visible) break;
        }
        if (!visible) break;
      }
      if (!visible) break;
    }
    if (!visible) continue;
    const z0 = Math.ceil((visible[0] - 1e-10) / quantum) * quantum;
    const z1 = Math.floor((visible[1] + 1e-10) / quantum) * quantum;
    if (z1 - z0 < quantum - 1e-10) continue;
    const coord = (t) => (tangent === 0 ? [t, a[1]] : [a[0], t]);
    result.push({
      a: coord(Number(binLo.toFixed(8))),
      b: coord(Number(binHi.toFixed(8))),
      lowZ,
      highZ,
      visibleHeightIntervals: [[Number(z0.toFixed(8)), Number(z1.toFixed(8))]],
    });
  }
  return result;
}
