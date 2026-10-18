// #298/#327: derive isotropic release seeds from the actual canonical
// exposed-material topology. This is a pure inspection/planning adapter;
// it never mutates Model, Process, variants, snapshots or History.
import { exposedSurfaceGroups } from './process-topology.js';
import { planSelectiveIsotropicRelease } from './isotropic-release-oracle.js';

export function planTopologySelectiveIsotropicRelease({
  model,
  face,
  clip = model?.boundary,
  targetLayerIds,
  radius,
  maxLateralErrorUm,
  maxBands = 128,
}) {
  if (
    model?.kernel !== 'vector-2.5d-v1' ||
    !Array.isArray(model.regions) ||
    !Array.isArray(model.layers) ||
    model.array != null
  ) {
    throw new RangeError('Topology release planning requires a canonical non-array vector Model');
  }
  if (face !== 'front' && face !== 'back') {
    throw new RangeError('Only one physical Front or Back face can be planned at a time');
  }
  const validLayers = new Set(model.layers.map((layer) => layer.id));
  if (
    !Array.isArray(targetLayerIds) ||
    !targetLayerIds.length ||
    targetLayerIds.some((id) => typeof id !== 'string' || !validLayers.has(id))
  ) {
    throw new RangeError('Selected release targets must be existing Model layer IDs');
  }
  const selected = [...new Set(targetLayerIds)];
  if (!Array.isArray(clip) || !clip.length) {
    throw new RangeError('A nonempty physical exposed-mask clip is required');
  }
  const exposed = exposedSurfaceGroups(model, {
    face,
    clip,
    preserveOppositeZ: false,
  });
  const candidates = exposed.filter((patch) => selected.includes(patch.layerId));
  if (!candidates.length) {
    throw new RangeError('Selected release material has no physically exposed seed under the mask');
  }
  const plans = [];
  for (const patch of candidates) {
    if (patch.appearance?.kind === 'rough') {
      throw new RangeError('Rough appearance cannot establish physical isotropic seed topology');
    }
    const plan = planSelectiveIsotropicRelease({
      seedLayerId: patch.layerId,
      seedZ: patch.z,
      face,
      targetLayerIds: selected,
      radius,
      maxLateralErrorUm,
      maxBands,
      isExposed: true, // Derived from exposedSurfaceGroups above, never caller-supplied.
    });
    plans.push({
      ...plan,
      sourceKind: 'canonical-exposed-surface',
      // Preserve the entire real material/mask topology, including holes and
      // separate connected components; do not invent a circular seed.
      seedGeom: structuredClone(patch.geom),
    });
  }
  return {
    kind: 'wafercad-exposed-topology-isotropic-plan-v1',
    modelRevision: model.revision,
    face,
    selectedLayerIds: selected,
    seedPlans: plans,
    // The physical XY Boolean dilation/undercut and material removal are
    // deliberately NOT performed here. They require a separate contract.
    mutatesModel: false,
  };
}
