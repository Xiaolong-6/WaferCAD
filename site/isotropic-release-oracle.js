// #298: analytic benchmark for one isotropic release seed at known Z.
// This module does NOT modify WaferCAD's production sliced etch kernel;
// it supplies a continuous Euclidean reference for later comparisons.
function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + ' must be finite and nonnegative');
  }
  return value;
}

export function isotropicReleaseDepth(radius, lateralDistance) {
  nonnegative(radius, 'radius');
  nonnegative(lateralDistance, 'lateralDistance');
  if (radius === 0 || lateralDistance >= radius) return 0;
  // Product avoids catastrophic cancellation in r²-d² near the front.
  return Math.sqrt((radius - lateralDistance) * (radius + lateralDistance));
}

export function isotropicReleaseFrontZ({ seedZ, radius, lateralDistance, face = 'front' }) {
  if (!Number.isFinite(seedZ)) throw new RangeError('seedZ must be finite');
  if (face !== 'front' && face !== 'back') throw new RangeError('Invalid face');
  const depth = isotropicReleaseDepth(radius, lateralDistance);
  return seedZ + (face === 'front' ? -depth : depth);
}

export function isotropicOracleReaches({ radius, lateralDistance, inwardDepth }) {
  nonnegative(inwardDepth, 'inwardDepth');
  const availableDepth = isotropicReleaseDepth(radius, lateralDistance);
  // Zero-thickness boundaries do not remove physical material.
  return availableDepth > 0 && inwardDepth < availableDepth;
}

// Exact worst-case vertical change in a uniform-width radial interval of
// continuous sqrt(r²-d²); useful as an *upper bound* for a piecewise-constant
// stair-step approximation using sampled radial cell endpoints.
// Not a measured XeF₂ error bound and not a tolerance for accepting old data.
export function uniformRadialStairErrorBound(radius, slices) {
  nonnegative(radius, 'radius');
  if (!Number.isSafeInteger(slices) || slices < 1) {
    throw new RangeError('slices must be a positive integer');
  }
  if (radius === 0) return 0;
  const step = radius / slices;
  return Math.sqrt(step * (2 * radius - step));
}

// The existing production isotope release loop partitions *depth* (Z) into
// equal slices, sampling the lateral radius at each depth-band midpoint.
// The worst single-seed lateral error is the last half-band near depth R.
// This is not the radial-slice bound above or a XeF2 process calibration.
export function uniformDepthMidpointLateralErrorBound(radius, slices) {
  nonnegative(radius, 'radius');
  if (!Number.isSafeInteger(slices) || slices < 1) {
    throw new RangeError('slices must be a positive integer');
  }
  if (radius === 0) return 0;
  const halfStep = radius / (2 * slices);
  return Math.sqrt(halfStep * (2 * radius - halfStep));
}

/**
 * Partition one ideal spherical release front into variable Z-depth bands.
 * The returned footprints are midpoints in LATERAL distance, unlike the
 * production kernel's equally spaced Z-depth bands.
 *
 * For a given band the exact lateral radius L(z) is monotone; therefore
 * choosing its endpoint midpoint bounds the lateral error by half the
 * band's lateral span at *every* depth, including near the tangent rim.
 *
 * This is a pure reference for a SINGLE exposed seed. It does not account
 * for selectivity, other seed islands or XY Boolean polygonization.
 */
export function adaptiveReleaseDepthBands({ radius, maxLateralErrorUm, maxBands = 4096 }) {
  nonnegative(radius, 'radius');
  if (!Number.isFinite(maxLateralErrorUm) || maxLateralErrorUm <= 0) {
    throw new RangeError('maxLateralErrorUm must be finite and positive');
  }
  if (!Number.isSafeInteger(maxBands) || maxBands < 1) {
    throw new RangeError('maxBands must be a positive integer');
  }
  if (radius === 0) return [];
  const count = Math.ceil(radius / (2 * maxLateralErrorUm));
  if (!Number.isSafeInteger(count) || count > maxBands) {
    throw new RangeError('Requested release accuracy exceeds the band budget');
  }
  const bands = [];
  for (let i = 0; i < count; i++) {
    const outerLateral = (radius * (count - i)) / count;
    const innerLateral = (radius * (count - i - 1)) / count;
    const depth0 = isotropicReleaseDepth(radius, outerLateral);
    const depth1 = isotropicReleaseDepth(radius, innerLateral);
    const lateralRadius = (outerLateral + innerLateral) / 2;
    if (!(depth1 > depth0)) {
      throw new RangeError('Release bands are below floating-point resolution');
    }
    bands.push({
      depth0,
      depth1,
      lateralRadius,
      maxLateralErrorUm: (outerLateral - innerLateral) / 2,
    });
  }
  return bands;
}

/**
 * Convert one physically exposed seed into exact Z-band removal requests.
 * This is an opt-in PREVIEW, not the Process Kernel's mutating etch path.
 * The kernel must independently solve protected-domain XY Boolean bands,
 * overlapping seeds, material selectivity and transaction semantics.
 */
export function planSelectiveIsotropicRelease({
  seedLayerId,
  seedZ,
  face,
  targetLayerIds,
  radius,
  maxLateralErrorUm,
  maxBands = 128,
  isExposed,
}) {
  if (typeof seedLayerId !== 'string' || !seedLayerId.length) {
    throw new RangeError('Missing exposed seed layer');
  }
  if (!Array.isArray(targetLayerIds) || !targetLayerIds.includes(seedLayerId)) {
    throw new RangeError('Isotropic seed must belong to selected target material');
  }
  if (isExposed !== true) {
    throw new RangeError('Isotropic seed must be physically exposed');
  }
  if (!Number.isFinite(seedZ) || !['front', 'back'].includes(face)) {
    throw new RangeError('Invalid physical seed Z or face');
  }
  const bands = adaptiveReleaseDepthBands({ radius, maxLateralErrorUm, maxBands });
  return {
    kind: 'wafercad-selective-isotropic-plan-v1',
    seedLayerId,
    seedZ,
    face,
    targetLayerIds: [...new Set(targetLayerIds)],
    maxLateralErrorUm,
    bands: bands.map((band) => ({
      z0: face === 'front' ? seedZ - band.depth1 : seedZ + band.depth0,
      z1: face === 'front' ? seedZ - band.depth0 : seedZ + band.depth1,
      lateralRadius: band.lateralRadius,
      maxLateralErrorUm: band.maxLateralErrorUm,
    })),
  };
}
