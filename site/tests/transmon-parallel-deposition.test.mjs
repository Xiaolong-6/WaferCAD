import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  cache.clear();
  let planned = 0;
  await assert.rejects(
    applyParallelMaterialDeposition(model, params, {
      ...options,
      onProgress: (progress) => {
        if (progress.phase !== 'planned') return;
        planned = progress.pending;
        const path = join(
          directory,
          readdirSync(directory).find((file) => file.endsWith('.job.json.gz')),
        );
        const job = JSON.parse(gunzipSync(readFileSync(path)));
        job.entry.params.incidence.heightStepUm = 1;
        writeFileSync(path, gzipSync(JSON.stringify(job)));
      },
    }),
    (error) =>
      error instanceof AggregateError && error.errors.length === 1 && /Z slice/.test(error.message),
  );
  assert.deepEqual(model, initial);
  assert.ok(planned > 1);
  assert.equal(cache.size, planned - 1);
  const result = await applyParallelMaterialDeposition(model, params, options);
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
    const parallel = await applyParallelMaterialDeposition(model, next, options);
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
