import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createProjectStateController } = await import('../controllers/project-state-controller.js');
const text = await readFile(
  new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
  'utf8',
);
const file = { size: Buffer.byteLength(text), text: async () => text };
const statesOf = (project) =>
  [
    ...project.snapshots.map((record) => record.state),
    ...project.snapshotBranches.nodes.map((node) => node.state),
    ...project.snapshotBranches.branches.map((branch) => branch.headState),
  ].filter(Boolean);

test('strict file results are reused once, with exact mutation detection and strict external fallback', async () => {
  const controller = createProjectStateController({});
  let booleans = 0;
  const kernel = globalThis.polygonClipping;
  const original = { difference: kernel.difference, intersection: kernel.intersection };
  for (const name of Object.keys(original))
    kernel[name] = (...args) => {
      booleans++;
      return original[name](...args);
    };
  try {
    const project = await controller.readProjectSnapshot(file),
      states = statesOf(project);
    assert.ok(booleans > 0, 'The file must first pass real strict validation.');
    booleans = 0;
    assert.equal(controller.isValidSnapshotStates([...states, states[0]]), true);
    assert.equal(
      booleans,
      0,
      'Only untouched states from this validated read can skip duplicate booleans.',
    );
    assert.equal(controller.isValidSnapshotStates(states), true);
    assert.ok(booleans > 0, 'Receipts are consumed; later validation remains strict.');

    for (const mutate of [
      (state) => {
        state.model.width = NaN;
      },
      (state) => {
        state.model.regions[0].geom[0][0][0][0] = Infinity;
      },
      (state) => {
        state.model.regions[0].stack[0].layerId = 'missing-layer';
      },
      (state) => {
        state.display.customStructurePalette = NaN;
      },
      (state) => {
        state.snapshots = [];
      },
    ]) {
      const imported = await controller.readProjectSnapshot(file),
        state = statesOf(imported)[0];
      mutate(state);
      assert.equal(controller.isValidSnapshotStates([state]), false);
    }
    const imported = await controller.readProjectSnapshot(file),
      state = statesOf(imported)[0];
    state.display.xyUnit = 'nm';
    booleans = 0;
    assert.equal(controller.isValidSnapshotStates([state]), true);
    assert.ok(booleans > 0, 'Valid preparations also require strict validation when changed.');

    const external = structuredClone(state);
    external.model.width = -1;
    assert.equal(controller.isValidSnapshotStates([external]), false);
    assert.equal(controller.isValidSnapshotState(external), false);
    await assert.rejects(controller.readProjectSnapshot({ size: 2, text: async () => '{}' }));
    assert.equal(await controller.readProjectSnapshot(null).catch(() => null), null);
  } finally {
    Object.assign(kernel, original);
  }
});

test('Fast display preference is optional, boolean and never a geometry migration', async () => {
  const controller = createProjectStateController({});
  const project = await controller.readProjectSnapshot(file),
    state = statesOf(project)[0];
  const before = structuredClone(state.model);
  for (const preference of [true, false]) {
    state.display.threeFastMode = preference;
    assert.equal(controller.isValidSnapshotState(state), true);
    assert.deepEqual(state.model, before);
  }
  state.display.threeFastMode = 'fast';
  assert.equal(controller.isValidSnapshotState(state), false);
});
