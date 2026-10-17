import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryMutationController } from '../../controllers/history-mutation-controller.js';

// Faults are injected at the controller boundary: these cases verify the
// mutation gate without pretending that a mocked store is IndexedDB itself.
function fixture(kind, checkpointWorkspace, replayFailure = null, restoreFailure = null) {
  let graph = {
    model: { revision: 8, layerIds: ['base', 'oxide-front', 'oxide-back'] },
    variants: [
      { id: 'main', head: 'step-d', nodes: ['step-a', 'step-b', 'step-c', 'step-d'] },
      { id: 'child', head: 'step-b', nodes: ['step-a', 'step-b'] },
    ],
    recovery: { checkpoint: 'pre-edit', revision: 8 },
  };
  const original = structuredClone(graph);
  const events = [];
  const tail = ['step-c', 'step-d'].map((id) => ({
    id,
    operation: { kind: 'record', label: id, replay: { version: 1 } },
    state: {},
  }));
  const context = {
    editable: true,
    branchId: 'main',
    branchName: 'Main',
    parentNodeId: 'step-a',
    downstreamCount: tail.length,
    downstreamReplayable: true,
    downstream: tail,
    laterStepCount: tail.length,
    replayableTail: true,
    replaySteps: tail,
    canReplaceCurrentVariant: true,
    dependentVariants: [],
  };
  const snapshotManager = {
    stepEditContext: () => context,
    insertBeforeContext: () => context,
    restoreStepInput: () => {
      events.push('restore-input');
      return true;
    },
    restoreActiveBranchHead: () => true,
    continuationContext: () => ({ branchId: 'main', cursorNodeId: 'step-a' }),
    canCreateVariant: () => true,
    canRecordOperation: () => true,
    activeBranch: () => ({ name: 'Main', id: 'main' }),
  };
  const controller = createHistoryMutationController({
    snapshotManager,
    getProcessPanelController: () => ({
      canReplayOperation: () => true,
      loadOperationForEdit: () => true,
      replayOperations: async () => {
        events.push('replay');
        graph.model.layerIds.push('orphan-from-partial-replay');
        graph.variants[0].head = 'partial';
        graph.variants.push({ id: 'broken-child', head: 'partial', nodes: [] });
        if (replayFailure === 'throw') throw new Error('worker unavailable');
        return {
          ok: false,
          completed: 1,
          failedOperation: { label: 'step-d' },
          error: 'injected failure at second replay step',
        };
      },
    }),
    confirmationDialog: {
      ask: async () => (kind === 'insert' ? 'current-replay' : 'replace-replay'),
    },
    checkpointWorkspace: async (reason) => {
      events.push('checkpoint');
      return checkpointWorkspace(reason);
    },
    captureReplayTransaction: () => {
      events.push('capture');
      return structuredClone(graph);
    },
    restoreReplayTransaction: (transaction) => {
      events.push('rollback');
      if (restoreFailure === 'throw') throw new Error('rollback unavailable');
      if (restoreFailure === 'decline') return false;
      graph = structuredClone(transaction);
      return true;
    },
    beginReplayInteraction: () => events.push('begin-interaction'),
    endReplayInteraction: () => events.push('end-interaction'),
    markProjectDirty: () => events.push('dirty'),
    status: (message, level) => events.push({ message, level }),
  });
  const node = {
    id: 'step-b',
    replayable: true,
    displayLabel: 'Oxide',
    operation: { kind: 'add', replay: { version: 1, params: {} } },
  };
  return {
    controller,
    node,
    original,
    events,
    get graph() {
      return graph;
    },
  };
}

for (const kind of ['edit', 'insert']) {
  for (const failure of ['declined', 'quota', 'io']) {
    test(`History ${kind} fails closed before modifying state when checkpoint is ${failure}`, async () => {
      const writer = () => {
        if (failure === 'declined') return false;
        if (failure === 'quota')
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        throw new Error('IndexedDB transaction aborted');
      };
      const run = fixture(kind, writer);
      const accepted =
        kind === 'edit'
          ? await run.controller.beginEdit(run.node)
          : await run.controller.beginInsert(run.node);
      assert.equal(accepted, false);
      assert.deepEqual(run.graph, run.original);
      assert.deepEqual(
        run.events.filter((event) => typeof event === 'string'),
        ['checkpoint'],
      );
      assert.equal(run.controller.currentEdit(), null);
      assert.equal(run.controller.currentInsert(), null);
      assert.equal(run.events.at(-1).level, 'error');
      assert.match(run.events.at(-1).message, /Recovery checkpoint/i);
    });
  }

  for (const failure of ['reject', 'throw']) {
    test(`History ${kind} restores all Variant heads after partial replay ${failure}`, async () => {
      const run = fixture(kind, () => true, failure);
      const accepted =
        kind === 'edit'
          ? await run.controller.beginEdit(run.node)
          : await run.controller.beginInsert(run.node);
      assert.equal(accepted, true);
      const gate = await run.controller.beforeApply();
      assert.equal(gate.mode, kind === 'edit' ? 'replace-replay' : 'current-replay');
      assert.equal(await run.controller.afterApply({ applyGate: gate }), true);
      assert.deepEqual(
        run.graph,
        run.original,
        'including Layer IDs, child heads and Recovery metadata',
      );
      assert.deepEqual(
        run.events.filter((event) =>
          ['begin-interaction', 'replay', 'rollback', 'end-interaction'].includes(event),
        ),
        ['begin-interaction', 'replay', 'rollback', 'end-interaction'],
      );
      assert.equal(run.controller.currentEdit(), null);
      assert.equal(run.controller.currentInsert(), null);
      assert.match(run.events.at(-1).message, /Original Variant restored/i);
      assert.notEqual(run.events.at(-1).level, 'success');
    });
  }
}

for (const kind of ['edit', 'insert']) {
  for (const failure of ['throw', 'decline']) {
    test(`History ${kind} never claims success if in-memory rollback ${failure}s`, async () => {
      const run = fixture(kind, () => true, 'throw', failure);
      assert.equal(
        await (kind === 'edit'
          ? run.controller.beginEdit(run.node)
          : run.controller.beginInsert(run.node)),
        true,
      );
      const gate = await run.controller.beforeApply();
      assert.equal(await run.controller.afterApply({ applyGate: gate }), true);
      assert.notDeepEqual(
        run.graph,
        run.original,
        'failed rollback may leave volatile state mutated',
      );
      assert.deepEqual(
        run.events.filter((event) => event === 'begin-interaction' || event === 'end-interaction'),
        ['begin-interaction', 'end-interaction'],
      );
      assert.equal(run.controller.currentEdit(), null);
      assert.equal(run.controller.currentInsert(), null);
      assert.equal(run.events.at(-1).level, 'error');
      assert.match(run.events.at(-1).message, /Automatic rollback failed.*Recovery checkpoint/i);
      assert.doesNotMatch(run.events.at(-1).message, /Original Variant restored/i);
    });
  }
}
