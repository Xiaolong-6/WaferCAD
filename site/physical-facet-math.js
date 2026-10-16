// Experimental physical-surface mathematics for #297.
// Pure analytic oracle only: this does not mutate canonical WaferCAD models,
// enable physical facets in Process, or replace appearance-only roughness.
function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + ' must be positive');
  return value;
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(name + ' must be finite');
  return value;
}

export function squarePyramidSample(
  x,
  y,
  { pitch, height, planeZ = 0, originX = 0, originY = 0, face = 'front' },
) {
  finite(x, 'x');
  finite(y, 'y');
  positive(pitch, 'pitch');
  positive(height, 'height');
  finite(planeZ, 'planeZ');
  finite(originX, 'originX');
  finite(originY, 'originY');
  if (face !== 'front' && face !== 'back') throw new RangeError('Unknown face');
  const dx = x - originX - pitch * Math.round((x - originX) / pitch);
  const dy = y - originY - pitch * Math.round((y - originY) / pitch);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const sign = face === 'front' ? 1 : -1;
  const relief = height * Math.max(0, 1 - (2 * Math.max(ax, ay)) / pitch);
  const z = planeZ + sign * relief;
  // At the four triangular patch joins (and the apex) a unique analytic
  // normal does not exist. Callers must not invent a film direction there.
  const crease =
    Math.abs(ax - ay) <= pitch * 1e-12 ||
    Math.abs(ax - pitch / 2) <= pitch * 1e-12 ||
    Math.abs(ay - pitch / 2) <= pitch * 1e-12;
  const gradScale = (-sign * 2 * height) / pitch;
  const gradient = crease
    ? null
    : ax > ay
      ? [gradScale * Math.sign(dx), 0]
      : [0, gradScale * Math.sign(dy)];
  const norm = gradient
    ? Math.hypot(gradient[0], gradient[1], 1)
    : null;
  const normal = gradient
    ? face === 'front'
      ? [-gradient[0] / norm, -gradient[1] / norm, 1 / norm]
      : [gradient[0] / norm, gradient[1] / norm, -1 / norm]
    : null;
  return { z, relief, gradient, normal, crease, face };
}

// This is a local planar-facet oracle, not an offset-surface Boolean.
// Offset by normal thickness t corresponds to vertical separation
// t*sqrt(1+|grad z|²) at a *fixed XY coordinate* for a parallel plane.
// It cannot be applied unchanged across ridges, valleys or mask edges.
export function facetNormalFilmVerticalSeparation(sample, thickness) {
  positive(thickness, 'thickness');
  if (!sample?.gradient || !sample.normal)
    throw new RangeError('Facet normal undefined at a crease or apex');
  const [dx, dy] = sample.gradient;
  return thickness * Math.hypot(dx, dy, 1);
}

// Volume of one pyramid of square base p x p and apex height h.
// This is the relief volume above planeZ (or below it on Back).
export function squarePyramidReliefVolume(pitch, height) {
  positive(pitch, 'pitch');
  positive(height, 'height');
  return (pitch * pitch * height) / 3;
}
