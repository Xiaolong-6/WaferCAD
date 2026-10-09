import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectController } from '../controllers/project-controller.js';

test('New Project does not clear workspace when Recovery checkpoint is unavailable', async () => {
  const controls = new Map();
  const root = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, {});
      return controls.get(id);
    },
  };
  const statusMessages = [];
  let resetCount = 0;
  let clearCount = 0;
  const controller = createProjectController({
    root,
    confirmAction: async () => true,
    checkpointBeforeReplace: async () => false,
    resetProjectState: () => {
      resetCount += 1;
    },
    snapshotManager: {
      clear: () => {
        clearCount += 1;
      },
    },
    status: (message, kind) => statusMessages.push({ message, kind }),
  });

  controller.bind();
  await root.getElementById('newProjectBtn').onclick();

  assert.equal(resetCount, 0);
  assert.equal(clearCount, 0);
  assert.match(statusMessages.at(-1)?.message || '', /checkpoint was not created/i);
  assert.equal(statusMessages.at(-1)?.kind, 'error');
});

test('Read-only tab may reset volatile New Project without touching owner storage', async () => {
  const controls = new Map();
  const root = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, {});
      return controls.get(id);
    },
  };
  let checkpointCount = 0;
  let resetCount = 0;
  let clearCount = 0;
  const controller = createProjectController({
    root,
    confirmAction: async () => true,
    allowVolatileNewProject: () => true,
    checkpointBeforeReplace: async () => {
      checkpointCount += 1;
      return false;
    },
    resetProjectState: () => {
      resetCount += 1;
    },
    snapshotManager: {
      clear: () => {
        clearCount += 1;
      },
    },
    resetRoughDraftControls: () => {},
    clearRoiDrawingMode: () => {},
    clearMaskRoiDrawingMode: () => {},
    syncBaseControls: () => {},
    renderAll: () => {},
    renderSnapshots: () => {},
    fit3d: () => {},
    status: () => {},
  });
  controller.bind();
  await root.getElementById('newProjectBtn').onclick();
  assert.equal(checkpointCount, 0);
  assert.equal(resetCount, 1);
  assert.equal(clearCount, 1);
});

function openSafetyHarness(checkpointBeforeReplace) {
  const operations = [];
  const controller = createProjectController({
    root: { getElementById: () => ({}) },
    checkpointBeforeReplace: async (...args) => {
      operations.push(['checkpoint', ...args]);
      return checkpointBeforeReplace(...args);
    },
    readProjectFileTask: async () => ({ name: 'Imported', snapshots: [] }),
    loadProjectSnapshot: () => {
      operations.push(['load']);
      // Stop after proving the ordering, without needing DOM/renderer setup.
      throw new Error('test stopped immediately after loading begins');
    },
    status: (message, kind) => operations.push(['status', message, kind]),
  });
  return { controller, operations };
}

test('in-workspace Project Open fails closed if checkpoint returns false', async () => {
  const { controller, operations } = openSafetyHarness(() => false);
  const opened = await controller.openProjectFile({ name: 'incoming.wafercad' });

  assert.equal(opened, false);
  assert.deepEqual(operations.map((event) => event[0]), ['checkpoint', 'status']);
  assert.equal(operations[0][1], 'pre-open-project');
  assert.match(operations[1][1], /Recovery checkpoint was not created/);
});

test('in-workspace Project Open fails closed if checkpoint throws', async () => {
  const { controller, operations } = openSafetyHarness(() => {
    throw new Error('IndexedDB write failed');
  });
  assert.equal(await controller.openProjectFile({ name: 'incoming.wafercad' }), false);
  assert.deepEqual(operations.map((event) => event[0]), ['checkpoint', 'status']);
  assert.match(operations[1][1], /IndexedDB write failed/);
});

test('Project Open proceeds only after checkpoint success', async () => {
  const { controller, operations } = openSafetyHarness(() => true);
  assert.equal(await controller.openProjectFile({ name: 'incoming.wafercad' }), false);
  assert.deepEqual(operations.slice(0, 2), [['checkpoint', 'pre-open-project'], ['load']]);
});

test('already-protected Welcome Project Open avoids a second, not-ready checkpoint', async () => {
  const { controller, operations } = openSafetyHarness(() => false);
  assert.equal(
    await controller.openProjectFile(
      { name: 'incoming.wafercad' },
      { startupProtected: true },
    ),
    false,
  );
  assert.deepEqual(operations.map((event) => event[0]), ['load', 'status']);
});

test('Layout Open passes explicit startup context into the checked importer', async () => {
  const calls = [];
  const controller = createProjectController({
    root: { getElementById: () => ({}) },
    importLayoutBuffer: async (...args) => {
      calls.push(args);
      return { format: 'OASIS' };
    },
    status: () => {},
  });
  const file = {
    name: 'mask.oas',
    size: 8,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
  assert.equal(await controller.openLayoutFile(file), true);
  assert.equal(await controller.openLayoutFile(file, { startupProtected: true }), true);
  assert.deepEqual(calls.map((args) => args[3]), [
    { startupProtected: false },
    { startupProtected: true },
  ]);
});
