import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { applyParallelMaterialDeposition } from '../../scripts/transmon-parallel-deposition.mjs';
import { transmonValueHash } from '../../scripts/transmon-process-checkpoints.mjs';
const api = await import('../model.js');
const v = await import('../vector-geometry.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { applyArrayOperation } = await import('../model-array-process.js');
const { validateProcessModel } = await import('../project-schema.js');

test('parallel material halos commit the exact sequential result and retain completed work after interruption', async (t) => {
  const parent = resolve(tmpdir()),
    directory = mkdtempSync(join(parent, 'wafercad-parallel-'));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(parent + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const source = api.createModel({ shape: 'rect', width: 16, height: 8, thickness: 2 });
  api.applyOperation(source, {
    type: 'add',
    name: 'Nb',
    thickness: 0.25,
    area: v.rectMulti(3, 8, 1, 0),
  });
  const initial = tileMaterialModel(source, { cellSizeUm: 4 });
  const params = {
    type: 'add',
    growth: 'direct',
    name: 'Al',
    thickness: 0.04,
    face: 'front',
    area: initial.boundary,
    incidence: {
      materialGeometry: true,
      sidewalls: true,
      tiltDeg: 45,
      azimuthDeg: 0,
      heightStepUm: 0.05,
    },
  };
  const expected = structuredClone(initial);
  const outcome = applyArrayOperation(expected, params, api.applyOperation);
  assert.ok(outcome.changed, outcome.error);
  const model = structuredClone(initial),
    cache = new Map();
  const options = {
    jobDirectory: directory,
    workers: 2,
    hasWorkingSet: (entry) => cache.has(transmonValueHash(entry)),
    restoreWorkingSet: (entry) => structuredClone(cache.get(transmonValueHash(entry))),
    saveWorkingSet: (entry, value) => cache.set(transmonValueHash(entry), structuredClone(value)),
  };
  await assert.rejects(
    applyParallelMaterialDeposition(model, params, {
      ...options,
      onProgress: (progress) => {
        if (progress.completed === 1) throw Error('simulated interruption');
      },
    }),
    /simulated interruption/,
  );
  assert.deepEqual(model, initial);
  assert.ok(cache.size > 0);
  const plan = JSON.parse(readFileSync(join(directory, 'material-plan.json')));
  assert.equal(plan.format, 'WaferCAD-material-plan-v1');
  assert.ok(plan.jobs.length > 1);
  cache.clear();
  // A file changed after planning must never be silently used as a valid
  // cached halo. Restore the original bytes before resuming the real work.
  const path = join(directory, `${plan.jobs[0].id}.job.json.gz`);
  const bytes = readFileSync(path);
  const job = JSON.parse(gunzipSync(bytes));
  job.entry.params.incidence.heightStepUm = 1;
  writeFileSync(path, gzipSync(JSON.stringify(job)));
  await assert.rejects(
    applyParallelMaterialDeposition(model, params, options),
    /Cached material working-set input changed/,
  );
  assert.deepEqual(model, initial);
  writeFileSync(path, bytes);
  const phases = [];
  const result = await applyParallelMaterialDeposition(model, params, {
    ...options,
    onProgress: ({ phase }) => phases.push(phase),
  });
  assert.ok(phases.includes('plan-restored'), 'unchanged input must reuse saved halo planning');
  assert.equal(cache.size, plan.jobs.length);
  assert.deepEqual(result, outcome);
  assert.deepEqual(model, expected);
  validateProcessModel(model);
  for (const azimuthDeg of [45, -135]) {
    const next = {
      ...params,
      name: `Al ${azimuthDeg}`,
      thickness: 0.03,
      incidence: { ...params.incidence, azimuthDeg },
    };
    const sequential = applyArrayOperation(expected, next, api.applyOperation);
    const dosePhases = [];
    const parallel = await applyParallelMaterialDeposition(model, next, {
      ...options,
      onProgress: ({ phase }) => dosePhases.push(phase),
    });
    assert.ok(!dosePhases.includes('plan-restored'), 'a new dose must invalidate the prior plan');
    assert.deepEqual(parallel, sequential);
    assert.deepEqual(model, expected);
    validateProcessModel(model);
  }
  const beforeRejected = structuredClone(model);
  await assert.rejects(
    applyParallelMaterialDeposition(
      model,
      {
        ...params,
        incidence: { ...params.incidence, heightStepUm: 1 },
      },
      options,
    ),
    /Z slice/,
  );
  assert.deepEqual(model, beforeRejected);
});
