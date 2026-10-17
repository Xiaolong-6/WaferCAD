// Opt-in persisted physical Si owner contract (#297).
// Production drawing still does not understand this surface; that path fails closed.
import { makePhysicalPyramidOwner, restorePhysicalPyramidOwner } from './physical-facet-owner.js';
import { makePhysicalFacetShell, restorePhysicalFacetShell } from './physical-facet-shell-owner.js';

export const PHYSICAL_FACET_MODEL_KERNEL = 'vector-physical-facet-experimental-v1';
const FIELD = 'experimentalPhysicalFacetOwner';
const SHELL_FIELD = 'experimentalPhysicalFacetShell';

function fail(reason) {
  throw new RangeError('Experimental physical facet: ' + reason);
}

export function validateExperimentalPhysicalFacetModel(model) {
  if (!model) return null;
  if (!Object.hasOwn(model, FIELD)) {
    if (model.kernel === PHYSICAL_FACET_MODEL_KERNEL || Object.hasOwn(model, SHELL_FIELD)) {
      fail('physical model is missing its owner descriptor');
    }
    return null;
  }
  if (
    model.kernel !== PHYSICAL_FACET_MODEL_KERNEL ||
    model.shape !== 'rect' ||
    model.array != null
  ) {
    fail('requires a single rectangular vector model');
  }
  let owner;
  try {
    owner = restorePhysicalPyramidOwner(model[FIELD]);
  } catch (error) {
    fail(error.message);
  }
  if (JSON.stringify(owner) !== JSON.stringify(model[FIELD])) {
    fail('owner descriptor is not canonical versioned JSON');
  }
  if (owner.layerId !== 'base') fail('only the Base silicon material is supported');
  if (model.layers?.length !== 1 || model.layers[0]?.id !== 'base' || model.regions?.length !== 1) {
    fail('only one Base layer and one Base region are supported');
  }
  const region = model.regions[0];
  const segment = region.stack?.[0];
  if (
    region.stack?.length !== 1 ||
    segment?.layerId !== 'base' ||
    segment.frontSurface != null ||
    segment.backSurface != null ||
    (model.implants || []).length !== 0 ||
    (model.electricalRegions || []).length !== 0
  ) {
    fail('multilayer, appearance roughness and annotations are not supported');
  }
  if (JSON.stringify(region.geom) !== JSON.stringify(model.boundary)) {
    fail('one Base region must exactly cover the rectangular boundary');
  }
  const d = owner.domain;
  const corners = [
    [d.minX, d.minY],
    [d.minX, d.maxY],
    [d.maxX, d.minY],
    [d.maxX, d.maxY],
  ];
  const rings = model.boundary;
  const ring = rings?.length === 1 && rings[0]?.length === 1 ? rings[0][0] : null;
  if (
    !ring ||
    ring.length !== 5 ||
    JSON.stringify(ring[0]) !== JSON.stringify(ring[4]) ||
    !corners.every(([x, y]) => ring.slice(0, -1).some((p) => p[0] === x && p[1] === y))
  ) {
    fail('material boundary must be exactly the physical owner rectangle');
  }
  if (
    d.maxX - d.minX !== model.width ||
    d.maxY - d.minY !== model.height ||
    segment.z0 !== owner.bottomPlaneZ ||
    segment.z1 !== owner.topPlaneZ ||
    model.thickness !== owner.topPlaneZ - owner.bottomPlaneZ
  ) {
    fail('material domain and planar reference planes must match the Base');
  }
  const cells = ((d.maxX - d.minX) * (d.maxY - d.minY)) / (owner.pitch * owner.pitch);
  if (!Number.isFinite(cells) || cells > 256) {
    fail('opt-in mesh exceeds the 256-cell scientific preview budget');
  }
  if (Object.hasOwn(model, SHELL_FIELD)) {
    let shell;
    try {
      shell = restorePhysicalFacetShell(model[SHELL_FIELD]);
    } catch (error) {
      fail('invalid complete implicit shell: ' + error.message);
    }
    if (JSON.stringify(shell.silicon) !== JSON.stringify(owner)) {
      fail('the coating and silicon descriptors must refer to one identical physical owner');
    }
  }
  return owner;
}

export function attachExperimentalPhysicalFacetOwner(model, descriptor) {
  if (model?.[FIELD] != null) fail('existing physical owner cannot be overwritten');
  const owner = makePhysicalPyramidOwner(descriptor);
  const copy = structuredClone(model);
  copy.kernel = PHYSICAL_FACET_MODEL_KERNEL;
  copy[FIELD] = owner;
  validateExperimentalPhysicalFacetModel(copy);
  copy.revision = (Number(copy.revision) || 0) + 1;
  return copy;
}

// Laboratory ownership is persisted, but production multi-material
// mesh/rendering remains fail-closed until that scientific gate passes.
export function attachExperimentalPhysicalFacetShell(model, options) {
  const silicon = validateExperimentalPhysicalFacetModel(model);
  if (!silicon) fail('coating requires a canonical experimental silicon owner');
  if (Object.hasOwn(model, SHELL_FIELD)) fail('an experimental exterior shell already exists');
  const shell = makePhysicalFacetShell({ silicon, ...options });
  const copy = structuredClone(model);
  copy[SHELL_FIELD] = shell;
  copy.revision = (Number(copy.revision) || 0) + 1;
  validateExperimentalPhysicalFacetModel(copy);
  return copy;
}

export function assertExperimentalPhysicalFacetNotRendered(model) {
  if (model?.[FIELD] != null || model?.kernel === PHYSICAL_FACET_MODEL_KERNEL) {
    fail('production Section/3D lacks physical-facet support; refusing flat surrogate');
  }
}

export function assertExperimentalPhysicalFacetNotProcessed(model) {
  if (model?.[FIELD] != null || model?.kernel === PHYSICAL_FACET_MODEL_KERNEL) {
    return {
      changed: false,
      error:
        'Experimental physical facet has no production Process integration; operation rejected without mutation.',
    };
  }
  return null;
}
