import assert from 'node:assert/strict';
import test from 'node:test';

import { createProcessTaskController } from '../controllers/process-task-controller.js';

function fakeRoot() {
  const elements = new Map(
    ['processTaskDialog', 'processTaskTitle', 'processTaskStage', 'processTaskElapsed'].map(
      (id) => [id, { hidden: true, textContent: '' }],
    ),
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

test('grouped task keeps one busy transaction across multiple worker steps', async () => {
  const originalWorker = globalThis.Worker,
    disabled = [];
  let workerCount = 0;

  globalThis.Worker = class {
    constructor() {
      workerCount += 1;
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
    }
    postMessage(message) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            id: message.id,
            type: 'progress',
            stage: 'Synthetic progress',
          },
        });
        this.onmessage?.({
          data: {
            id: message.id,
            type: 'done',
            result: { changed: true },
            model: message.model || {},
          },
        });
      });
    }
    terminate() {
      this.terminated = true;
    }
  };

  try {
    const controller = createProcessTaskController({
        root: fakeRoot(),
        status: () => {},
        setApplyDisabled: (value) => disabled.push(value),
      }),
      result = await controller.runTask(
        async ({ runWorker, updateStage }) => {
          updateStage('Step 1/2');
          const first = await runWorker(
            '../synthetic-worker.js',
            { model: { revision: 1 } },
            {
              stagePrefix: 'Step 1/2',
            },
          );
          assert.equal(first.result.changed, true);

          updateStage('Step 2/2');
          const second = await runWorker(
            '../synthetic-worker.js',
            { model: { revision: 2 } },
            {
              stagePrefix: 'Step 2/2',
            },
          );
          assert.equal(second.result.changed, true);
          return { ok: true, completed: 2 };
        },
        { label: 'Grouped replay' },
      );

    assert.deepEqual(result, { ok: true, completed: 2 });
    assert.equal(workerCount, 2);
    assert.deepEqual(disabled, [true, false]);
    assert.equal(controller.isBusy(), false);
  } finally {
    globalThis.Worker = originalWorker;
  }
});

test('validated process workers survive idle inspection and abort discards the reused worker', async () => {
  const originalWorker = globalThis.Worker,
    workers = [];
  globalThis.Worker = class {
    constructor() {
      workers.push(this);
      this.terminated = false;
    }
    postMessage(message) {
      if (message.params.hold) return;
      queueMicrotask(() =>
        this.onmessage({
          data: {
            id: message.id,
            type: 'done',
            validated: true,
            model: message.model,
            result: { changed: true },
          },
        }),
      );
    }
    terminate() {
      this.terminated = true;
    }
  };
  const controller = createProcessTaskController({ root: fakeRoot(), status: () => {} });
  try {
    await controller.run({ revision: 1 }, {});
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, false);
    await controller.run({ revision: 2 }, {});
    assert.equal(workers.length, 1);
    const pending = controller.run({ revision: 3 }, { hold: true });
    controller.abort();
    assert.equal((await pending).aborted, true);
    assert.equal(workers[0].terminated, true);
    await controller.run({ revision: 4 }, {});
    assert.equal(workers.length, 2);
  } finally {
    controller.dispose();
    globalThis.Worker = originalWorker;
  }
});
