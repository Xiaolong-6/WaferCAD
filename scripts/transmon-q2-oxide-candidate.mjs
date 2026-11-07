import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { loadGeometryKernel } from './process-benchmarks.mjs';

// Q2 research checkpoint, after the existing horizontal oxide deposition.
// A slab's free XY space is a geometric exposure assumption. It does not
// compute oxide consumption, gas access to sealed voids, or reaction kinetics.
export async function addQ2WallOxideCandidate(source, thicknessUm, { roundCapRim = false } = {}) {
  if (!Number.isFinite(thicknessUm) || thicknessUm < 0.0001 || thicknessUm >= 0.01)
    throw new RangeError('Supply an explicit wall oxide thickness within 0.1–<10 nm.');
  await loadGeometryKernel();
  const { difference, intersection, offsetMaterialOpening, unionMaterialSweeps } =
    await import('../site/material-process-boolean.js');
  const { partitionMaterialProcess } = await import('../site/material-process-partition.js');
  const { normalizeStack } = await import('../site/model.js');
  const { validateProcessModel } = await import('../site/project-schema.js');
  validateProcessModel(source);
  const model = structuredClone(source);
  const materialId = (name) => model.layers.find((layer) => layer.name === name)?.id;
  const aluminum = materialId('Al1');
  const oxide = materialId('AlOx (illustrative thickness)');
  if (
    model.array ||
    !aluminum ||
    !oxide ||
    !materialId('MMA') ||
    !materialId('PMMA') ||
    materialId('Al2')
  )
    throw new Error('Expected a flat Q2 checkpoint after horizontal AlOx and before Al2.');

  const owners = model.regions.filter(({ stack }) =>
    stack.some(({ layerId }) => layerId === aluminum),
  );
  const intervals = owners.flatMap(({ stack }) => stack.filter((s) => s.layerId === aluminum));
  if (!intervals.length) throw new Error('The checkpoint contains no Al1 material.');
  const minZ = Math.min(...intervals.map(({ z0 }) => z0));
  const maxZ = Math.max(...intervals.map(({ z1 }) => z1));
  const levels = [
    ...new Set(
      model.regions.flatMap(({ stack }) =>
        stack.flatMap(({ z0, z1 }) => [z0, z1]).filter((z) => z >= minZ && z <= maxZ),
      ),
    ),
  ].sort((a, b) => a - b);
  const patches = [];
  for (let i = 1; i < levels.length; i++) {
    const z0 = levels[i - 1];
    const z1 = levels[i];
    if (z1 - z0 < 1e-8) continue;
    const inSlab = (s) => s.z0 <= z0 + 1e-8 && s.z1 >= z1 - 1e-8;
    const footprint = unionMaterialSweeps(
      owners
        .filter(({ stack }) => stack.some((s) => s.layerId === aluminum && inSlab(s)))
        .map(({ geom }) => geom),
    );
    if (!footprint.length) continue;
    const occupied = unionMaterialSweeps(
      model.regions.filter(({ stack }) => stack.some(inSlab)).map(({ geom }) => geom),
    );
    const geom = intersection(
      model.boundary,
      difference(offsetMaterialOpening(footprint, thicknessUm), occupied),
    );
    if (geom.length) patches.push({ geom, segment: { layerId: oxide, z0, z1 } });
  }
  if (!patches.length) throw new Error('There are no exposed Al1 sidewalls.');
  function addPatch(geom, segment) {
    model.regions = model.regions.flatMap((region) => {
      const hit = intersection(region.geom, geom);
      if (!hit.length) return [region];
      const rest = difference(region.geom, hit);
      const coated = {
        id: `region-${model.nextRegionId++}`,
        geom: hit,
        stack: normalizeStack([...region.stack, segment]),
      };
      return rest.length ? [{ ...region, geom: rest }, coated] : [coated];
    });
  }
  for (const { geom, segment } of patches) addPatch(geom, segment);
  if (roundCapRim) {
    const caps = new Map();
    for (const { geom, stack } of owners)
      for (let i = 1; i < stack.length; i++) {
        const [metal, cap] = [stack[i - 1], stack[i]];
        if (
          metal.layerId !== aluminum ||
          cap.layerId !== oxide ||
          Math.abs(metal.z1 - cap.z0) > 1e-8
        )
          continue;
        const key = cap.z0.toFixed(8);
        if (!caps.has(key)) caps.set(key, { z: cap.z0, geoms: [] });
        caps.get(key).geoms.push(geom);
      }
    // At an Al1 corner the rectangular cap and wall shells leave a diagonal
    // point contact possible. Fill free space within the assumed oxide
    // radius. Two inscribed bands retain a rounded transition at the lip.
    for (const { z, geoms } of caps.values()) {
      const capFootprint = unionMaterialSweeps(geoms);
      for (let i = 0; i < 2; i++) {
        const lower = (thicknessUm * i) / 3;
        const upper = (thicknessUm * (i + 1)) / 3;
        const z0 = z + lower;
        const z1 = z + upper;
        const radius = Math.sqrt(thicknessUm ** 2 - upper ** 2);
        const occupied = unionMaterialSweeps(
          model.regions
            .filter(({ stack }) => stack.some((s) => s.z0 < z1 - 1e-8 && s.z1 > z0 + 1e-8))
            .map(({ geom }) => geom),
        );
        const rim = intersection(
          model.boundary,
          difference(offsetMaterialOpening(capFootprint, radius), occupied),
        );
        if (rim.length) addPatch(rim, { layerId: oxide, z0, z1 });
      }
    }
  }
  model.regions = partitionMaterialProcess(model, model.boundary);
  validateProcessModel(model);
  return model;
}

async function preparePaddedQ2Al3Candidate(oxideThicknessUm, roundCapRim) {
  const { buildTransmonProcess } = await import('./build-transmon-process.mjs');
  const { applyOperation } = await import('../site/model.js');
  const checkpointReady = Symbol('horizontal oxide checkpoint ready');
  let source;
  try {
    await buildTransmonProcess({
      roi: { x: 1400, y: 2513, width: 48, height: 48 },
      oxideThicknessUm,
      mmaUndercutUm: 0.3,
      planetaryZeroDeg: 90,
      heightStepUm: 0.05,
      onStage(step, model) {
        if (step.step !== 17) return;
        source = model;
        throw checkpointReady;
      },
    });
  } catch (error) {
    if (error !== checkpointReady) throw error;
  }
  if (!source) throw new Error('The process did not produce the horizontal oxide checkpoint.');
  const model = await addQ2WallOxideCandidate(source, oxideThicknessUm, { roundCapRim });
  for (const [name, azimuthDeg] of [
    ['Al2', 135],
    ['Al3', 315],
  ]) {
    const outcome = applyOperation(model, {
      type: 'add',
      name,
      face: 'front',
      area: model.boundary,
      growth: 'direct',
      thickness: 0.03,
      incidence: {
        materialGeometry: true,
        tiltDeg: 45,
        azimuthDeg,
        sidewalls: true,
        heightStepUm: 0.05,
      },
    });
    if (!outcome.changed) throw new Error(outcome.error || `No material added during ${name}.`);
    console.log(JSON.stringify({ name, outcome }));
  }
  return model;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, thicknessNm] = process.argv.slice(2);
  if (!input || !output || !thicknessNm || resolve(input) === resolve(output))
    throw new Error(
      'Supply a stage-17 model.json.gz, --prepare-padded or --prepare-padded-rim, a new output path, and oxide thickness in nm.',
    );
  const thicknessUm = Number(thicknessNm) / 1000;
  const candidate = ['--prepare-padded', '--prepare-padded-rim'].includes(input)
    ? await preparePaddedQ2Al3Candidate(thicknessUm, input === '--prepare-padded-rim')
    : await addQ2WallOxideCandidate(JSON.parse(gunzipSync(readFileSync(input))), thicknessUm);
  writeFileSync(output, gzipSync(JSON.stringify(candidate)), { flag: 'wx' });
}
