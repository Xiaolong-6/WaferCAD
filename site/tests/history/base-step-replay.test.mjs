import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createModel } = await import('../../model.js');
const { createBaseControlsController } =
  await import('../../controllers/base-controls-controller.js');

function harness({
  replayResult = { ok: true, completed: 2 },
  checkpoint = true,
  prepareError = null,
} = {}) {
  let model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 2 });
  model.processRevision = 2;
  model.layers[0].name = 'Silicon';
  const initial = structuredClone(model);
  const undo = [];
  const redo = [{ previous: 'future' }];
  const statuses = [];
  let checkpoints = 0;
  let replays = 0;
  let archived = false;
  let sections = 0;
  let fits = 0;
  let replayInteractionBegins = 0;
  let replayInteractionEnds = 0;
  const fields = {
    baseWidth: { value: '30' },
    baseHeight: { value: '12' },
    baseThickness: { value: '3' },
  };
  const controller = createBaseControlsController({
    root: {
      getElementById: (id) => fields[id],
      querySelector: () => ({ dataset: { shape: 'rect' } }),
    },
    getModel: () => model,
    setModel: (next) => {
      model = next;
    },
    setSection: () => {
      sections++;
    },
    getBaseRevertSnapshot: () => null,
    setBaseRevertSnapshot: () => {},
    getHistory: () => undo,
    getFuture: () => redo,
    stateSnapshot: () => ({
      project: { model: structuredClone(model) },
      workspaceState: { model: structuredClone(model) },
    }),
    restoreSnapshot: (saved) => {
      model = structuredClone(saved.project.model);
    },
    saveHistory: (saved) => {
      undo.push(saved);
      redo.length = 0;
    },
    hasProcessEdits: () => true,
    manualMicron: Number,
    formatLengthField: String,
    syncBaseControls: () => {},
    renderAll: () => {},
    fit3d: () => {
      fits++;
    },
    status: (message, level) => statuses.push({ message, level }),
    chooseHistoryAction: async () => 'replay',
    getHistoryDetails: () => ({ hasHistory: true }),
    captureBaseSnapshot: () => ({
      project: { model: structuredClone(model) },
      workspaceState: { model: structuredClone(model) },
    }),
    prepareBaseReplay: () => {
      if (prepareError) throw Error(prepareError);
      return { steps: [{ operation: { kind: 'record' } }, { operation: { kind: 'record' } }] };
    },
    checkpointBeforeBaseReplay: async () => {
      checkpoints++;
      return checkpoint;
    },
    replayBaseOperations: async () => {
      replays++;
      // Simulate Process replay's per-Step transactional Undo records.
      undo.push({ step: 1 }, { step: 2 });
      return replayResult;
    },
    beginBaseReplayInteraction: () => {
      replayInteractionBegins++;
    },
    endBaseReplayInteraction: () => {
      replayInteractionEnds++;
    },
    collapseBaseReplayUndo: (start, saved) => {
      undo.splice(start);
      undo.push(saved);
    },
    rebuildMainHistory: ({ preservePrevious }) => {
      archived = preservePrevious;
      return { archivedBranchId: preservePrevious ? 'archived-main' : null };
    },
  });
  return {
    controller,
    initial,
    undo,
    redo,
    statuses,
    get model() {
      return model;
    },
    get checkpoints() {
      return checkpoints;
    },
    get replays() {
      return replays;
    },
    get archived() {
      return archived;
    },
    get sections() {
      return sections;
    },
    get fits() {
      return fits;
    },
    get replayInteractions() {
      return [replayInteractionBegins, replayInteractionEnds];
    },
  };
}

test('Step 0 Base replay is one Undo transaction and keeps current Section/camera', async () => {
  const h = harness();
  assert.equal(await h.controller.applyBase(), true);
  assert.equal(h.model.width, 30);
  assert.equal(h.model.thickness, 3);
  assert.equal(h.model.layers[0].name, 'Silicon');
  assert.equal(h.archived, true);
  assert.equal(h.checkpoints, 1);
  assert.equal(h.replays, 1);
  assert.equal(h.undo.length, 1);
  assert.deepEqual(h.undo[0].project.model, h.initial);
  assert.equal(h.sections, 0);
  assert.equal(h.fits, 0);
  assert.deepEqual(h.replayInteractions, [1, 1]);
});

test('Failed Step 0 replay restores physical model and Undo/Redo stacks', async () => {
  const h = harness({
    replayResult: { ok: false, completed: 1, error: 'worker rejected geometry' },
  });
  assert.equal(await h.controller.applyBase(), false);
  assert.deepEqual(h.model, h.initial);
  assert.equal(h.undo.length, 0);
  assert.deepEqual(h.redo, [{ previous: 'future' }]);
  assert.equal(h.statuses.at(-1).level, 'error');
  assert.deepEqual(h.replayInteractions, [1, 1]);
});

test('Step 0 replay is rejected before mutation without Recovery checkpoint', async () => {
  const h = harness({ checkpoint: false });
  assert.equal(await h.controller.applyBase(), false);
  assert.deepEqual(h.model, h.initial);
  assert.equal(h.replays, 0);
  assert.deepEqual(h.replayInteractions, [0, 0]);
  assert.equal(h.undo.length, 0);
});

test('Non-replayable old History fails preflight without touching the model', async () => {
  const h = harness({ prepareError: 'missing replay metadata' });
  assert.equal(await h.controller.applyBase(), false);
  assert.deepEqual(h.model, h.initial);
  assert.equal(h.checkpoints, 0);
  assert.equal(h.replays, 0);
});
