// A serializable scientific owner for a single continuous release operation.
// This is deliberately separate from the legacy 2.5D Model until all native
// Process/Section/3D consumers can interpret it without replacing exact solids
// with sampled stair steps. No live Model or History state is mutated.
import { continuousMaterialColumn } from './continuous-etch-geometry.js';
import { planContinuousEtchFromTopology } from './continuous-etch-topology.js';

const OWNER_KIND = 'wafercad-continuous-material-owner-v1';
const authorizedOwners = new WeakSet();

function deeplyFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deeplyFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareFronts(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function authorizeOwner(data) {
  if (!data || data.kind !== OWNER_KIND || !data.sourceModel || !data.operation)
    throw new RangeError('Unrecognized continuous material owner');
  const { modelRevision, sourceModel, operation, fronts } = data;
  if (!Number.isSafeInteger(modelRevision) || modelRevision !== sourceModel.revision)
    throw new RangeError('Continuous material owner source revision mismatch');
  if (operation.shape == null || operation.face == null || operation.clip == null)
    throw new RangeError('Incomplete continuous release operation');
  // Reconstruct the exposed seed from the actual stored source geometry, not
  // from caller-supplied arbitrary serialized fronts or a coincident revision.
  const plan = planContinuousEtchFromTopology({ model: sourceModel, ...operation });
  if (!compareFronts(plan.fronts, fronts))
    throw new RangeError('Continuous release front disagrees with source topology');
  deeplyFreeze(data);
  authorizedOwners.add(data);
  return data;
}

export function createContinuousMaterialOwner(model, options) {
  const sourceModel = structuredClone(model);
  const operation = structuredClone({ ...options, clip: options?.clip ?? model.boundary });
  const plan = planContinuousEtchFromTopology({ model: sourceModel, ...operation });
  return authorizeOwner({
    kind: OWNER_KIND,
    modelRevision: sourceModel.revision,
    sourceModel,
    operation,
    fronts: plan.fronts,
  });
}

// Restoring a saved scientific owner requires re-deriving all seed footprints.
// JSON round-trip is lossless; no N-band discretization is stored or reconstructed.
export function restoreContinuousMaterialOwner(saved) {
  return authorizeOwner(structuredClone(saved));
}

export function continuousOwnerColumnAtXY(owner, point) {
  if (!authorizedOwners.has(owner))
    throw new RangeError('Continuous material owner must be validated or restored first');
  return continuousMaterialColumn(owner.sourceModel, owner.fronts, point);
}

export function continuousOwnerMaterialAt(owner, point) {
  const [x, y, z] = point;
  if (!Number.isFinite(z)) throw new RangeError('Query Z must be finite');
  return (
    continuousOwnerColumnAtXY(owner, [x, y]).find(({ z0, z1 }) => z >= z0 && z < z1)?.layerId ??
    null
  );
}
