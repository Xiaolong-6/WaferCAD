import assert from 'node:assert/strict';
import test from 'node:test';

import { createProcessTaskController } from '../controllers/process-task-controller.js';

function fakeRoot() {
  const elements = new Map(
    ['processTaskDialog', 'processTaskTitle', 'processTaskStage', 'processTaskElapsed'].map((id) => [
      id,
      { hidden: true, textContent: '' },
    ]),
  );
  return { getElementById: (id) => elements.get(id) || null };
}

test('worker startup failures do not leave the task controller busy', async () => {
  const originalWorker = globalThis.Worker,
    disabled = [],
    messages = [];
  globalThis.Worker = class {
    constructor() {
      throw new Error('synthetic worker startup failure');
    }
  };

  try {
    const controller = createProcessTaskController({
        root: fakeRoot(),
        status: (message, level) => messages.push({ message, level }),
        setApplyDisabled: (value) => disabled.push(value),
      }),
      result = await controller.runWorker('../synthetic-worker.js', {});

    assert.match(result.error, /synthetic worker startup failure/);
    assert.equal(controller.isBusy(), false);
    assert.equal(disabled.at(-1), false);
    assert.match(messages.at(-1).message, /Task failed: synthetic worker startup failure/);
  } finally {
    globalThis.Worker = originalWorker;
  }
});

test('postMessage failures terminate the worker and clear busy state', async () => {
  const originalWorker = globalThis.Worker,
    disabled = [],
    messages = [];
  let instance = null;
  globalThis.Worker = class {
    constructor() {
      instance = this;
      this.terminated = false;
    }
    postMessage() {
      throw new Error('synthetic DataCloneError');
    }
    terminate() {
      this.terminated = true;
    }
  };

  try {
    const controller = createProcessTaskController({
        root: fakeRoot(),
        status: (message, level) => messages.push({ message, level }),
        setApplyDisabled: (value) => disabled.push(value),
      }),
      result = await controller.runWorker('../synthetic-worker.js', { impossible: true });

    assert.match(result.error, /synthetic DataCloneError/);
    assert.equal(controller.isBusy(), false);
    assert.equal(instance?.terminated, true);
    assert.equal(disabled.at(-1), false);
    assert.match(messages.at(-1).message, /Task failed: synthetic DataCloneError/);
  } finally {
    globalThis.Worker = originalWorker;
  }
});
