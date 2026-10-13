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
