// Opt-in canonical model wrapper for a continuous etch. Native consumers must
// explicitly accept this kernel; the legacy 2.5D regions are a protected
// pre-operation reference and MUST NOT be used as the resulting solid.
import {
  createContinuousMaterialOwner,
  restoreContinuousMaterialOwner,
  continuousOwnerColumnAtXY,
  continuousOwnerMaterialAt,
} from './continuous-material-owner.js';

export const CONTINUOUS_ETCH_MODEL_KERNEL = 'vector-continuous-etch-v1';
const FIELD = 'continuousEtchOwner';
export function validateContinuousEtchModel(model) {
  if (!model || typeof model !== 'object') return null;
  const hasOwner = Object.hasOwn(model, FIELD);
  if (!hasOwner && model.kernel !== CONTINUOUS_ETCH_MODEL_KERNEL) return null;
  if (model.kernel !== CONTINUOUS_ETCH_MODEL_KERNEL || !hasOwner || model.array != null)
    throw new RangeError('Continuous etch requires a complete dedicated non-array model kernel');
  const owner = restoreContinuousMaterialOwner(model[FIELD]);
  if (owner.sourceModel.kernel !== 'vector-2.5d-v1')
    throw new RangeError('Continuous etch predecessor must use canonical 2.5D source topology');
  if (
    model.revision !== owner.sourceModel.revision + 1 ||
    model.processRevision !== owner.sourceModel.processRevision + 1
  )
    throw new RangeError('Continuous etch revision must represent exactly one release operation');
  // A release may change only its kernel identity, process revision and
  // analytic owner. All other predecessor fields, including future physical
  // extensions, must remain byte-equivalent. A fixed whitelist would silently
  // accept modifications to a newly introduced material field.
  const originalKeys = Object.keys(owner.sourceModel).sort();
  const resultKeys = Object.keys(model)
    .filter((key) => key !== FIELD)
    .sort();
  if (JSON.stringify(originalKeys) !== JSON.stringify(resultKeys))
    throw new RangeError('Continuous etch result contains an unexpected physical field');
  for (const key of originalKeys) {
    if (key === 'kernel' || key === 'revision' || key === 'processRevision') continue;
    if (JSON.stringify(model[key]) !== JSON.stringify(owner.sourceModel[key]))
      throw new RangeError('Continuous etch reference material changed: ' + key);
  }
  return owner;
}

export function attachContinuousEtchModel(model, operation) {
  if (model?.kernel !== 'vector-2.5d-v1' || model.array != null)
    throw new RangeError('Continuous etch requires an ordinary canonical predecessor');
  const owner = createContinuousMaterialOwner(model, operation);
  const result = structuredClone(model);
  result.kernel = CONTINUOUS_ETCH_MODEL_KERNEL;
  result[FIELD] = structuredClone(owner);
  result.revision++;
  result.processRevision++;
  validateContinuousEtchModel(result);
  return result;
}

export function continuousModelColumnAtXY(model, point) {
  const owner = validateContinuousEtchModel(model);
  if (!owner) throw new RangeError('This Model does not contain continuous etch material');
  return continuousOwnerColumnAtXY(owner, point);
}

export function continuousModelMaterialAt(model, point) {
  const owner = validateContinuousEtchModel(model);
  if (!owner) throw new RangeError('This Model does not contain continuous etch material');
  return continuousOwnerMaterialAt(owner, point);
}

export function assertContinuousEtchNotRendered(model) {
  if (model?.kernel === CONTINUOUS_ETCH_MODEL_KERNEL || model?.[FIELD] != null)
    throw new RangeError(
      'Continuous Etch model requires native Section/3D support; refusing flat material surrogate',
    );
}

export function assertContinuousEtchNotProcessed(model) {
  if (model?.kernel === CONTINUOUS_ETCH_MODEL_KERNEL || model?.[FIELD] != null)
    return {
      changed: false,
      error: 'Follow-on Process on continuous material is not yet supported; Model unchanged.',
    };
  return null;
}

// The generic Workstation enables Z Break by default. Its default collapse
// range can span the entire physical release, visually flattening real Si.
// Keep canonical continuous material fully expanded until the user explicitly
// opts into a continuous-owner-specific display collapse.
export function continuousEtchDisplayCollapse(model, requested) {
  return model?.kernel === CONTINUOUS_ETCH_MODEL_KERNEL &&
    requested?.continuousEtchExplicit !== true
    ? { enabled: false }
    : requested;
}
