import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSnapshotManager,
  defaultSnapshotName,
  MAX_SNAPSHOTS,
} from '../workspace-snapshots.js';

test('snapshot default name uses local timestamp', () => {
  const fixedTime = new Date(2026, 8, 29, 14, 36, 8);
  assert.equal(defaultSnapshotName(fixedTime), '2026-09-29 14:36:08');
});

test('snapshot records are immutable checkpoints and can be renamed/restored/deleted', () => {
  const fixedTime = new Date(2026, 8, 29, 14, 36, 8);
  let live = { value: 1, nested: { keep: true } };
  let restored = null;
  let id = 0;

  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      restored = value;
    },
    validateState: (value) => typeof value?.value === 'number',
    now: () => fixedTime,
    idFactory: () => `snapshot-${++id}`,
  });

  const saved = manager.create();
  assert.equal(saved.name, '2026-09-29 14:36:08');
  assert.equal(manager.list().length, 1);

  live.nested.keep = false;
  assert.equal(manager.restore(saved.id), true);
  assert.deepEqual(restored, { value: 1, nested: { keep: true } });

  assert.equal(manager.rename(saved.id, 'Before etch'), true);
  assert.equal(manager.list()[0].name, 'Before etch');
  assert.equal(manager.rename(saved.id, '   '), false);

  const exported = manager.exportRecords();
  exported[0].state.value = 99;
  manager.restore(saved.id);
  assert.equal(restored.value, 1);

  assert.equal(manager.remove(saved.id), true);
  assert.equal(manager.list().length, 0);
});

test('snapshot import rejects invalid and duplicate records', () => {
  const manager = createSnapshotManager({
    capture: () => ({ value: 0 }),
    restore: () => {},
    validateState: (value) => typeof value?.value === 'number',
  });

  const count = manager.importRecords([
    { id: 'a', name: 'A', createdAt: '2026-09-29T12:00:00Z', state: { value: 1 } },
    { id: 'a', name: 'duplicate', createdAt: '2026-09-29T12:00:00Z', state: { value: 2 } },
    { id: 'bad', name: 'Bad', createdAt: 'nope', state: { broken: true } },
  ]);

  assert.equal(count, 1);
  assert.deepEqual(
    manager.list().map((item) => item.id),
    ['a'],
  );
});

test('snapshot manager never creates more records than the project schema can persist', () => {
  let id = 0;
  const manager = createSnapshotManager({
    capture: () => ({ value: 1 }),
    restore: () => {},
    validateState: () => true,
    idFactory: () => `snapshot-${++id}`,
  });

  for (let i = 0; i < MAX_SNAPSHOTS; i++) manager.create();
  assert.equal(manager.list().length, MAX_SNAPSHOTS);
  assert.throws(() => manager.create(), /Snapshot limit of 100 reached/);
});


test('snapshot manager shares unchanged large model and layout assets internally', () => {
  const model = { revision: 7, processRevision: 3, payload: { heavy: [1, 2, 3] } };
  const elements = [{ kind: 'polygon', points: [[0, 0], [1, 0], [1, 1]] }];
  const layout = {
    name: 'large-mask.gds',
    root: 'TOP',
    elements,
    linework: [],
    combos: [],
    hierarchy: { TOP: [] },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
  const live = { model, layout, view: { zoom: 1 } };
  let id = 0;
  const manager = createSnapshotManager({
    capture: () => ({
      ...live,
      layout: {
        ...layout,
        elements: layout.elements,
        linework: layout.linework,
        combos: layout.combos,
        hierarchy: layout.hierarchy,
        units: layout.units,
      },
    }),
    restore: () => {},
    validateState: () => true,
    idFactory: () => `snapshot-${++id}`,
  });

  manager.create('one');
  manager.create('two');
  const exported = manager.exportRecords();

  assert.strictEqual(exported[0].state.layout, exported[1].state.layout);
  assert.strictEqual(exported[0].state.model, exported[1].state.model);
});


test('snapshot preserves Draw mask source independently from imported layout assets', () => {
  let live = {
    maskSourceMode: 'draw',
    drawMask: {
      nextShapeId: 2,
      shapes: [{ id: 'shape-1', type: 'rect', a: [-1, -1], b: [1, 1] }],
    },
  };
  let restored = null;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      restored = value;
    },
    validateState: () => true,
    idFactory: () => 'draw-snapshot',
  });

  manager.create('Draw mask');
  live.drawMask.shapes[0].b[0] = 9;
  assert.equal(manager.restore('draw-snapshot'), true);
  assert.equal(restored.maskSourceMode, 'draw');
  assert.deepEqual(restored.drawMask.shapes[0].b, [1, 1]);
});


test('snapshot branches keep independent heads and restore the selected branch head', () => {
  let live = { value: 1 };
  const restored = [];
  let snapshotId = 0;
  let branchId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      restored.push(value);
      live = value;
    },
    validateState: (value) => typeof value?.value === 'number',
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
  });

  const base = manager.create('Shared process');
  live = { value: 2 };
  const mainHead = manager.create('Planar');

  const branch = manager.createBranch(base.id, 'Black silicon');
  assert.equal(manager.activeBranch().id, branch.id);
  assert.equal(manager.switchBranch(branch.id), true);
  assert.equal(live.value, 1);

  live = { value: 3 };
  const blackSiliconHead = manager.create('Rough etch');
  assert.equal(blackSiliconHead.parentId, base.id);
  assert.equal(blackSiliconHead.branchId, branch.id);

  assert.equal(manager.switchBranch('main'), true);
  assert.equal(live.value, 2);
  assert.equal(manager.activeBranch().headSnapshotId, mainHead.id);

  assert.equal(manager.switchBranch(branch.id), true);
  assert.equal(live.value, 3);
  assert.equal(manager.activeBranch().headSnapshotId, blackSiliconHead.id);
  assert.ok(restored.length >= 3);
});

test('snapshot branch state round-trips and legacy snapshots become a linear Main branch', () => {
  let live = { value: 1 };
  let snapshotId = 0;
  let branchId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => typeof value?.value === 'number',
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
  });

  const base = manager.create('Base');
  const branch = manager.createBranch(base.id, 'Variant');
  manager.switchBranch(branch.id);
  live = { value: 2 };
  const child = manager.create('Variant step');

  const records = manager.exportRecords();
  const branchState = manager.exportBranchState();

  const imported = createSnapshotManager({
    capture: () => ({ value: 0 }),
    restore: () => {},
    validateState: (value) => typeof value?.value === 'number',
  });
  assert.equal(imported.importRecords(records, branchState), 2);
  assert.equal(imported.activeBranch().id, branch.id);
  assert.equal(imported.activeBranch().headSnapshotId, child.id);
  assert.equal(imported.list().find((record) => record.id === child.id).parentId, base.id);

  const legacy = createSnapshotManager({
    capture: () => ({ value: 0 }),
    restore: () => {},
    validateState: (value) => typeof value?.value === 'number',
  });
  legacy.importRecords([
    { id: 'new', name: 'New', createdAt: '2026-10-03T10:01:00Z', state: { value: 2 } },
    { id: 'old', name: 'Old', createdAt: '2026-10-03T10:00:00Z', state: { value: 1 } },
  ]);
  const legacyRecords = legacy.list();
  assert.equal(legacyRecords.find((record) => record.id === 'old').parentId, null);
  assert.equal(legacyRecords.find((record) => record.id === 'new').parentId, 'old');
  assert.equal(legacy.activeBranch().id, 'main');
  assert.equal(legacy.activeBranch().headSnapshotId, 'new');
});

test('deleting a branch point reparents descendants without leaving dangling heads', () => {
  let live = { value: 1 };
  let snapshotId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: () => {},
    validateState: () => true,
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => 'variant',
  });

  const first = manager.create('First');
  live = { value: 2 };
  const second = manager.create('Second');
  const branch = manager.createBranch(second.id, 'Variant');
  manager.switchBranch(branch.id);
  live = { value: 3 };
  const child = manager.create('Child');

  assert.equal(manager.remove(second.id), true);
  assert.equal(manager.list().find((record) => record.id === child.id).parentId, first.id);
  assert.equal(manager.listBranches().find((item) => item.id === branch.id).rootSnapshotId, first.id);
});


test('V2 process history records Apply nodes and attaches snapshots as milestones', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let snapshotId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    idFactory: () => `snapshot-${++snapshotId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'oxide' };
  const first = manager.recordOperation({ kind: 'add', label: 'Deposit oxide' });
  assert.equal(first.parentId, null);
  assert.equal(first.processRevision, 1);
  assert.equal(manager.activeBranch().headNodeId, first.id);

  const milestone = manager.create('After oxide');
  assert.equal(milestone.historyNodeId, first.id);

  live = { model: { processRevision: 2 }, value: 'etch' };
  const second = manager.recordOperation({ kind: 'etch', label: 'Etch active window' });
  assert.equal(second.parentId, first.id);
  assert.equal(manager.listHistory().length, 2);
  assert.equal(manager.exportBranchState().version, 2);
});

test('restoring an older milestone requires a branch before another Apply', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let snapshotId = 0;
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'oxide' };
  const oxideNode = manager.recordOperation({ kind: 'add', label: 'Deposit oxide' });
  const oxide = manager.create('After oxide');

  live = { model: { processRevision: 2 }, value: 'planar' };
  const planarNode = manager.recordOperation({ kind: 'add', label: 'Planar continuation' });
  assert.equal(manager.continuationContext(), null);

  assert.equal(manager.restore(oxide.id), true);
  assert.equal(live.value, 'oxide');
  assert.equal(manager.continuationContext().snapshotId, oxide.id);
  assert.throws(
    () => manager.recordOperation({ kind: 'etch', label: 'Unsafe rewrite' }),
    /new branch is required/i,
  );

  const variant = manager.createBranchFromCursor('Black silicon');
  assert.equal(manager.activeBranch().id, variant.id);
  assert.equal(manager.activeBranch().rootNodeId, oxideNode.id);

  live = { model: { processRevision: 2 }, value: 'black-silicon' };
  const rough = manager.recordOperation({ kind: 'etch', label: 'Rough etch' });
  assert.equal(rough.parentId, oxideNode.id);

  assert.equal(manager.switchBranch('main'), true);
  assert.equal(live.value, 'planar');
  assert.equal(manager.activeBranch().headNodeId, planarNode.id);

  assert.equal(manager.switchBranch(variant.id), true);
  assert.equal(live.value, 'black-silicon');
  assert.equal(manager.activeBranch().headNodeId, rough.id);
});

test('Undo cursor can branch without a pre-existing milestone', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let snapshotId = 0;
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1' };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  live = { model: { processRevision: 2 }, value: 'step-2' };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });

  assert.equal(manager.syncCursorToProcessRevision(1), true);
  assert.equal(manager.continuationContext().cursorNodeId, first.id);

  live = { model: { processRevision: 1 }, value: 'step-1' };
  const branch = manager.createBranchFromCursor('Undo continuation');
  assert.equal(manager.activeBranch().id, branch.id);
  assert.equal(manager.list().some((record) => record.historyNodeId === first.id), true);
});
