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
  { maxStepUm = 0.35, maxPoints = 4096, maxChordErrorUm = 0.05 } = {},
) {
  if (model?.kernel !== 'vector-continuous-etch-v1')
    throw new RangeError('Continuous Section requires dedicated model kernel');
  if (
    !(Number.isFinite(maxStepUm) && maxStepUm > 0) ||
    !(Number.isFinite(maxChordErrorUm) && maxChordErrorUm > 0) ||
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
      // A uniform XY step alone misses the near-vertical shoulder of a
      // circular/elliptical front. Refine ONLY the derived Section polyline
      // where an exact midpoint differs from its linear chord. The physical
      // owner, saved material and 3D mesh remain completely unchanged.
      const sample = (t, interior = t) => {
        const columns = new Map();
        const ordinalByLayer = new Map();
        for (const { layerId, z0, z1 } of continuousOwnerColumnAtXY(owner, at(interior))) {
          if (!layers.get(layerId)) continue;
          const ordinal = ordinalByLayer.get(layerId) || 0;
          ordinalByLayer.set(layerId, ordinal + 1);
          columns.set(layerId + ':' + ordinal, { layerId, z0, z1 });
        }
        return { t, columns };
      };
      const sampleAtIndex = (index) => {
        const t = t0 + ((t1 - t0) * index) / count;
        const interior =
          index === 0 ? t0 + (t1 - t0) * 1e-9 : index === count ? t1 - (t1 - t0) * 1e-9 : t;
        return sample(t, interior);
      };
      const chordError = (left, middle, right) => {
        if (
          left.columns.size !== right.columns.size ||
          middle.columns.size !== left.columns.size ||
          [...left.columns.keys()].some(
            (key) => !right.columns.has(key) || !middle.columns.has(key),
          )
        ) {
          // A material interval can appear/disappear within one initial
          // segment. Resolve its boundary rather than connecting a false span.
          return Infinity;
        }
        let error = 0;
        for (const [key, start] of left.columns) {
          const mid = middle.columns.get(key),
            end = right.columns.get(key);
          error = Math.max(
            error,
            Math.abs(mid.z0 - (start.z0 + end.z0) / 2),
            Math.abs(mid.z1 - (start.z1 + end.z1) / 2),
          );
        }
        return error;
      };
      const samples = [sampleAtIndex(0)];
      for (let index = 0; index < count; index++) {
        const left = samples.at(-1),
          right = sampleAtIndex(index + 1);
        const pending = [{ left, right, depth: 0 }];
        while (pending.length) {
          const segment = pending.pop();
          const midpoint = sample((segment.left.t + segment.right.t) / 2);
          const error = chordError(segment.left, midpoint, segment.right);
          const widthUm = (segment.right.t - segment.left.t) * length;
          // Sharp topology changes are localized to 0.01 um; smooth curved
          // boundaries are refined until the requested physical chord error.
          const refine = error === Infinity ? widthUm > 0.01 : error > maxChordErrorUm;
          if (refine) {
            if (samples.length + pending.length + 2 >= maxPoints)
              throw new RangeError('Continuous Section exceeded adaptive display point budget');
            if (segment.depth >= 20)
              throw new RangeError('Continuous Section cannot resolve curved material boundary');
            pending.push({ left: midpoint, right: segment.right, depth: segment.depth + 1 });
            pending.push({ left: segment.left, right: midpoint, depth: segment.depth + 1 });
          } else {
            samples.push(segment.right);
          }
        }
      }
      const active = new Map();
      for (const { t, columns } of samples) {
        for (const [key, { layerId, z0, z1 }] of columns) {
          if (!active.has(key)) active.set(key, { layerId, points: [] });
          active.get(key).points.push({ t, z0, z1 });
        }
        for (const [key, ribbon] of active) {
          if (columns.has(key)) continue;
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
