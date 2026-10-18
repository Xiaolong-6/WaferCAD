// Opt-in persisted physical Si owner contract (#297).
// Production drawing still does not understand this surface; that path fails closed.
import { makePhysicalPyramidOwner, restorePhysicalPyramidOwner } from './physical-facet-owner.js';
import { makePhysicalFacetShell, restorePhysicalFacetShell } from './physical-facet-shell-owner.js';
import { validateMaterialThicknessUm } from './process-numerical-contract.js';

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
  const explicitFilmLayer =
    Object.hasOwn(model, SHELL_FIELD) && model.layers?.length === 2 ? model.layers[1] : null;
  if (
    model.layers?.[0]?.id !== 'base' ||
    (model.layers?.length !== 1 && !explicitFilmLayer) ||
    model.regions?.length !== 1
  ) {
    fail('only one Base owner and an optional registered SiO2 shell are supported');
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
    if (
      explicitFilmLayer &&
      (explicitFilmLayer.id !== shell.layerId ||
        explicitFilmLayer.name !== 'SiO2' ||
        explicitFilmLayer.visible !== true)
    ) {
      fail('registered SiO2 material must correspond to the exact physical shell');
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

// A deliberately restricted laboratory Process path: an unmasked, full
// exterior, two-sided SiO2 film on a pristine physical silicon owner.
// Normal production vector/2.5D operations are never routed here.
export function applyExperimentalPhysicalFacetConformal(model, params) {
  const silicon = validateExperimentalPhysicalFacetModel(model);
  if (!silicon) return null;
  if (
    params?.type !== 'add' ||
    params?.growth !== 'conformal' ||
    params?.face !== 'both' ||
    params?.name !== 'SiO2' ||
    params?.targetLayerId != null ||
    params?.surface != null ||
    Object.hasOwn(model, SHELL_FIELD) ||
    JSON.stringify(params?.area) !== JSON.stringify(model.boundary)
  ) {
    return {
      changed: false,
      error:
        'Experimental physical facet supports only one full-domain Both-face SiO2 Conformal Add.',
    };
  }
  const thicknessUm = Number(params.thickness);
  const thicknessError = validateMaterialThicknessUm(thicknessUm, 'SiO2 film thickness');
  if (thicknessError) return { changed: false, error: thicknessError };
  // Both chemistry and scientific ranges must validate before touching the
  // source object. Commit all descriptor, material, and revision changes once.
  let candidate;
  try {
    candidate = structuredClone(model);
    const ordinal = candidate.nextLayerId;
    if (!Number.isSafeInteger(ordinal) || ordinal < 1)
      throw new RangeError('Invalid Layer allocation');
    const layerId = 'layer-' + ordinal;
    candidate[SHELL_FIELD] = makePhysicalFacetShell({
      silicon,
      layerId,
      thicknessUm,
    });
    candidate.layers.push({
      id: layerId,
      name: 'SiO2',
      color: /^#[0-9a-f]{6}$/i.test(params.color || '') ? params.color : '#d88b37',
      visible: true,
    });
    candidate.nextLayerId++;
    candidate.revision = (candidate.revision || 0) + 1;
    candidate.processRevision = (candidate.processRevision || 0) + 1;
    validateExperimentalPhysicalFacetModel(candidate);
    for (const key of Object.keys(model)) delete model[key];
    Object.assign(model, candidate);
    return { changed: true, layerId };
  } catch (error) {
    return { changed: false, error: 'Experimental SiO2 Conformal rejected: ' + error.message };
  }
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
