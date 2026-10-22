// Transactional adapter between the Process worker and the dedicated analytic
// continuous-material kernel. No 2.5D step bands or display geometry are stored.
import { attachContinuousEtchModel } from './continuous-etch-model.js';

export function applyContinuousRelease(model, params, area) {
  if (params?.type !== 'etch' || params.etchProfile !== 'continuous')
    throw new RangeError('Expected a Continuous Etch operation');
  if (params.face !== 'front' && params.face !== 'back')
    throw new RangeError('Continuous release supports Front or Back only');
  if (model?.kernel !== 'vector-2.5d-v1' || model.array != null)
    throw new RangeError('Continuous release requires an ordinary 2.5D predecessor');
  if (params.surface || params.faceSurfaces)
    throw new RangeError('Continuous physical release cannot use display-only rough morphology');
  if (!Array.isArray(params.etchTargetLayerIds) || params.etchTargetLayerIds.length !== 1)
    throw new RangeError('Choose exactly one exposed target material for Continuous Etch');
  const verticalUm = params.thickness;
  const shape = params.continuousShape;
  const lateralUm = shape === 'circular' ? verticalUm : params.continuousLateralUm;
  if (
    !Number.isFinite(verticalUm) ||
    verticalUm <= 0 ||
    !Number.isFinite(lateralUm) ||
    lateralUm <= 0
  )
    throw new RangeError('Continuous release lengths must be positive physical micrometres');
  if (!['circular', 'elliptical', 'vertical'].includes(shape))
    throw new RangeError('Unsupported Continuous Etch front shape');
  const nextModel = attachContinuousEtchModel(model, {
    face: params.face,
    clip: area,
    targetLayerIds: params.etchTargetLayerIds,
    lateralUm,
    verticalUm,
    shape,
  });
  return { model: nextModel, result: { changed: true, continuousEtch: true } };
}
