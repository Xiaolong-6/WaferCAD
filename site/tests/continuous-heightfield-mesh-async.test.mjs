import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContinuousSiHeightfieldMeshAsync } from '../continuous-heightfield-mesh-async.js';

function fakeWorker() {
  const instances = [];
  class StubWorker {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      this.messages = [];
      instances.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    finish(mesh) {
      this.onmessage({ data: { id: 1, type: 'done', mesh } });
    }
  }
  return { StubWorker, instances };
}

async function withWorker(WorkerType, task) {
  const previous = globalThis.Worker;
  globalThis.Worker = WorkerType;
  try {
    return await task();
  } finally {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
}

const triangle = {
  positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0),
  normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
  triangles: 1,
};

test('Continuous Si display Worker receives owner and returns validated transferable mesh', async () => {
  const { StubWorker, instances } = fakeWorker();
  await withWorker(StubWorker, async () => {
    const owner = { kind: 'test-only' };
    const task = buildContinuousSiHeightfieldMeshAsync(owner, { xyStepUm: 1.5 });
    assert.equal(instances.length, 1);
    assert.match(instances[0].url.pathname, /continuous-heightfield-mesh-worker\.js$/);
    assert.equal(instances[0].messages[0].owner, owner);
    assert.equal(instances[0].messages[0].xyStepUm, 1.5);
    instances[0].finish(triangle);
    const result = await task;
    assert.equal(result.backend, 'worker');
    assert.deepEqual(result.mesh, triangle);
    assert.equal(instances[0].terminated, true);
  });
});

test('new History/ROI request aborts worker and ignores late mesh replies', async () => {
  const { StubWorker, instances } = fakeWorker();
  await withWorker(StubWorker, async () => {
    const controller = new AbortController();
    const task = buildContinuousSiHeightfieldMeshAsync({}, { signal: controller.signal });
    const worker = instances[0];
    controller.abort();
    worker.finish(triangle);
    await assert.rejects(task, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
  });
});

test('already aborted render never allocates a Worker', async () => {
  const { StubWorker, instances } = fakeWorker();
  await withWorker(StubWorker, async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      buildContinuousSiHeightfieldMeshAsync({}, { signal: controller.signal }),
      { name: 'AbortError' },
    );
    assert.equal(instances.length, 0);
  });
});

test('worker error and invalid geometry reject without committing a stale scene', async () => {
  const { StubWorker, instances } = fakeWorker();
  await withWorker(StubWorker, async () => {
    const failure = buildContinuousSiHeightfieldMeshAsync({});
    instances.at(-1).onmessage({ data: { id: 1, type: 'error', message: 'invalid model' } });
    await assert.rejects(failure, /invalid model/);
    const invalid = buildContinuousSiHeightfieldMeshAsync({});
    instances.at(-1).finish({ ...triangle, normals: new Float32Array(2) });
    await assert.rejects(invalid, /invalid mesh/);
    assert.equal(instances.every((w) => w.terminated), true);
  });
});
