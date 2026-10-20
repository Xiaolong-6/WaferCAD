// Physical Section polygons are sampled from the canonical continuous
// material owner. Sampling affects display only, never the stored solid.
import { lineIntervalsInMulti, unionGeometries } from './vector-geometry.js';
import {
  restoreContinuousMaterialOwner,
  continuousOwnerColumnAtXY,
} from './continuous-material-owner.js';

function finishRibbon(points, polygons) {
  if (points.length < 2) return;
  const top = points.map(({ t, z1 }) => [t, z1]);
  const bottom = points.toReversed().map(({ t, z0 }) => [t, z0]);
  const ring = [...top, ...bottom, [...top[0]]];
  if (ring.length >= 5) polygons.push([ring]);
}

// Output normalized t/Z polygons consumed by production sectionContours.
export function continuousSectionContours(
  model,
  a,
  b,
  { maxStepUm = 0.35, maxPoints = 4096 } = {},
) {
  if (model?.kernel !== 'vector-continuous-etch-v1')
    throw new RangeError('Continuous Section requires dedicated model kernel');
  if (
    !(Number.isFinite(maxStepUm) && maxStepUm > 0) ||
    !Number.isSafeInteger(maxPoints) ||
    maxPoints < 2 ||
    maxPoints > 16384
  )
    throw new RangeError('Invalid continuous Section display sampling budget');
  if (a?.length !== 2 || b?.length !== 2 || ![...a, ...b].every(Number.isFinite))
    throw new RangeError('Invalid physical Section endpoints');
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > 0)) return [];
  const owner = restoreContinuousMaterialOwner(model.continuousEtchOwner);
  const layers = new Map(model.layers.map((layer) => [layer.id, layer.visible !== false]));
  const byLayer = new Map();
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const append = ({ layerId, points }) => {
    if (!byLayer.has(layerId)) byLayer.set(layerId, []);
    finishRibbon(points, byLayer.get(layerId));
  };
  for (const region of owner.sourceModel.regions) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, region.geom)) {
      if (!(t1 > t0)) continue;
      const count = Math.max(2, Math.min(maxPoints, Math.ceil(((t1 - t0) * length) / maxStepUm)));
      const active = new Map();
      for (let index = 0; index <= count; index++) {
        const t = t0 + ((t1 - t0) * index) / count;
        const interior =
          index === 0 ? t0 + (t1 - t0) * 1e-9 : index === count ? t1 - (t1 - t0) * 1e-9 : t;
        const ordinalByLayer = new Map();
        const present = new Set();
        for (const { layerId, z0, z1 } of continuousOwnerColumnAtXY(owner, at(interior))) {
          if (!layers.get(layerId)) continue;
          const ordinal = ordinalByLayer.get(layerId) || 0;
          ordinalByLayer.set(layerId, ordinal + 1);
          const key = layerId + ':' + ordinal;
          present.add(key);
          if (!active.has(key)) active.set(key, { layerId, points: [] });
          active.get(key).points.push({ t, z0, z1 });
        }
        for (const [key, ribbon] of active) {
          if (present.has(key)) continue;
          append(ribbon);
          active.delete(key);
        }
      }
      for (const ribbon of active.values()) append(ribbon);
    }
  }
  // Union adjoining cells so old 2.5D bookkeeping edges never become
  // artificial dark borders on the final continuous Si material.
  return [...byLayer]
    .map(([layerId, polys]) => ({ layerId, polys: unionGeometries([polys]) }))
    .filter((item) => item.polys.length);
}
