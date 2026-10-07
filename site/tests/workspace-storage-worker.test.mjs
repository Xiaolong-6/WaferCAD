import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWorkspaceStorage } from '../workspace-persistence.js';

test('background packing clones the candidate and terminates on success and all failure paths', async () => {
  const OriginalWorker = globalThis.Worker;
  let instance;
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
      instance = this;
    }
    postMessage(request) {
      this.request = structuredClone(request);
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const candidate = { model: { revision: 1 } };
    const pending = prepareWorkspaceStorage(candidate);
    candidate.model.revision = 2;
    assert.equal(instance.request.project.model.revision, 1);
    assert.match(instance.url.pathname, /workspace-storage-worker.js$/);
    instance.onmessage({ data: { id: 99, type: 'done', project: candidate } });
    assert.equal(instance.terminated, undefined);
    const stored = { storage: { encoding: 'shared-assets-v2' } };
    instance.onmessage({ data: { id: 1, type: 'done', project: stored } });
    assert.deepEqual(await pending, stored);
    assert.equal(instance.terminated, true);

    for (const fail of [
      () => instance.onmessage({ data: { id: 1, type: 'error', message: 'strict rejection' } }),
      () => instance.onerror({ message: 'worker crash' }),
      () => instance.onmessageerror(),
    ]) {
      const rejected = prepareWorkspaceStorage(candidate);
      fail();
      await assert.rejects(rejected);
      assert.equal(instance.terminated, true);
    }
    globalThis.Worker.prototype.postMessage = () => {
      throw new Error('DataCloneError');
    };
    await assert.rejects(prepareWorkspaceStorage(candidate), /DataCloneError/);
    assert.equal(instance.terminated, true);
    globalThis.Worker = class {
      constructor() {
        throw new Error('startup failure');
      }
    };
    await assert.rejects(prepareWorkspaceStorage(candidate), /startup failure/);
  } finally {
    globalThis.Worker = OriginalWorker;
  }
});
