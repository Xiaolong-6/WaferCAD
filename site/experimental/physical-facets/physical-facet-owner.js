import { samplePhysicalPyramidSlab, physicalPyramidSlabCellVolume } from './physical-facet-math.js';

export const PHYSICAL_OWNER_KIND = 'wafercad-physical-pyramid-slab-v1';

function finite(x, label) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new RangeError(label + ' must be finite');
  }
  return x;
}

export function makePhysicalPyramidOwner({
  layerId,
  pitch,
  height,
  bottomPlaneZ,
  topPlaneZ,
  originX = 0,
  originY = 0,
  domain,
}) {
  if (typeof layerId !== 'string' || !layerId.trim()) {
    throw new RangeError('Missing physical material layerId');
  }
  if (!(finite(pitch, 'pitch') > 0) || !(finite(height, 'height') > 0)) {
    throw new RangeError('Pitch and height must be positive');
  }
  if (!(finite(topPlaneZ, 'topPlaneZ') > finite(bottomPlaneZ, 'bottomPlaneZ'))) {
    throw new RangeError('Physical planes are inverted');
  }
  finite(originX, 'originX');
  finite(originY, 'originY');
  if (!domain || typeof domain !== 'object') {
    throw new RangeError('Missing rectangular XY domain');
  }
  const { minX, maxX, minY, maxY } = domain;
  for (const [key, value] of Object.entries({ minX, maxX, minY, maxY })) {
    finite(value, key);
  }
  const nx = (maxX - minX) / pitch;
  const ny = (maxY - minY) / pitch;
  for (const n of [nx, ny]) {
    if (!(n > 0) || !Number.isSafeInteger(Math.round(n)) || Math.abs(n - Math.round(n)) > 1e-9) {
      throw new RangeError('Physical owner domain requires entire pyramid cells');
    }
  }
  if (nx * ny > 1_000_000) throw new RangeError('Too many physical owner cells');
  return {
    kind: PHYSICAL_OWNER_KIND,
    layerId,
    pitch,
    height,
    bottomPlaneZ,
    topPlaneZ,
    originX,
    originY,
    domain: { minX, maxX, minY, maxY },
  };
}

export function restorePhysicalPyramidOwner(value) {
  if (!value || value.kind !== PHYSICAL_OWNER_KIND) {
    throw new RangeError('Unsupported physical owner schema');
  }
  const { kind, ...values } = value;
  return makePhysicalPyramidOwner(values);
}

export function physicalMaterialAt(owner, x, y, z = null) {
  const valid = restorePhysicalPyramidOwner(owner);
  finite(x, 'x');
  finite(y, 'y');
  if (z !== null) finite(z, 'z');
  const { domain, kind, ...config } = valid;
  if (x < domain.minX || x >= domain.maxX || y < domain.minY || y >= domain.maxY) {
    return null;
  }
  const interval = samplePhysicalPyramidSlab(x, y, config);
  const occupancy =
    z === null
      ? 'unqueried'
      : z > interval.z0 && z < interval.z1
        ? 'solid'
        : z === interval.z0 || z === interval.z1
          ? 'interface'
          : 'void';
  return { ...interval, occupancy };
}

export function physicalOwnerVolume(owner) {
  const config = restorePhysicalPyramidOwner(owner);
  const { domain, pitch } = config;
  return (
    ((domain.maxX - domain.minX) / pitch) *
    ((domain.maxY - domain.minY) / pitch) *
    physicalPyramidSlabCellVolume(config)
  );
}

export function rejectUnimplementedPhysicalProcess(owner, operation) {
  restorePhysicalPyramidOwner(owner);
  throw new RangeError('Physical pyramid owner does not support Process operation: ' + operation);
}
