// Read-only bridge from physical exposed-material topology to exact release surfaces.
// No Process mutation, project migration, or visual-only replacement occurs here.
import { exposedSurfaceGroups } from './process-topology.js';
import { createContinuousEtchFront } from './continuous-etch-geometry.js';

export function planContinuousEtchFromTopology({
  model,
  face,
  clip = model?.boundary,
  targetLayerIds,
  lateralUm,
  verticalUm,
  shape = 'circular',
}) {
  if (
    model?.kernel !== 'vector-2.5d-v1' ||
    !Array.isArray(model.regions) ||
    !Array.isArray(model.layers) ||
    model.array != null
  ) {
    throw new RangeError('Continuous etch requires a canonical non-array vector Model');
  }
  if (face !== 'front' && face !== 'back') {
    throw new RangeError('Continuous etch requires Front or Back');
  }
  const layers = new Set(model.layers.map((item) => item.id));
  if (
    !Array.isArray(targetLayerIds) ||
    !targetLayerIds.length ||
    targetLayerIds.some((id) => typeof id !== 'string' || !layers.has(id))
  ) {
    throw new RangeError('Continuous etch targets must be valid existing material layers');
  }
  if (!Array.isArray(clip) || !clip.length) {
    throw new RangeError('Continuous etch requires a nonempty physical mask');
  }
  const selected = [...new Set(targetLayerIds)];
  const patches = exposedSurfaceGroups(model, {
    face,
    clip,
    preserveOppositeZ: false,
  }).filter((patch) => selected.includes(patch.layerId));
  if (!patches.length) {
    throw new RangeError('No physically exposed target material inside selected mask');
  }
  const fronts = patches.map((patch) => {
    if (patch.appearance?.kind === 'rough') {
      throw new RangeError('Display-only rough surfaces cannot seed physical continuous etch');
    }
    return createContinuousEtchFront({
      seedGeom: patch.geom,
      seedZ: patch.z,
      face,
      layerId: patch.layerId,
      lateralUm,
      verticalUm,
      shape,
    });
  });
  return {
    kind: 'canonical-exposed-continuous-etch-plan-v1',
    modelRevision: model.revision,
    targetLayerIds: selected,
    face,
    fronts,
    mutatesModel: false,
  };
}
