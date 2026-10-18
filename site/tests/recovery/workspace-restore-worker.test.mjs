import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { loadWorkspaceState } = await import('../../workspace-persistence.js');

test('workspace restore sends only a load request and adopts the validated worker result', async () => {
  const OriginalWorker = globalThis.Worker;
  let instance;
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
      instance = this;
    }
    postMessage(message) {
      this.message = structuredClone(message);
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const pending = loadWorkspaceState({ background: true });
    assert.match(instance.url.pathname, /workspace-restore-worker\.js$/);
    assert.deepEqual(instance.message, { id: 1, action: 'load-current' });
    const source = { version: 12, snapshots: [{ id: 3 }] };
    instance.onmessage({ data: { id: 42, type: 'done', project: null } });
    assert.equal(instance.terminated, undefined);
    instance.onmessage({ data: { id: 1, type: 'done', project: source } });
    assert.strictEqual(await pending, source);
    assert.equal(instance.terminated, true);
    instance.onmessage({ data: { id: 1, type: 'error', message: 'late error' } });

    const empty = loadWorkspaceState({ background: true });
    instance.onmessage({ data: { id: 1, type: 'done', project: null } });
    assert.equal(await empty, null);
    assert.equal(instance.terminated, true);

    for (const fail of [
      () => instance.onmessage({ data: { id: 1, type: 'error', message: 'invalid project' } }),
      () => instance.onerror({ message: 'worker crash' }),
      () => instance.onmessageerror(),
    ]) {
      const request = loadWorkspaceState({ background: true });
      fail();
      await assert.rejects(request);
      assert.equal(instance.terminated, true);
    }

    globalThis.Worker.prototype.postMessage = () => {
      throw new Error('DataCloneError');
    };
    await assert.rejects(loadWorkspaceState({ background: true }), /DataCloneError/);
    assert.equal(instance.terminated, true);
    globalThis.Worker = class {
      constructor() {
        throw new Error('startup blocked');
      }
    };
    await assert.rejects(loadWorkspaceState({ background: true }), /startup blocked/);
  } finally {
    globalThis.Worker = OriginalWorker;
  }
});
