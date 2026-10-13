import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnapshotManager } from '../workspace-snapshots.js';
import { validateHistoryHeadOffThread } from '../history-head-validation.js';

test('History worker validates a detached head and terminates on failures', async () => {
  const previousWorker = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
      worker = this;
    }
    postMessage(request) {
      this.request = structuredClone(request);
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const state = { model: { processRevision: 1 }, snapshots: undefined };
    const pending = validateHistoryHeadOffThread(state, () => {
      throw new Error('No foreground validation allowed');
    });
    assert.match(worker.url.pathname, /history-head-validate-worker\.js$/);
    assert.equal(worker.request.action, 'validate-head');
    state.model.processRevision = 2;
    assert.equal(worker.request.state.model.processRevision, 1);
    worker.onmessage({ data: { id: 99, type: 'done', valid: true } });
    assert.equal(worker.terminated, undefined);
    worker.onmessage({ data: { id: 1, type: 'done', valid: true } });
    assert.equal(await pending, true);
    assert.equal(worker.terminated, true);

    const invalid = validateHistoryHeadOffThread(state, () => true);
    worker.onmessage({ data: { id: 1, type: 'done', valid: false } });
    assert.equal(await invalid, false);

    for (const reject of [
      () => worker.onerror({ message: 'validator crashed' }),
      () => worker.onmessageerror(),
    ]) {
      const request = validateHistoryHeadOffThread(state, () => true);
      reject();
      await assert.rejects(request);
      assert.equal(worker.terminated, true);
    }
    globalThis.Worker.prototype.postMessage = () => {
      throw new Error('DataCloneError');
    };
    await assert.rejects(
      validateHistoryHeadOffThread(state, () => true),
      /DataCloneError/,
    );
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test('async History head rejects invalid and edited candidates atomically', async () => {
  let live = { model: { revision: 1, processRevision: 0 }, display: { xyUnit: 'um' } };
  const manager = createSnapshotManager({
    capture: () => live,
    restore: () => {},
    validateState: () => true,
  });
  assert.equal(await manager.syncActiveHeadStateAsync(async () => false), 'rejected');
  assert.equal(manager.exportBranchState().branches[0].headState, null);

  let finish;
  const pending = manager.syncActiveHeadStateAsync(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  live = { model: { revision: 2, processRevision: 0 }, display: { xyUnit: 'um' } };
  finish(true);
  assert.equal(await pending, 'stale');
  assert.equal(manager.exportBranchState().branches[0].headState, null);

  assert.equal(await manager.syncActiveHeadStateAsync(async () => true), 'updated');
  assert.deepEqual(manager.exportBranchState().branches[0].headState.model, live.model);
  assert.equal(manager.syncActiveHeadState(), true);
});

test('Worker autosave transfer preserves snapshot payload and independent public exports', () => {
  const largeState = {
    model: { revision: 7, processRevision: 0, regions: [{ id: 'r1', value: 13 }] },
    layout: { elements: [{ id: 'mask-1' }] },
  };
  const manager = createSnapshotManager({
    capture: () => largeState,
    restore: () => {},
    validateState: () => true,
    idFactory: () => 'save-1',
  });
  manager.create('Initial');
  assert.equal(manager.syncActiveHeadState(), true);

  const transfer = manager.exportForWorkerStorage();
  const ordinary = {
    snapshots: manager.exportRecords(),
    snapshotBranches: manager.exportBranchState(),
  };
  assert.deepEqual(transfer, ordinary, 'Worker must receive identical scientific History');
  assert.notStrictEqual(transfer.snapshots, ordinary.snapshots);
  assert.notStrictEqual(transfer.snapshotBranches.branches, ordinary.snapshotBranches.branches);

  // The worker communication boundary is synchronous and produces an isolated
  // candidate before the rest of autosave continues asynchronously.
  const posted = structuredClone(transfer);
  largeState.model.regions[0].value = 42;
  ordinary.snapshots[0].state.model.regions[0].value = 99;
  assert.equal(posted.snapshots[0].state.model.regions[0].value, 13);
  assert.equal(posted.snapshotBranches.branches[0].headState.model.regions[0].value, 13);
  assert.equal(manager.exportRecords()[0].state.model.regions[0].value, 13);
  assert.equal(manager.exportBranchState().branches[0].headState.model.regions[0].value, 13);
});
