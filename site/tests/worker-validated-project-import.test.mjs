import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

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
