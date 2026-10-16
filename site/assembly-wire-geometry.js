/**
 * Explicit 3D packaging geometry. A wire bond is an Au tube connecting two
 * already existing top metal surfaces; it is not a 2.5D process deposition
 * or evidence of a measured electrical net. Coordinates and diameters are um.
 */
export const MAX_ASSEMBLY_WIRES = 256;
const MAX_COORDINATE_UM = 1e9;

function validPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE_UM)
  );
}

export function validateAssemblyWires(wires) {
  if (!Array.isArray(wires) || wires.length > MAX_ASSEMBLY_WIRES) {
    throw new Error('assemblyWires must be an array of at most 256 wires');
  }
  const seen = new Set();
  for (const wire of wires) {
    if (!wire || typeof wire !== 'object' || Array.isArray(wire)) {
      throw new Error('assemblyWires contains a non-object wire');
    }
    if (typeof wire.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(wire.id) || seen.has(wire.id)) {
      throw new Error('assemblyWires wire IDs must be unique lowercase identifiers');
    }
    seen.add(wire.id);
    if (wire.material !== 'Au' || wire.source !== 'inferred') {
      throw new Error('assemblyWires wire material/source must be explicit');
    }
    if (
      !Number.isFinite(wire.diameterUm) ||
      wire.diameterUm <= 0 ||
      wire.diameterUm > 500
    ) {
      throw new Error('assemblyWires wire diameter must be in (0,500] um');
    }
    if (
      !Array.isArray(wire.points) ||
      wire.points.length !== 4 ||
      !wire.points.every(validPoint)
    ) {
      throw new Error('assemblyWires wire must have four finite cubic Bezier 3D points');
    }
    if (
      !Array.isArray(wire.contactLayerIds) ||
      wire.contactLayerIds.length !== 2 ||
      !wire.contactLayerIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
    ) {
      throw new Error('assemblyWires wire endpoints must name both physical metal layer IDs');
    }
    const [a, b, c, d] = wire.points;
    if (Math.hypot(a[0] - d[0], a[1] - d[1], a[2] - d[2]) <= wire.diameterUm) {
      throw new Error('assemblyWires wire endpoints must be physically distinct');
    }
    if (b[2] <= a[2] || c[2] <= d[2]) {
      throw new Error('assemblyWires cubic controls must rise above their contact surfaces');
    }
  }
  return wires;
}

export function inferredAuWireBond({
  id,
  from,
  to,
  fromLayerId,
  toLayerId,
  riseUm = 190,
  diameterUm = 12,
}) {
  if (!validPoint(from) || !validPoint(to) || !Number.isFinite(riseUm) || riseUm <= 0) {
    throw new Error('Invalid inferred Au bond endpoint or rise');
  }
  const apexControlZ = Math.max(from[2], to[2]) + riseUm;
  const interpolate = (fraction) => [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
    apexControlZ,
  ];
  const wire = {
    id,
    material: 'Au',
    source: 'inferred',
    diameterUm,
    contactLayerIds: [fromLayerId, toLayerId],
    points: [[...from], interpolate(0.22), interpolate(0.78), [...to]],
  };
  validateAssemblyWires([wire]);
  return wire;
}
