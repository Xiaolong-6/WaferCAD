import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { createSnapshotManager } from '../workspace-snapshots.js';

await loadGeometryKernel();
const { createProjectStateController } = await import('../controllers/project-state-controller.js');

function controller(readValidatedFile) {
  return createProjectStateController({
    ensureHierarchy() {},
    getState: () => ({}),
    applyState() {},
    setSectionEditEnabled() {},
    readValidatedFile,
  });
}

test('project worker output bypasses redundant main-thread parse and validation', async () => {
  let readCount = 0;
  const project = {
    snapshots: [{ state: { id: 'save-1', snapshots: undefined } }],
    snapshotBranches: {
      nodes: [{ state: { id: 'branch-1' } }],
      branches: [{ headState: { id: 'head-1' } }],
    },
  };
  const state = controller(async () => {
    readCount += 1;
    return project;
  });
  assert.equal(state.readWorkerValidatedProjectSnapshot(project), project);
  assert.equal(readCount, 0, 'Strict worker validation must not be repeated on the UI thread');
  assert.equal(
    state.isValidSnapshotStates([
      project.snapshots[0].state,
      project.snapshotBranches.nodes[0].state,
      project.snapshotBranches.branches[0].headState,
    ]),
    true,
    'Snapshot integrity copies remain available after the Worker import',
  );
  assert.equal(await state.readProjectSnapshot(new Blob(['ignored'])), project);
  assert.equal(readCount, 1, 'The general file import path still uses its validated reader');
});

test('worker-import snapshot cache continues to reject modified invalid history states', () => {
  const state = controller(async () => null);
  const project = { snapshots: [{ state: { id: 'save' } }] };
  state.readWorkerValidatedProjectSnapshot(project);
  project.snapshots[0].state.snapshots = [{ state: {} }];
  assert.equal(state.isValidSnapshotStates([project.snapshots[0].state]), false);
});

test('History consumes a validated detached copy without changing the import source', () => {
  const state = controller(async () => null);
  const imported = {
    snapshots: [
      {
        id: 's-1',
        name: 'Validated milestone',
        createdAt: '2026-10-13T00:00:00.000Z',
        state: { model: { revision: 4, regions: [{ id: 'r-1' }] } },
      },
    ],
  };
  state.readWorkerValidatedProjectSnapshot(imported);
  let adopted = 0;
  const manager = createSnapshotManager({
    capture: () => ({ model: { revision: 4 } }),
    restore() {},
    validateState: () => true,
    validateStates: state.isValidSnapshotStates,
    takeValidatedStateCopy: (source) => {
      const copy = state.takeValidatedSnapshotCopy(source);
      if (copy) adopted += 1;
      return copy;
    },
  });
  assert.equal(manager.importRecords(imported.snapshots), 1);
  assert.equal(adopted, 1, 'History reuses the strictly compared independent copy');
  imported.snapshots[0].state.model.regions[0].id = 'tampered';
  assert.equal(manager.exportRecords()[0].state.model.regions[0].id, 'r-1');
  assert.equal(state.takeValidatedSnapshotCopy(imported.snapshots[0].state), null);
});

test('a later failed snapshot validation invalidates all earlier adoptable copies', () => {
  const state = controller(async () => null);
  const imported = { snapshots: [{ state: { id: 'safe' } }] };
  state.readWorkerValidatedProjectSnapshot(imported);
  assert.equal(state.isValidSnapshotStates([imported.snapshots[0].state]), true);
  imported.snapshots[0].state.snapshots = [{ state: {} }];
  assert.equal(state.isValidSnapshotStates([imported.snapshots[0].state]), false);
  assert.equal(state.takeValidatedSnapshotCopy(imported.snapshots[0].state), null);
});
