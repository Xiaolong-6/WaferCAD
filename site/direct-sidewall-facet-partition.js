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
/**
 * Exact convex illuminated polygon in (wall tangent in µm, Z in µm).
 * The plane-wave ray coordinates are affine in tangent and Z, so all
 * rectangular-aperture constraints are linear half-planes. No sampling.
 */
function prepareFacet(facet, incidence) {
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
  return { a, b, lowZ, highZ, tangent, normal, velocity, limits, lo, hi };
}

function clipHalfPlane(polygon, A, B, C) {
  if (!polygon.length) return polygon;
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const next = polygon[i];
    const d0 = A * prev[0] + B * prev[1] + C;
    const d1 = A * next[0] + B * next[1] + C;
    const inside0 = d0 >= -1e-12;
    const inside1 = d1 >= -1e-12;
    if (inside0 !== inside1) {
      const ratio = d0 / (d0 - d1);
      out.push([prev[0] + ratio * (next[0] - prev[0]), prev[1] + ratio * (next[1] - prev[1])]);
    }
    if (inside1) out.push(next);
  }
  return out;
}

export function facetPolygonArea(polygon) {
  let signedDoubleArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    signedDoubleArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(signedDoubleArea) / 2;
}

function exactPolygonFromPrepared(prepared) {
  const { a, tangent, normal, velocity, limits, lo, hi, lowZ, highZ } = prepared;
  let polygon = [
    [lo, lowZ],
    [hi, lowZ],
    [hi, highZ],
    [lo, highZ],
  ];
  for (const mask of limits) {
    for (const h of mask.z) {
      for (let axis = 0; axis < 2; axis++) {
        const A = axis === tangent ? 1 : 0;
        const B = -velocity[axis];
        const base = (axis === normal ? a[normal] : 0) + h * velocity[axis];
        polygon = clipHalfPlane(polygon, A, B, base - mask.bounds[axis][0]);
        polygon = clipHalfPlane(polygon, -A, -B, mask.bounds[axis][1] - base);
        if (!polygon.length) return [];
      }
    }
  }
  return polygon;
}

export function exactFixedSidewallVisibleFacet(facet, incidence) {
  return exactPolygonFromPrepared(prepareFacet(facet, incidence));
}

export function partitionFixedSidewallFacet(facet, incidence, options = {}) {
  const prepared = prepareFacet(facet, incidence);
  const { a, lowZ, highZ, tangent, normal, velocity, limits } = prepared;
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
  const polygon = exactPolygonFromPrepared(prepared);
  if (!polygon.length || facetPolygonArea(polygon) < 1e-14) return [];
  const lo = Math.max(prepared.lo, Math.min(...polygon.map(([t]) => t)));
  const hi = Math.min(prepared.hi, Math.max(...polygon.map(([t]) => t)));
  // Put *every* tangential bin edge on the canonical persistence grid.
  // Independently rounding fractional bin edges inward loses one grid quantum
  // at every seam and makes finer sampling produce *less* physical material.
  const gridStart = Math.ceil((lo - 1e-11) / quantum);
  const gridEnd = Math.floor((hi + 1e-11) / quantum);
  const gridUnits = gridEnd - gridStart;
  if (gridUnits < 1)
    throw new RangeError('Illuminated facet is narrower than the physical XY grid.');
  const exactArea = facetPolygonArea(polygon);
  const maxAreaLossFraction =
    options.maxAreaLossFraction ?? incidence.facetMaxAreaLossFraction ?? 0.02;
  if (!Number.isFinite(maxAreaLossFraction) || maxAreaLossFraction < 0 || maxAreaLossFraction >= 1)
    throw new RangeError('Facet area-loss fraction must be within [0, 1).');
  let slices = Math.max(1, Math.ceil((gridUnits * quantum) / maximumSliceUm));
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
  // Refine only as needed to meet a published, exact analytical area bound.
  // No output may claim a smaller loss than its actual polygon/XY/Z geometry.
  while (true) {
    if (slices > maxSlices)
      throw new RangeError('Facet accuracy budget exceeded before convergence.');
    const result = [];
    for (let i = 0; i < slices; i++) {
      const binLo = (gridStart + Math.floor((gridUnits * i) / slices)) * quantum;
      const binHi = (gridStart + Math.floor((gridUnits * (i + 1)) / slices)) * quantum;
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
    const storedArea = result.reduce((sum, part) => {
      const width = Math.hypot(part.b[0] - part.a[0], part.b[1] - part.a[1]);
      const height = part.visibleHeightIntervals[0][1] - part.visibleHeightIntervals[0][0];
      return sum + width * height;
    }, 0);
    // The missing rim below the XY/Z persistence quantum also contributes to
    // the deficit. Never relax the physical quantum to pass this check.
    if (exactArea - storedArea <= exactArea * maxAreaLossFraction + 1e-11) return result;
    if (slices >= Math.min(maxSlices, gridUnits))
      throw new RangeError('Facet accuracy budget exceeded: physical area loss too high.');
    slices = Math.min(maxSlices, gridUnits, Math.max(slices + 1, Math.ceil(slices * 1.5)));
  }
}
