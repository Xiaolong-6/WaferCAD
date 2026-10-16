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
