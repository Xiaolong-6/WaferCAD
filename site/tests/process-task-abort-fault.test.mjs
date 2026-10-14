import assert from 'node:assert/strict';
import test from 'node:test';

import { createProcessTaskController } from '../controllers/process-task-controller.js';

test('Abort terminates an in-flight worker, ignores late success, and releases busy state', async () => {
  const NativeWorker = globalThis.Worker;
  const instances = [];
  const statuses = [];
  const disabled = [];
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      instances.push(this);
    }
    postMessage(request) {
      this.request = request;
    }
    terminate() {
      this.terminated = true;
    }
  };
  const model = { revision: 2, regions: [{ geom: [], stack: [] }], layers: ['base'] };
  const before = structuredClone(model);
  const controller = createProcessTaskController({
    root: { getElementById: () => null },
    status: (message, level) => statuses.push({ message, level }),
    setApplyDisabled: (value) => disabled.push(value),
  });
  try {
    const pending = controller.run(model, { type: 'add', thickness: 1, face: 'front' });
    assert.equal(controller.isBusy(), true);
    assert.equal(instances.length, 1);
    const worker = instances[0];
    assert.strictEqual(worker.request.model, model);
    const id = worker.request.id;
    controller.abort();
    const result = await pending;
    assert.deepEqual(result, { aborted: true });
    assert.equal(worker.terminated, true);
    assert.equal(controller.isBusy(), false);
    assert.deepEqual(disabled, [true, false]);
    assert.equal(statuses.at(-1).level, 'warning');

    worker.onmessage({
      data: {
        id,
        type: 'done',
        validated: true,
        model: { revision: 100, layers: ['unexpected'], regions: [] },
      },
    });
    assert.deepEqual(model, before);
    assert.equal(controller.isBusy(), false);
    assert.equal(controller.dispose(), undefined);
  } finally {
    controller.dispose();
    globalThis.Worker = NativeWorker;
  }
});

test('Worker failure leaves the input model and task controls untouched', async () => {
  const NativeWorker = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  };
  const model = { revision: 4, layers: ['base'], regions: [] };
  const before = structuredClone(model);
  const statuses = [];
  const controller = createProcessTaskController({
    root: { getElementById: () => null },
    status: (message, kind) => statuses.push({ message, kind }),
  });
  try {
    const pending = controller.run(model, { type: 'etch', thickness: 1 });
    worker.onerror({ message: 'injected worker failure' });
    const result = await pending;
    assert.match(result.error, /injected worker failure/);
    assert.deepEqual(model, before);
    assert.equal(controller.isBusy(), false);
    assert.equal(worker.terminated, true);
    assert.equal(statuses.at(-1).kind, 'error');
  } finally {
    controller.dispose();
    globalThis.Worker = NativeWorker;
  }
});
