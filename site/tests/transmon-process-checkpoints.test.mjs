import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  createTransmonCheckpointStore,
  transmonValueHash,
} from '../../scripts/transmon-process-checkpoints.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const api = await import('../model.js');
const v = await import('../vector-geometry.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { applyArrayOperation } = await import('../model-array-process.js');
const { validateProcessModel } = await import('../project-schema.js');

function directory(t) {
  const parent = resolve(tmpdir()),
    path = mkdtempSync(join(parent, 'wafercad-transmon-checkpoints-'));
  t.after(() => {
    assert.ok(resolve(path).startsWith(parent + sep));
    assert.ok(path.length > parent.length + 10);
    rmSync(path, { recursive: true, force: true });
  });
  return path;
}
const header = (directory) => ({
  directory,
  sourceProjectSha256: 'a'.repeat(64),
  codeFingerprint: 'b'.repeat(64),
  options: { sidewalls: true, mmaUndercutUm: 0.3 },
});

test('process stage resume checks source, options, physical input and compressed bytes', (t) => {
  const path = directory(t),
    options = header(path);
  let store = createTransmonCheckpointStore(options);
  const model = api.createModel({ shape: 'rect', width: 8, height: 4, thickness: 2 });
  store.save({ index: 0, label: 'Si', model });
  const inputHash = transmonValueHash(model),
    parametersHash = transmonValueHash({ thickness: 0.2 });
  const outcome = api.applyOperation(model, {
    type: 'add',
    name: 'Nb',
    thickness: 0.2,
    area: model.boundary,
  });
  const step = { index: 1, label: 'Nb', inputHash, parametersHash };
  store.save({ ...step, model, outcome });
  store.close();
  store = createTransmonCheckpointStore(options);
  const saved = store.restore(step);
  assert.deepEqual(saved.model, model);
  assert.deepEqual(saved.outcome, outcome);
  validateProcessModel(saved.model);
  assert.throws(() => store.restore({ ...step, inputHash: 'changed' }), /process input/);
  assert.throws(() => store.restore({ ...step, parametersHash: 'changed' }), /process input/);
  store.close();
  assert.throws(
    () => createTransmonCheckpointStore({ ...options, codeFingerprint: 'changed' }),
    /stale resume/,
  );
  assert.throws(
    () => createTransmonCheckpointStore({ ...options, options: { mmaUndercutUm: 0.4 } }),
    /stale resume/,
  );
  const bytes = readFileSync(join(path, '001.model.json.gz'));
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(join(path, '001.model.json.gz'), bytes);
  store = createTransmonCheckpointStore(options);
  try {
    assert.throws(() => store.restore(step), /corrupt/);
  } finally {
    store.close();
  }
});

test('interrupted material-array work resumes to the exact uninterrupted model', (t) => {
  const options = header(directory(t));
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
  const interrupted = structuredClone(initial);
  let store = createTransmonCheckpointStore(options),
    writes = 0;
  store.save({ index: 0, label: 'source', model: initial });
  assert.throws(
    () =>
      applyArrayOperation(interrupted, params, api.applyOperation, {
        validateWorkingSet: validateProcessModel,
        saveWorkingSet: (entry, value) => {
          store.saveWorkingSet({ stage: 1, key: transmonValueHash(entry), value });
          if (++writes === 2) throw Error('Simulated interruption');
        },
      }),
    /Simulated interruption/,
  );
  assert.deepEqual(interrupted, initial);
  store.close();
  store = createTransmonCheckpointStore(options);
  let restores = 0;
  const resumed = structuredClone(initial);
  try {
    const result = applyArrayOperation(resumed, params, api.applyOperation, {
      validateWorkingSet: validateProcessModel,
      restoreWorkingSet: (entry) => {
        const value = store.restoreWorkingSet({ stage: 1, key: transmonValueHash(entry) });
        if (value) restores++;
        return value;
      },
    });
    assert.ok(result.changed);
  } finally {
    store.close();
  }
  assert.equal(restores, 2);
  validateProcessModel(resumed);
  const uninterrupted = structuredClone(initial);
  assert.ok(
    applyArrayOperation(uninterrupted, params, api.applyOperation, {
      validateWorkingSet: validateProcessModel,
    }).changed,
  );
  assert.deepEqual(resumed, uninterrupted);
});
