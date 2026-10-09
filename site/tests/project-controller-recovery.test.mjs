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
