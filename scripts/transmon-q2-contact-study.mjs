import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { applyParallelMaterialDeposition } from './transmon-parallel-deposition.mjs';
import { millQ2OxideCandidate } from './transmon-q2-milling-candidate.mjs';
import { auditQ2ReleasedMaterial } from './transmon-q2-local-proof.mjs';
import {
  createTransmonCheckpointStore,
  transmonProcessFingerprint,
  transmonValueHash,
} from './transmon-process-checkpoints.mjs';

const [input, directory, angles, tilt, depth] = process.argv.slice(2);
if (!input || !directory || !angles || !tilt || !depth)
  throw new Error(
    'Supply a padded stage-19 model.json.gz, output directory, two comma-separated GDS milling azimuths, Al6 tilt in degrees, and oxide removal depth in nm.',
  );
const azimuths = angles.split(',').map(Number);
const al6TiltDeg = Number(tilt);
const milling = { azimuths, tiltDeg: 45, depthUm: Number(depth) / 1000 };
if (
  azimuths.length !== 2 ||
  !azimuths.every(Number.isFinite) ||
  !(Number.isFinite(al6TiltDeg) && al6TiltDeg >= 0 && al6TiltDeg < 89)
)
  throw new Error('Expected two finite GDS azimuths and an Al6 tilt within 0–<89 degrees.');

const modelApi = await import('../site/model.js');
const vectorApi = await import('../site/vector-geometry.js');
const { validateProcessModel } = await import('../site/project-schema.js');
const { tileMaterialModel } = await import('../site/material-model-tiling.js');
const { difference } = await import('../site/material-process-boolean.js');
const { materialOwnerCoverage, repairMaterialHaloPartition } =
  await import('../site/material-process-partition.js');
const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
const bytes = readFileSync(input);
let model = JSON.parse(gunzipSync(bytes));
validateProcessModel(model);
const names = new Set(model.layers.map((layer) => layer.name));
if (
  model.array ||
  model.width < 44 ||
  model.height < 44 ||
  !['Al1', 'Al2', 'Al3', 'MMA', 'PMMA'].every((name) => names.has(name)) ||
  names.has('Al4 contact')
)
  throw new Error('Expected a flat, padded local Q2 model after Al3 and before contact doses.');

const sourceProjectSha256 = createHash('sha256').update(bytes).digest('hex');
const codeFingerprint = transmonValueHash([
  transmonProcessFingerprint(),
  ...[
    'transmon-q2-contact-study.mjs',
    'transmon-q2-milling-candidate.mjs',
    'transmon-q2-local-proof.mjs',
  ].map((file) =>
    createHash('sha256')
      .update(readFileSync(new URL(file, import.meta.url)))
      .digest('hex'),
  ),
]);
const store = createTransmonCheckpointStore({
  directory,
  sourceProjectSha256,
  codeFingerprint,
  options: { milling, al6TiltDeg },
});
const stages = [];
async function execute(label, params, compute) {
  const index = stages.length;
  const receipt = {
    index,
    label,
    inputHash: transmonValueHash(model),
    parametersHash: transmonValueHash(params),
  };
  const saved = store.restore(receipt);
  const result = saved ?? (await compute(model, index));
  validateProcessModel(result.model);
  if (!saved) store.save({ ...receipt, ...result });
  model = result.model;
  const stage = {
    index,
    label,
    execution: saved ? 'checkpoint' : 'computed',
    outcome: result.outcome,
  };
  stages.push(stage);
  console.log(JSON.stringify(stage));
  return result.outcome;
}

try {
  await execute('Directional horizontal oxide removal', milling, async (source) => {
    const result = await millQ2OxideCandidate(source, milling);
    const failures = [];
    let fullSupport;
    for (const cellSizeUm of [6, 8, 12, 16]) {
      try {
        const tiled = tileMaterialModel(result.model, { cellSizeUm });
        try {
          validateProcessModel(tiled);
        } catch (error) {
          if (fullSupport == null) {
            const coverage = materialOwnerCoverage(result.model);
            fullSupport =
              !difference(result.model.boundary, coverage).length &&
              !difference(coverage, result.model.boundary).length;
          }
          if (!fullSupport) throw error;
          // The untiled source proves continuous support. Repair only
          // numerical overlaps introduced by clipping to the native cells.
          for (const { model: leaf } of tiled.array.templates)
            repairMaterialHaloPartition(leaf, () => leaf.boundary);
          validateProcessModel(tiled);
        }
        return { model: tiled, outcome: { removedVolumeUm3: result.removedVolumeUm3, cellSizeUm } };
      } catch (error) {
        failures.push(error);
      }
    }
    throw new AggregateError(failures, 'No tested native cell size retained a valid Q2 partition.');
  });
  for (const [name, azimuthDeg, tiltDeg, thickness] of [
    ['Al4 contact', 270, 45, 0.03],
    ['Al5 contact', 90, 45, 0.06],
    ['Al6 contact', 270, al6TiltDeg, 0.06],
  ]) {
    const params = {
      type: 'add',
      face: 'front',
      name,
      thickness,
      growth: 'direct',
      area: model.boundary,
      incidence: {
        materialGeometry: true,
        azimuthDeg,
        tiltDeg,
        sidewalls: true,
        heightStepUm: 0.05,
      },
    };
    await execute(name, params, async (source, stage) => {
      const candidate = structuredClone(source);
      const key = (entry) => ({ stage, key: transmonValueHash(entry) });
      const outcome = await applyParallelMaterialDeposition(candidate, params, {
        workers: 3,
        jobDirectory: join(directory, 'jobs', String(stage)),
        hasWorkingSet: (entry) => store.restoreWorkingSet(key(entry)) != null,
        restoreWorkingSet: (entry) => store.restoreWorkingSet(key(entry)),
        saveWorkingSet: (entry, value) => store.saveWorkingSet({ ...key(entry), value }),
        onProgress: (s) => {
          if (s.phase !== 'computed' || s.completed % 6 === 0)
            console.log(JSON.stringify({ stage, ...s }));
        },
      });
      if (!outcome.changed) throw new Error(outcome.error || `No material added during ${name}.`);
      return { model: candidate, outcome };
    });
  }
  const ids = ['MMA', 'PMMA'].map((name) => model.layers.find((l) => l.name === name).id);
  const params = {
    type: 'liftoff',
    face: 'front',
    area: model.boundary,
    sacrificialLayerId: ids[0],
    sacrificialLayerIds: ids,
  };
  const liftOff = await execute('Bilayer lift-off', params, (source) => {
    const candidate = structuredClone(source);
    const outcome = applyAdvancedProcessOperation(
      candidate,
      params,
      candidate.boundary,
      modelApi,
      vectorApi,
    );
    return { model: candidate, outcome };
  });
  const connectivity = liftOff.changed
    ? await auditQ2ReleasedMaterial(model, { traceBypass: true })
    : null;
  const proof = {
    sourceProjectSha256,
    milling,
    al6TiltDeg,
    processWidthUm: model.width,
    stages,
    connectivity,
  };
  writeFileSync(join(directory, 'contact-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  if (!connectivity?.geometryAccepted) process.exitCode = 1;
} finally {
  store.close();
}
