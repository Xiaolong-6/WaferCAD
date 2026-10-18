import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createProjectStateController } = await import('../controllers/project-state-controller.js');

function controller(readValidatedFile, yieldHistoryAttestation) {
  return createProjectStateController({
    ensureHierarchy() {},
    getState: () => ({}),
    applyState() {},
    setSectionEditEnabled() {},
    readValidatedFile,
    ...(yieldHistoryAttestation ? { yieldHistoryAttestation } : {}),
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

test('async worker attestation yields between batches but commits the whole private cache', async () => {
  let resume;
  let yieldCount = 0;
  const pause = () => {
    yieldCount++;
    return new Promise((resolve) => {
      resume = resolve;
    });
  };
  const snapshots = Array.from({ length: 5 }, (_, index) => ({
    state: { id: `history-${index}`, model: { regions: [{ xy: [0.0000004, index] }] } },
  }));
  const project = { snapshots };
  const state = controller(async () => project, pause);
  const pending = state.readWorkerValidatedProjectSnapshotAsync(project);
  assert.equal(yieldCount, 1, 'four states form one asynchronous batch');
  assert.equal(typeof resume, 'function');
  assert.equal(
    state.isValidSnapshotStates([snapshots[0].state]),
    false,
    'a staged attestation is never exposed before its final batch',
  );
  resume();
  assert.equal(await pending, project);
  assert.equal(state.isValidSnapshotStates(snapshots.slice(1).map((record) => record.state)), true);
  snapshots[0].state.model.regions[0].xy[0] = 999;
  assert.equal(
    state.isValidSnapshotStates([snapshots[0].state]),
    false,
    'attestation cannot silently accept changed worker-validated geometry',
  );
});

test('reused History references attest once across snapshots, process nodes and branch heads', async () => {
  let yields = 0;
  const shared = { id: 'shared-head', model: { regions: [{ xy: [0.0000004, 7] }] } };
  const independent = { id: 'independent', model: { regions: [{ xy: [1, 2] }] } };
  const project = {
    snapshots: Array.from({ length: 7 }, () => ({ state: shared })),
    snapshotBranches: {
      nodes: [{ state: independent }, { state: shared }],
      branches: [{ headState: shared }, { headState: independent }],
    },
  };
  const manager = controller(
    async () => project,
    async () => {
      yields++;
    },
  );
  const before = performance.getEntriesByName('wafercad:history:attestation-clone').length;
  assert.equal(await manager.readWorkerValidatedProjectSnapshotAsync(project), project);
  assert.equal(yields, 0, 'two unique identities fit one bounded cloning batch');
  const entries = performance.getEntriesByName('wafercad:history:attestation-clone');
  const entry = entries[before];
  assert.ok(entry, 'attestation diagnostics should report unique-state work');
  assert.equal(entry.detail.states, 11);
  assert.equal(entry.detail.uniqueStates, 2);
  assert.equal(entry.detail.reusedReferences, 9);
  assert.equal(entry.detail.batches, 1);
  assert.equal(manager.isValidSnapshotStates([shared, independent, shared]), true);
  // Ref reuse must not turn the attestation cache into a blanket trust flag.
  await manager.readWorkerValidatedProjectSnapshotAsync(project);
  shared.model.regions[0].xy[0] = 0.5;
  assert.equal(manager.isValidSnapshotStates([shared]), false);
  assert.equal(manager.isValidSnapshotStates([independent]), true);
});

test('later sync import wins over a suspended async attestation without partial publication', async () => {
  let resume;
  const state = controller(
    async () => null,
    () =>
      new Promise((resolve) => {
        resume = resolve;
      }),
  );
  const oldProject = {
    snapshots: Array.from({ length: 5 }, (_, index) => ({ state: { id: `old-${index}` } })),
  };
  const newProject = { snapshots: [{ state: { id: 'winning-import' } }] };
  const stale = state.readWorkerValidatedProjectSnapshotAsync(oldProject);
  assert.equal(typeof resume, 'function');
  assert.equal(state.readWorkerValidatedProjectSnapshot(newProject), newProject);
  resume();
  await assert.rejects(stale, { name: 'AbortError' });
  assert.equal(state.isValidSnapshotStates([newProject.snapshots[0].state]), true);
  assert.equal(state.isValidSnapshotStates([oldProject.snapshots[0].state]), false);
});

test('background project reader attests History asynchronously and retains strict reader contract', async () => {
  let readCount = 0;
  let yieldCount = 0;
  const project = {
    snapshots: Array.from({ length: 9 }, (_, index) => ({ state: { id: `save-${index}` } })),
  };
  const state = controller(
    async () => {
      readCount++;
      return project;
    },
    async () => {
      yieldCount++;
    },
  );
  const result = await state.readProjectSnapshot(new Blob(['irrelevant']));
  assert.equal(result, project);
  assert.equal(readCount, 1);
  assert.equal(yieldCount, 2);
  assert.equal(state.isValidSnapshotStates(project.snapshots.map((record) => record.state)), true);
});

test('shared-model History entries use bounded coalesced attestation batches without trusting mutations', async () => {
  let yields = 0;
  const sharedModel = { regions: [{ xy: [0.0000004, 7] }] };
  const records = [
    { state: { id: 'same-1', model: sharedModel } },
    { state: { id: 'different-1', model: { regions: [{ xy: [1, 2] }] } } },
    { state: { id: 'same-2', model: sharedModel } },
    { state: { id: 'different-2', model: { regions: [{ xy: [3, 4] }] } } },
    { state: { id: 'same-3', model: sharedModel } },
  ];
  const project = { snapshots: records };
  const state = controller(
    async () => project,
    async () => {
      yields++;
    },
  );
  const start = performance.getEntriesByName('wafercad:history:attestation-clone').length;
  await state.readWorkerValidatedProjectSnapshotAsync(project);
  const entry = performance.getEntriesByName('wafercad:history:attestation-clone')[start];
  assert.equal(entry.detail.uniqueStates, 5);
  assert.equal(entry.detail.sharedModelGroups, 3);
  assert.equal(entry.detail.batches, 2, 'clones must remain limited to four states per batch');
  assert.equal(yields, 1);
  assert.equal(state.isValidSnapshotStates(records.map((record) => record.state)), true);

  await state.readWorkerValidatedProjectSnapshotAsync(project);
  sharedModel.regions[0].xy[0] = 999;
  assert.equal(
    state.isValidSnapshotStates([records[0].state, records[2].state, records[4].state]),
    false,
    'all History references to a changed model must still fail attestation',
  );
  assert.equal(state.isValidSnapshotStates([records[1].state, records[3].state]), true);
});
