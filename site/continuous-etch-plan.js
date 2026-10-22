// Read-only Main projection of the exact continuous material owner.
// Sampling is presentation-only: XY/Z columns are never persisted or reused by Process.
import { validateContinuousEtchModel } from './continuous-etch-model.js';
import { continuousOwnerColumnAtXY } from './continuous-material-owner.js';

export function createContinuousPlanSampler(model, face = 'front') {
  if (face !== 'front' && face !== 'back') throw new RangeError('Invalid Main projection face');
  const owner = validateContinuousEtchModel(model);
  if (!owner) throw new RangeError('Continuous Main requires an exact continuous model');
  const visible = new Set(model.layers.filter((layer) => layer.visible !== false).map((l) => l.id));
  return (xy) => {
    const columns = continuousOwnerColumnAtXY(owner, xy);
    const segments = columns.filter((part) => visible.has(part.layerId));
    if (!segments.length) return null;
    const exposed = face === 'front' ? segments.at(-1) : segments[0];
    return { layerId: exposed.layerId, z: face === 'front' ? exposed.z1 : exposed.z0 };
  };
}
