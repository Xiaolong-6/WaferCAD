import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createProjectStateController } = await import('../controllers/project-state-controller.js');

test('v15 Assembly file is refused before any ordinary editor state mutation', async () => {
  const calls = [];
  const unsafe = { format: 'WaferCAD-vector', version: 15, waferAssembly: { version: 1 } };
  const controller = createProjectStateController({
    ensureHierarchy: () => calls.push('hierarchy'),
    getState: () => ({}),
    applyState: () => calls.push('mutated'),
    setSectionEditEnabled: () => calls.push('section-state'),
    readValidatedFile: async () => structuredClone(unsafe),
  });
  await assert.rejects(
    () => controller.readProjectSnapshot({}),
    /requires the multi-wafer editor/,
  );
  assert.throws(
    () => controller.loadProjectSnapshot(unsafe),
    /requires the multi-wafer editor/,
  );
  assert.deepEqual(calls, [], 'not even transient editor selection may be changed');
});

test('ordinary v14 project import path remains available', async () => {
  let read = 0;
  const source = { format: 'WaferCAD-vector', version: 14, snapshots: [] };
  const controller = createProjectStateController({
    ensureHierarchy: () => {},
    getState: () => ({}),
    applyState: () => {},
    setSectionEditEnabled: () => {},
    readValidatedFile: async () => {
      read++;
      return structuredClone(source);
    },
  });
  const received = await controller.readProjectSnapshot({});
  assert.deepEqual(received, source);
  assert.equal(read, 1);
});
