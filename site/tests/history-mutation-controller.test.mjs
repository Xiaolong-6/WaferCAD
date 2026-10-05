import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryMutationController } from '../controllers/history-mutation-controller.js';

function insertionHarness({
  chosenMode = 'branch-replay',
  replaySteps = 2,
  canReplaceCurrentVariant = true,
  capacity = () => true,
} = {}) {
  const statuses = [],
    askedActions = [];
  let checkpointCount = 0;

  const snapshotManager = {
    insertBeforeContext: () => ({
      editable: true,
      nodeId: 'step-b',
      branchId: 'main',
      branchName: 'Main',
      parentNodeId: 'step-a',
      laterStepCount: replaySteps,
      replayableTail: true,
      replaySteps: Array.from({ length: replaySteps }, (_, index) => ({
        id: `step-${index + 1}`,
        operation: {
          kind: 'record',
          label: `Replay ${index + 1}`,
          replay: { version: 1, kind: 'record' },
        },
        state: { model: { processRevision: index + 2 } },
      })),
      canReplaceCurrentVariant,
      dependentVariants: canReplaceCurrentVariant
        ? []
        : [{ id: 'child', name: 'Child', rootNodeId: 'step-b' }],
    }),
    restoreStepInput: () => true,
    canCreateVariant: () => true,
    canRecordOperation: (count = 1) => capacity(count),
    continuationContext: () => ({
      branchId: 'main',
      cursorNodeId: 'step-a',
      snapshotId: null,
    }),
    activeBranch: () => ({ id: 'main', name: 'Main' }),
  };

  const controller = createHistoryMutationController({
    snapshotManager,
    getProcessPanelController: () => ({
      canReplayOperation: () => true,
      replayOperations: async () => ({ ok: true, completed: replaySteps }),
    }),
    confirmationDialog: {
      ask: async ({ actions }) => {
        askedActions.push(...actions.map((action) => action.value));
        return chosenMode;
      },
      confirm: async () => true,
    },
    checkpointWorkspace: async () => {
      checkpointCount += 1;
    },
    status: (message, level) => statuses.push({ message, level }),
  });

  return {
    controller,
    snapshotManager,
    askedActions,
    statuses,
    get checkpointCount() {
      return checkpointCount;
    },
  };
}

test('Insert before offers all safe strategies when the tail is replayable', async () => {
  const harness = insertionHarness({ chosenMode: 'branch-start', replaySteps: 2 });
  const node = {
    id: 'step-b',
    replayable: true,
    displayLabel: 'Deposit ITO · Directional · 0.2 µm',
    operation: {
      kind: 'add',
      replay: { version: 1, params: { type: 'add' } },
    },
  };

  assert.equal(await harness.controller.beginInsert(node), true);
  assert.deepEqual(harness.askedActions, [
    'cancel',
    'current-replay',
    'branch-replay',
    'branch-start',
  ]);
  assert.equal(harness.controller.currentInsert().mode, 'branch-start');
  assert.equal(harness.checkpointCount, 1);
});

test('Carry-later insertion rechecks capacity for the inserted Step plus full replay tail', async () => {
  let maximumAllowed = 3;
  const harness = insertionHarness({
    chosenMode: 'branch-replay',
    replaySteps: 2,
    capacity: (count) => count <= maximumAllowed,
  });
  const node = {
    id: 'step-b',
    replayable: true,
    displayLabel: 'Deposit ITO · Directional · 0.2 µm',
    operation: {
      kind: 'add',
      replay: { version: 1, params: { type: 'add' } },
    },
  };

  assert.equal(await harness.controller.beginInsert(node), true);
  assert.equal(harness.controller.currentInsert().mode, 'branch-replay');

  maximumAllowed = 1;
  assert.equal(await harness.controller.beforeApply(), false);
  assert.match(harness.statuses.at(-1)?.message || '', /capacity was exhausted/i);
  assert.equal(harness.statuses.at(-1)?.level, 'error');
});

test('Start-from-here insertion only requires capacity for the new Step', async () => {
  const harness = insertionHarness({
    chosenMode: 'branch-start',
    replaySteps: 4,
    capacity: (count) => count <= 1,
  });
  const node = {
    id: 'step-b',
    replayable: true,
    displayLabel: 'Deposit ITO · Directional · 0.2 µm',
    operation: {
      kind: 'add',
      replay: { version: 1, params: { type: 'add' } },
    },
  };

  assert.equal(await harness.controller.beginInsert(node), true);
  assert.equal(harness.askedActions.includes('branch-replay'), false);
  assert.equal(harness.askedActions.includes('branch-start'), true);

  const gate = await harness.controller.beforeApply();
  assert.equal(gate.historyStepInsert, true);
  assert.equal(gate.mode, 'branch-start');
});

test('failed replay restores the pre-edit transaction and closes the persistence interaction gate', async () => {
  const statuses = [];
  let restoredTransaction = null,
    beginCount = 0,
    endCount = 0,
    transactionId = 0;

  const snapshotManager = {
    stepEditContext: () => ({
      editable: true,
      nodeId: 'step-b',
      branchId: 'main',
      branchName: 'Main',
      parentNodeId: 'step-a',
      downstreamCount: 2,
      downstreamReplayable: true,
      canReplaceCurrentVariant: true,
      dependentVariants: [],
      downstream: [
        {
          id: 'step-c',
          operation: { kind: 'record', label: 'Replay C', replay: { version: 1, kind: 'record' } },
          state: { model: { processRevision: 3 } },
        },
        {
          id: 'step-d',
          operation: { kind: 'record', label: 'Replay D', replay: { version: 1, kind: 'record' } },
          state: { model: { processRevision: 4 } },
        },
      ],
    }),
    restoreStepInput: () => true,
    restoreActiveBranchHead: () => true,
    continuationContext: () => ({
      branchId: 'main',
      cursorNodeId: 'step-a',
      snapshotId: null,
    }),
    canRecordOperation: () => true,
    canCreateVariant: () => true,
    activeBranch: () => ({ id: 'main', name: 'Main' }),
    replaceBranchTailFrom: () => true,
  };

  const controller = createHistoryMutationController({
    snapshotManager,
    getProcessPanelController: () => ({
      canReplayOperation: () => true,
      loadOperationForEdit: () => true,
      replayOperations: async () => ({
        ok: false,
        completed: 1,
        failedOperation: { kind: 'add', label: 'Deposit ITO' },
        error: 'The selected process area is empty.',
      }),
    }),
    confirmationDialog: {
      ask: async () => 'replace-replay',
      confirm: async () => true,
    },
    checkpointWorkspace: async () => {},
    captureReplayTransaction: () => ({ id: ++transactionId }),
    restoreReplayTransaction: (transaction) => {
      restoredTransaction = transaction;
      return true;
    },
    beginReplayInteraction: () => {
      beginCount += 1;
    },
    endReplayInteraction: () => {
      endCount += 1;
    },
    status: (message, level) => statuses.push({ message, level }),
  });

  const node = {
    id: 'step-b',
    replayable: true,
    displayLabel: 'Deposit oxide',
    operation: { kind: 'add', replay: { version: 1, params: { type: 'add' } } },
  };

  assert.equal(await controller.beginEdit(node), true);
  const gate = await controller.beforeApply();
  assert.equal(gate.mode, 'replace-replay');

  assert.equal(await controller.afterApply({ applyGate: gate }), true);
  assert.deepEqual(restoredTransaction, { id: 1 });
  assert.equal(beginCount, 1);
  assert.equal(endCount, 1);
  assert.match(statuses.at(-1)?.message || '', /Original Variant restored/);
});
