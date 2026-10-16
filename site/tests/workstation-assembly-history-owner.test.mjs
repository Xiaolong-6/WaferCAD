import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkstationHistoryOwner } from '../ui-v2/workstation-history-owner.js';
import { createWorkspacePersistenceController } from '../controllers/workspace-persistence-controller.js';

test('Assembly workspace cannot instantiate or mutate generic Snapshot History', async () => {
  let captureCalls = 0;
  const history = createWorkstationHistoryOwner({
    assemblyWorkspace: true,
    capture: () => {
      captureCalls++;
      throw new Error('Generic snapshot must never capture Assembly sources');
    },
  });
  assert.equal(history.mode, 'assembly-isolated');
  assert.equal(captureCalls, 0, 'no ordinary SnapshotManager created');
  assert.equal(history.importRecords([], null), 0);
  assert.deepEqual(history.exportRecords(), []);
  assert.equal(history.exportBranchState(), null);
  assert.equal(history.exportForWorkerStorage(), null);
  assert.deepEqual(history.listHistory(), []);
  assert.deepEqual(history.listBranches(), []);
  assert.equal(history.activeBranch().id, 'assembly-isolated');
  assert.equal(history.currentPosition().branchId, history.activeBranch().id);
  assert.equal(history.currentPosition().atHead, true);
  assert.equal(history.canRecordOperation(), false);
  assert.equal(history.canCreateVariant(), false);
  assert.throws(() => history.importRecords([{ id: 'foreign' }]), /forbidden/);
  assert.throws(() => history.importRecords([], { branches: [] }), /forbidden/);
  await assert.rejects(history.importRecordsAsync([], null), /forbidden/);
  for (const mutation of ['recordOperation', 'create', 'restore', 'switchBranch', 'clear']) {
    assert.throws(() => history[mutation](), /forbidden/, mutation);
  }
  assert.equal(captureCalls, 0, 'failed mutations did not call generic capture');
});

test('read-only persistence does not instrument an isolated, frozen Assembly owner', () => {
  const owner = createWorkstationHistoryOwner({ assemblyWorkspace: true });
  assert.equal(Object.isExtensible(owner), false);
  const persistence = createWorkspacePersistenceController({
    root: { getElementById: () => null },
    snapshotManager: owner,
    trackSnapshotMutations: false,
    workspaceSession: {},
    buildProjectSnapshot: () => {
      throw new Error('Preview must not save');
    },
    status: () => {},
  });
  assert.equal(typeof persistence.persistNow, 'function');
  assert.equal(owner.mode, 'assembly-isolated');
  assert.throws(() => owner.create('foreign-bookmark'), /forbidden/);
});
