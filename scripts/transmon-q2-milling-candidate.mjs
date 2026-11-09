import { loadGeometryKernel } from './process-benchmarks.mjs';

const OXIDE = 'AlOx (illustrative thickness)';
const EPS = 1e-8;

// Diagnostic assumption: remove up to depthUm from horizontal AlOx surfaces
// that the given rays can reach. Reuse the line-of-sight query from horizontal
// Direct deposition without creating a material layer.
export async function millQ2OxideCandidate(source, { tiltDeg, azimuths, depthUm }) {
  if (!(Number.isFinite(tiltDeg) && tiltDeg >= 0 && tiltDeg < 89))
    throw new RangeError('Supply an ion tilt within 0–<89 degrees.');
  if (!(Number.isFinite(depthUm) && depthUm >= 0.0001 && depthUm < 0.01))
    throw new RangeError('Supply an explicit oxide removal depth within 0.1–<10 nm.');
  if (!Array.isArray(azimuths) || !azimuths.length || azimuths.some((a) => !Number.isFinite(a)))
    throw new RangeError('Supply at least one finite GDS-frame ion azimuth.');
  await loadGeometryKernel();
  const { geometryArea, normalizeStack } = await import('../site/model.js');
  const { materialDirectHorizontalExposure } =
    await import('../site/material-direct-deposition.js');
  const { validateProcessModel } = await import('../site/project-schema.js');
  const { difference, intersection, materialGeometryArea, unionMaterialSweeps } =
    await import('../site/material-process-boolean.js');
  const { materialOwnerCoverage, partitionMaterialProcess } =
    await import('../site/material-process-partition.js');
  validateProcessModel(source);
  const oxideId = source.layers.find(({ name }) => name === OXIDE)?.id;
  if (source.array || !oxideId)
    throw new Error('Expected a flat local checkpoint with illustrative AlOx.');

  const oxideHeights = new Set();
  const oxideCaps = unionMaterialSweeps(
    source.regions.flatMap(({ geom, stack }) => {
      const caps = stack.filter(
        (s, i) => s.layerId === oxideId && (!stack[i + 1] || stack[i + 1].z0 - s.z1 > EPS),
      );
      for (const cap of caps) oxideHeights.add(cap.z1.toFixed(8));
      return caps.length ? [geom] : [];
    }),
  );
  const witnessedByHeight = new Map();
  for (const azimuthDeg of azimuths) {
    if (!oxideCaps.length) break;
    const patches = materialDirectHorizontalExposure(source, { tiltDeg, azimuthDeg }, oxideCaps, {
      geometryArea,
      assertInputPartition: validateProcessModel,
    });
    for (const { z, geom } of patches) {
      const height = z.toFixed(8);
      if (!oxideHeights.has(height)) continue;
      if (!witnessedByHeight.has(height)) witnessedByHeight.set(height, []);
      witnessedByHeight.get(height).push(geom);
    }
  }

  const model = structuredClone(source);
  let removedVolumeUm3 = 0;
  for (const [height, masks] of witnessedByHeight) {
    const exposed = unionMaterialSweeps(masks);
    model.regions = model.regions.flatMap((region) => {
      const index = region.stack.findIndex(
        (s, i) =>
          s.layerId === oxideId &&
          s.z1.toFixed(8) === height &&
          (!region.stack[i + 1] || region.stack[i + 1].z0 - s.z1 > EPS),
      );
      if (index < 0) return [region];
      const hit = intersection(region.geom, exposed);
      if (!hit.length) return [region];
      const stack = [...region.stack];
      const oxide = stack[index];
      const removed = Math.min(oxide.z1 - oxide.z0, depthUm);
      removedVolumeUm3 += materialGeometryArea(hit) * removed;
      if (oxide.z1 - oxide.z0 - removed > EPS) stack[index] = { ...oxide, z1: oxide.z1 - removed };
      else stack.splice(index, 1);
      const rest = difference(region.geom, hit);
      const cleaned = {
        id: `region-${model.nextRegionId++}`,
        geom: hit,
        stack: normalizeStack(stack),
      };
      return rest.length ? [{ ...region, geom: rest }, cleaned] : [cleaned];
    });
  }
  if (removedVolumeUm3 > 0) {
    model.regions = partitionMaterialProcess(model, materialOwnerCoverage(source));
    model.revision++;
    model.processRevision++;
    validateProcessModel(model);
  }
  return { model, removedVolumeUm3, exposedHeights: witnessedByHeight.size };
}
