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
  assert.throws(() => manager.create(), /Milestone limit of 100 reached/);
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

test('branch origin milestones are protected and deleting a leaf variant keeps its origin', () => {
  let live = { value: 1 };
  let snapshotId = 0;
  let branchId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: () => true,
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
  });

  manager.create('First');
  live = { value: 2 };
  const origin = manager.create('Second');
  const branch = manager.createBranch(origin.id, 'Variant');
  manager.switchBranch(branch.id);
  live = { value: 3 };
  const child = manager.create('Child');

  assert.deepEqual(
    manager.branchesUsingSnapshot(origin.id).map((item) => item.name),
    ['Variant'],
  );
  assert.equal(manager.remove(origin.id), false);

  const removed = manager.removeBranch(branch.id);
  assert.equal(removed.name, 'Variant');
  assert.equal(manager.activeBranch().id, 'main');
  assert.equal(live.value, 2);
  assert.equal(manager.list().some((record) => record.id === child.id), false);
  assert.equal(manager.list().some((record) => record.id === origin.id), true);
  assert.equal(manager.remove(origin.id), true);
});

test('variant deletion requires child variants to be removed first', () => {
  let live = { value: 1 };
  let snapshotId = 0;
  let branchId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: () => true,
    idFactory: () => `snapshot-${++snapshotId}`,
    branchIdFactory: () => `branch-${++branchId}`,
  });

  const origin = manager.create('Origin');
  const parent = manager.createBranch(origin.id, 'Parent');
  manager.switchBranch(parent.id);
  live = { value: 2 };
  const childOrigin = manager.create('Child origin');
  const child = manager.createBranch(childOrigin.id, 'Child');

  assert.throws(() => manager.removeBranch(parent.id), /child variants/i);
  assert.equal(manager.removeBranch(child.id).name, 'Child');
  assert.equal(manager.removeBranch(parent.id).name, 'Parent');
  assert.equal(manager.listBranches().length, 1);
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
  assert.equal(manager.exportBranchState().version, 3);
});

test('process History pins and restores the exact file-mask Cell and Layer combination', () => {
  let live = {
    model: { processRevision: 1 },
    layout: { root: 'TOP', hierarchy: { TOP: { children: [] } } },
    maskSourceMode: 'file',
    activeCell: 'STALE',
    selectedLayerKeys: ['99|0'],
    maskTransform: { x: 4, y: 5, scale: 2, rotation: 10 },
    maskRoi: { type: 'rect', a: [0, 0], b: [1, 1] },
  };
  let restored = null;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      restored = value;
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => 'process-mask-context',
  });

  const maskContext = {
    sourceMode: 'file',
    cell: 'TOP',
    layerKeys: ['7|0', '8|2'],
    transform: { x: 1, y: -2, scale: 1.5, rotation: 12 },
    roi: { type: 'square', c: [5, 5], size: 4, rotation: 0 },
  };
  const node = manager.recordOperation({
    kind: 'add',
    label: 'Deposit ITO',
    areaMode: 'mask',
    areaLabel: 'Selected mask',
    maskContext,
    replay: { version: 1, areaMode: 'mask', maskContext },
  });

  const listed = manager.listHistory().find((item) => item.id === node.id);
  assert.equal(
    listed.areaLabel,
    'Selected mask · Cell TOP · Layers 7/0, 8/2',
  );

  live = {
    ...live,
    activeCell: 'OTHER',
    selectedLayerKeys: ['42|0'],
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskRoi: null,
  };
  assert.equal(manager.restoreProcessNode(node.id), true);
  assert.equal(restored.activeCell, 'TOP');
  assert.deepEqual(restored.selectedLayerKeys, ['7|0', '8|2']);
  assert.deepEqual(restored.maskTransform, maskContext.transform);
  assert.deepEqual(restored.maskRoi, maskContext.roi);
});

test('process history steps are directly restorable without milestones and survive import', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1' };
  const first = manager.recordOperation({ kind: 'add', label: 'Deposit first' });
  live = { model: { processRevision: 2 }, value: 'step-2' };
  manager.recordOperation({ kind: 'add', label: 'Deposit second' });

  assert.equal(manager.list().length, 0);
  assert.equal(manager.listHistory().find((node) => node.id === first.id).restorable, true);
  assert.equal(manager.restoreProcessNode(first.id), true);
  assert.equal(live.value, 'step-1');
  assert.equal(manager.continuationContext().processLabel, 'Deposit first');

  const branchState = manager.exportBranchState();
  const imported = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });
  imported.importRecords([], branchState);

  live = { model: { processRevision: 99 }, value: 'changed' };
  assert.equal(imported.restoreProcessNode(first.id), true);
  assert.equal(live.value, 'step-1');
  assert.equal(imported.listHistory().find((node) => node.id === first.id).restorable, true);
});

test('legacy process nodes remain readable and use a milestone state when one exists', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });

  const milestoneState = { model: { processRevision: 1 }, value: 'legacy-step' };
  manager.importRecords(
    [
      {
        id: 'snapshot-legacy',
        name: 'Legacy checkpoint',
        createdAt: '2026-10-03T10:00:00.000Z',
        branchId: 'main',
        parentId: null,
        historyNodeId: 'process-1',
        state: milestoneState,
      },
    ],
    {
      version: 2,
      activeBranchId: 'main',
      cursorNodeId: 'process-2',
      cursorSnapshotId: null,
      nodes: [
        {
          id: 'process-1',
          branchId: 'main',
          parentId: null,
          createdAt: '2026-10-03T10:00:00.000Z',
          processRevision: 1,
          operation: { kind: 'add', label: 'Legacy first' },
        },
        {
          id: 'process-2',
          branchId: 'main',
          parentId: 'process-1',
          createdAt: '2026-10-03T10:01:00.000Z',
          processRevision: 2,
          operation: { kind: 'add', label: 'Legacy head' },
        },
      ],
      branches: [
        {
          id: 'main',
          name: 'Main',
          rootSnapshotId: 'snapshot-legacy',
          headSnapshotId: 'snapshot-legacy',
          rootNodeId: 'process-1',
          headNodeId: 'process-2',
          headState: { model: { processRevision: 2 }, value: 'legacy-head' },
          createdAt: '1970-01-01T00:00:00.000Z',
        },
      ],
    },
  );

  const history = manager.listHistory();
  assert.equal(history.find((node) => node.id === 'process-1').restorable, true);
  assert.equal(history.find((node) => node.id === 'process-2').restorable, true);
  assert.equal(manager.restoreProcessNode('process-1'), true);
  assert.equal(live.value, 'legacy-step');
});

test('advancing a legacy branch preserves the previous HEAD restore state', () => {
  let live = { model: { processRevision: 2 }, value: 'legacy-head' };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `new-process-${++nodeId}`,
  });

  manager.importRecords([], {
    version: 2,
    activeBranchId: 'main',
    cursorNodeId: 'process-2',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Legacy first' },
      },
      {
        id: 'process-2',
        branchId: 'main',
        parentId: 'process-1',
        createdAt: '2026-10-03T10:01:00.000Z',
        processRevision: 2,
        operation: { kind: 'add', label: 'Legacy head' },
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-2',
        headState: { model: { processRevision: 2 }, value: 'legacy-head' },
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  });

  assert.equal(manager.listHistory().find((node) => node.id === 'process-2').restorable, true);

  live = { model: { processRevision: 3 }, value: 'new-head' };
  manager.recordOperation({ kind: 'etch', label: 'New step' });

  live = { model: { processRevision: 99 }, value: 'changed' };
  assert.equal(manager.restoreProcessNode('process-2'), true);
  assert.equal(live.value, 'legacy-head');
});

test('deleting the last legacy milestone on a process node preserves restore capability', () => {
  let live = { model: { processRevision: 1 }, value: 'legacy-step' };
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });

  manager.importRecords(
    [
      {
        id: 'legacy-milestone',
        name: 'Legacy checkpoint',
        createdAt: '2026-10-03T10:00:30.000Z',
        branchId: 'main',
        parentId: null,
        historyNodeId: 'process-1',
        state: { model: { processRevision: 1 }, value: 'legacy-step' },
      },
    ],
    {
      version: 2,
      activeBranchId: 'main',
      cursorNodeId: 'process-2',
      cursorSnapshotId: null,
      nodes: [
        {
          id: 'process-1',
          branchId: 'main',
          parentId: null,
          createdAt: '2026-10-03T10:00:00.000Z',
          processRevision: 1,
          operation: { kind: 'add', label: 'Legacy step' },
        },
        {
          id: 'process-2',
          branchId: 'main',
          parentId: 'process-1',
          createdAt: '2026-10-03T10:01:00.000Z',
          processRevision: 2,
          operation: { kind: 'add', label: 'Legacy head' },
        },
      ],
      branches: [
        {
          id: 'main',
          name: 'Main',
          rootSnapshotId: null,
          headSnapshotId: null,
          rootNodeId: 'process-1',
          headNodeId: 'process-2',
          headState: { model: { processRevision: 2 }, value: 'legacy-head' },
          createdAt: '1970-01-01T00:00:00.000Z',
        },
      ],
    },
  );

  assert.equal(manager.listHistory().find((node) => node.id === 'process-1').restorable, true);
  assert.equal(manager.remove('legacy-milestone'), true);
  assert.equal(manager.list().length, 0);
  assert.equal(manager.listHistory().find((node) => node.id === 'process-1').restorable, true);

  live = { model: { processRevision: 99 }, value: 'changed' };
  assert.equal(manager.restoreProcessNode('process-1'), true);
  assert.equal(live.value, 'legacy-step');
  assert.equal(manager.exportBranchState().version, 3);
});

test('legacy history only upgrades to v3 when every process node is restorable', () => {
  let live = { model: { processRevision: 2 }, value: 'legacy-head' };
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });

  manager.importRecords([], {
    version: 2,
    activeBranchId: 'main',
    cursorNodeId: 'process-2',
    cursorSnapshotId: null,
    nodes: [
      {
        id: 'process-1',
        branchId: 'main',
        parentId: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        processRevision: 1,
        operation: { kind: 'add', label: 'Legacy unavailable' },
      },
      {
        id: 'process-2',
        branchId: 'main',
        parentId: 'process-1',
        createdAt: '2026-10-03T10:01:00.000Z',
        processRevision: 2,
        operation: { kind: 'add', label: 'Legacy head' },
      },
    ],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: null,
        rootNodeId: 'process-1',
        headNodeId: 'process-2',
        headState: { model: { processRevision: 2 }, value: 'legacy-head' },
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  });

  const legacyExport = manager.exportBranchState();
  assert.equal(legacyExport.version, 2);
  assert.equal(legacyExport.nodes[0].state, null);
  assert.equal(legacyExport.nodes[1].state.value, 'legacy-head');

  const milestone = {
    id: 'legacy-step-1',
    name: 'Recovered legacy step',
    createdAt: '2026-10-03T10:00:30.000Z',
    branchId: 'main',
    parentId: null,
    historyNodeId: 'process-1',
    state: { model: { processRevision: 1 }, value: 'legacy-step-1' },
  };
  manager.importRecords([milestone], legacyExport);
  const upgraded = manager.exportBranchState();
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.nodes[0].state.value, 'legacy-step-1');
  assert.equal(upgraded.nodes[1].state.value, 'legacy-head');
});

test('restoring an older milestone on the HEAD process node does not overwrite the exact HEAD state', () => {
  let live = { model: { processRevision: 1 }, value: 'process-head', view: { opacity: 0.35 } };
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

  const node = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  const milestone = manager.create('Before display edit');

  live = { model: { processRevision: 1 }, value: 'process-head', view: { opacity: 0.2 } };
  assert.equal(manager.syncActiveHeadState(), true);

  assert.equal(manager.restore(milestone.id), true);
  assert.equal(manager.continuationContext().cursorNodeId, node.id);
  assert.equal(manager.continuationContext().snapshotId, milestone.id);
  assert.equal(live.view.opacity, 0.35);
  assert.equal(manager.syncActiveHeadState(), false);

  // Persistence while detached must not promote the restored milestone into HEAD.
  manager.exportBranchState();
  assert.equal(manager.restoreActiveBranchHead(), true);
  assert.equal(live.view.opacity, 0.2);
});

test('history browsing distinguishes an exact restored state from edited historical work', () => {
  let live = { model: { processRevision: 0 }, value: 'base', view: { zoom: 1 } };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1', view: { zoom: 1 } };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  live = { model: { processRevision: 2 }, value: 'step-2', view: { zoom: 1 } };
  manager.recordOperation({ kind: 'add', label: 'Step 2' });

  assert.equal(manager.restoreProcessNode(first.id), true);
  assert.equal(manager.hasHistoricalWorkingEdits(), false);

  live.view.zoom = 2;
  assert.equal(manager.hasHistoricalWorkingEdits(), true);

  manager.create('Edited historical milestone');
  assert.equal(manager.hasHistoricalWorkingEdits(), false);

  assert.equal(manager.restoreActiveBranchHead(), true);
  assert.equal(manager.hasHistoricalWorkingEdits(), false);

  assert.equal(manager.restoreProcessNode(first.id), true);
  assert.equal(manager.hasHistoricalWorkingEdits(), false);
});

test('reloaded historical working edits remain distinguishable from the canonical process state', () => {
  let live = { model: { processRevision: 0 }, value: 'base', view: { zoom: 1 } };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1', view: { zoom: 1 } };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  live = { model: { processRevision: 2 }, value: 'step-2', view: { zoom: 1 } };
  manager.recordOperation({ kind: 'add', label: 'Step 2' });

  manager.restoreProcessNode(first.id);
  live.view.zoom = 2;
  const persistedWorkingState = structuredClone(live);
  const branchState = manager.exportBranchState();

  let reloadedLive = persistedWorkingState;
  const reloaded = createSnapshotManager({
    capture: () => reloadedLive,
    restore: (value) => {
      reloadedLive = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });
  reloaded.importRecords([], branchState);

  assert.ok(reloaded.continuationContext());
  assert.equal(reloaded.hasHistoricalWorkingEdits(), true);
});

test('branching from a restored Step uses the Step itself as the Variant origin', () => {
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
  const bookmark = manager.bookmarkStep(first.id, 'Named step 1');
  live = { model: { processRevision: 2 }, value: 'step-2' };
  manager.recordOperation({ kind: 'add', label: 'Step 2' });

  assert.equal(manager.restoreProcessNode(first.id), true);
  const before = manager.list().length;
  const variant = manager.createBranchFromCursor('Variant from process row');

  assert.equal(manager.list().length, before);
  assert.equal(manager.list().some((record) => record.id === bookmark.id), true);
  assert.equal(variant.rootSnapshotId, null);
  assert.equal(variant.rootNodeId, first.id);
  assert.equal(variant.parentBranchId, 'main');
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
    /new variant is required/i,
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
  assert.equal(branch.rootNodeId, first.id);
  assert.equal(branch.parentBranchId, 'main');
  assert.equal(manager.list().some((record) => record.historyNodeId === first.id), false);
});



test('HEAD state tracks non-process edits without advancing process history', () => {
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

  const base = manager.create('Base');
  live = { model: { processRevision: 1 }, value: 'process-head' };
  manager.recordOperation({ kind: 'add', label: 'Step 1' });

  live = { model: { processRevision: 1 }, value: 'edited-head-view' };
  assert.equal(manager.syncActiveHeadState(), true);

  const variant = manager.createBranch(base.id, 'Temporary');
  manager.switchBranch(variant.id);
  assert.equal(live.value, 'base');

  manager.switchBranch('main');
  assert.equal(live.value, 'edited-head-view');
  assert.equal(manager.listHistory().length, 1);
});

test('historical working edits seed an automatic continuation variant', () => {
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

  live = { model: { processRevision: 1 }, value: 'milestone-state' };
  manager.recordOperation({ kind: 'add', label: 'Step 1' });
  const milestone = manager.create('Fork point');
  live = { model: { processRevision: 2 }, value: 'main-head' };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });

  manager.restore(milestone.id);
  live = { model: { processRevision: 1 }, value: 'historical-working-edit' };
  const variant = manager.createBranchFromCursor();

  manager.switchBranch('main');
  assert.equal(live.value, 'main-head');
  manager.switchBranch(variant.id);
  assert.equal(live.value, 'historical-working-edit');
});

test('Undo branching keeps bookmarks as annotations instead of Variant structure', () => {
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
  const firstBookmark = manager.bookmarkStep(first.id, 'After step 1');
  live = { model: { processRevision: 2 }, value: 'step-2' };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });
  manager.bookmarkCurrentStep('After step 2');

  manager.syncCursorToProcessRevision(1);
  live = { model: { processRevision: 1 }, value: 'step-1' };
  const before = manager.list().length;
  const variant = manager.createBranchFromCursor('Undo variant');

  assert.equal(manager.list().length, before);
  assert.equal(manager.list().some((record) => record.id === firstBookmark.id), true);
  assert.equal(variant.rootSnapshotId, null);
  assert.equal(variant.rootNodeId, first.id);
  assert.equal(variant.parentBranchId, 'main');
  assert.equal(manager.list().some((record) => /branch point/i.test(record.name)), false);
});

test('Variant tree records explicit parent linkage and supports direct rename', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1' };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  live = { model: { processRevision: 2 }, value: 'step-2' };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });

  const variant = manager.createBranchFromNode(first.id);
  assert.equal(variant.rootNodeId, first.id);
  assert.equal(variant.parentBranchId, 'main');
  assert.equal(variant.rootSnapshotId, null);
  assert.equal(manager.renameBranch(variant.id, 'Detector path'), true);
  assert.equal(
    manager.listBranches().find((item) => item.id === variant.id).name,
    'Detector path',
  );

  live = { model: { processRevision: 2 }, value: 'variant-step' };
  const childStep = manager.recordOperation({ kind: 'add', label: 'Variant step' });
  const child = manager.createBranchFromNode(childStep.id, 'Child path');
  assert.equal(child.parentBranchId, variant.id);
  assert.equal(child.rootNodeId, childStep.id);
});

test('inspection-only view changes do not count as historical working edits', () => {
  let live = {
    model: { processRevision: 0, regions: [] },
    layout: { name: 'L' },
    roi: null,
    section: { a: [-1, 0], b: [1, 0] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 } },
    display: { threeCamera: null, sectionCollapse: null },
  };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { ...live, model: { processRevision: 1, regions: ['a'] } };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });

  live = { ...live, model: { processRevision: 2, regions: ['a', 'b'] } };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });

  assert.equal(manager.restoreProcessNode(first.id), true);
  live = {
    ...live,
    roi: { type: 'rect', a: [-0.2, -0.2], b: [0.2, 0.2] },
    section: { a: [-0.4, 0], b: [0.4, 0] },
    planViews: { main: { zoom: 6, panX: 10, panY: -2 } },
    display: {
      threeCamera: { position: [4, -5, 6], target: [0, 0, 0], fov: 34 },
      sectionCollapse: { top: 0.8, bottom: -0.8 },
    },
  };
  assert.equal(manager.hasHistoricalWorkingEdits(), false);

  live = {
    ...live,
    layout: { name: 'Changed layout' },
  };
  assert.equal(manager.hasHistoricalWorkingEdits(), true);
});

test('bookmarking a historical Step keeps its process state but captures the current inspection view', () => {
  let live = {
    model: { processRevision: 0 },
    value: 'base',
    roi: null,
    section: { a: [-1, 0], b: [1, 0] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 } },
    display: { sectionCollapse: null, threeCamera: null },
  };
  let snapshotId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    idFactory: () => `bookmark-${++snapshotId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = {
    ...live,
    model: { processRevision: 1 },
    value: 'step-1',
  };
  const first = manager.recordOperation({ kind: 'add', label: 'Step 1' });

  live = {
    ...live,
    model: { processRevision: 2 },
    value: 'step-2',
  };
  manager.recordOperation({ kind: 'etch', label: 'Step 2' });

  assert.equal(manager.restoreProcessNode(first.id), true);
  live = {
    ...live,
    roi: { type: 'rect', a: [-0.2, -0.2], b: [0.2, 0.2] },
    section: { a: [-0.4, 0], b: [0.4, 0] },
    planViews: { main: { zoom: 4, panX: 12, panY: -3 } },
    display: {
      sectionCollapse: { top: 0.8, bottom: -0.8 },
      threeCamera: {
        position: [3, -4, 5],
        target: [0, 0, 0],
        fov: 34,
      },
    },
  };

  const bookmark = manager.bookmarkStep(first.id, 'Micro inspection');
  live = {
    model: { processRevision: 99 },
    value: 'changed',
  };
  assert.equal(manager.restore(bookmark.id), true);
  assert.equal(live.model.processRevision, 1);
  assert.equal(live.value, 'step-1');
  assert.deepEqual(live.section, { a: [-0.4, 0], b: [0.4, 0] });
  assert.equal(live.planViews.main.zoom, 4);
  assert.deepEqual(live.display.sectionCollapse, { top: 0.8, bottom: -0.8 });
  assert.deepEqual(live.display.threeCamera.position, [3, -4, 5]);
});

test('bookmarking a Step does not create a second restore lineage', () => {
  let live = { model: { processRevision: 1 }, value: 'step-1' };
  let snapshotId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    idFactory: () => `bookmark-${++snapshotId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  const step = manager.recordOperation({ kind: 'add', label: 'Step 1' });
  const bookmark = manager.bookmarkCurrentStep('Important');
  assert.equal(bookmark.historyNodeId, step.id);
  assert.equal(manager.listHistory().length, 1);
  assert.equal(manager.list().length, 1);
  assert.equal(manager.currentPosition().nodeId, step.id);
  assert.equal(manager.currentPosition().bookmarkId, null);
});

test('automatic branches use concise Variant names and historical state can return to HEAD', () => {
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
  manager.recordOperation({ kind: 'add', label: 'Deposit oxide' });
  const milestone = manager.create('A very long descriptive process milestone');

  live = { model: { processRevision: 2 }, value: 'main-head' };
  manager.recordOperation({ kind: 'etch', label: 'Etch' });

  assert.equal(manager.restore(milestone.id), true);
  assert.equal(live.value, 'oxide');
  assert.ok(manager.continuationContext());

  assert.equal(manager.restoreActiveBranchHead(), true);
  assert.equal(live.value, 'main-head');
  assert.equal(manager.continuationContext(), null);

  manager.restore(milestone.id);
  const firstVariant = manager.createBranchFromCursor();
  assert.equal(firstVariant.name, 'Variant 1');

  manager.switchBranch('main');
  manager.restore(milestone.id);
  const secondVariant = manager.createBranchFromCursor();
  assert.equal(secondVariant.name, 'Variant 2');
});


test('legacy milestone-derived branch names normalize to concise Variants on import', () => {
  const sourceState = { model: { processRevision: 1 }, value: 'source' };
  const manager = createSnapshotManager({
    capture: () => sourceState,
    restore: () => {},
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });

  const records = [
    {
      id: 'snapshot-source',
      name: '00 | n++ Si substrate; 350um assumed',
      createdAt: '2026-10-03T10:00:00.000Z',
      branchId: 'main',
      parentId: null,
      historyNodeId: null,
      state: sourceState,
    },
  ];
  const branchState = {
    version: 2,
    activeBranchId: 'legacy-auto',
    cursorNodeId: null,
    cursorSnapshotId: 'snapshot-source',
    nodes: [],
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: 'snapshot-source',
        rootNodeId: null,
        headNodeId: null,
        headState: sourceState,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      {
        id: 'legacy-auto',
        name: '00 | n++ Si substrate; 350um assumed continuation',
        rootSnapshotId: 'snapshot-source',
        headSnapshotId: 'snapshot-source',
        rootNodeId: null,
        headNodeId: null,
        headState: sourceState,
        createdAt: '2026-10-03T10:01:00.000Z',
      },
    ],
  };

  manager.importRecords(records, branchState);
  assert.equal(manager.activeBranch().name, 'Variant 1');
  assert.equal(manager.listBranches().find((branch) => branch.id === 'main').name, 'Main');

  branchState.branches[1].name = 'Black-Si';
  manager.importRecords(records, branchState);
  assert.equal(manager.activeBranch().name, 'Black-Si');
});


test('historical Step edit restores predecessor geometry while preserving selected Step workspace context', () => {
  let live = { model: { processRevision: 0, marker: 'base' }, mask: 'base-mask' };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1, marker: 'step-1' }, mask: 'mask-1' };
  const first = manager.recordOperation({
    kind: 'add',
    label: 'Step 1',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 2, marker: 'step-2' }, mask: 'mask-2' };
  const second = manager.recordOperation({
    kind: 'etch',
    label: 'Step 2',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 3, marker: 'step-3' }, mask: 'mask-3' };
  manager.recordOperation({
    kind: 'add',
    label: 'Step 3',
    replay: { version: 1, params: {}, areaRequest: {} },
  });

  const context = manager.stepEditContext(second.id);
  assert.equal(context.editable, true);
  assert.equal(context.parentNodeId, first.id);
  assert.equal(context.downstreamCount, 1);
  assert.equal(context.downstreamReplayable, true);

  assert.ok(manager.restoreStepInput(second.id));
  assert.equal(live.model.processRevision, 1);
  assert.equal(live.model.marker, 'step-1');
  assert.equal(live.mask, 'mask-2');
  assert.equal(manager.currentPosition().nodeId, first.id);
  assert.ok(manager.continuationContext());
});

test('replaceBranchTailFrom removes the edited tail and lets a recalculated chain take its place', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1' };
  const first = manager.recordOperation({
    kind: 'add',
    label: 'Step 1',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 2 }, value: 'step-2' };
  const second = manager.recordOperation({
    kind: 'etch',
    label: 'Step 2',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 3 }, value: 'step-3' };
  manager.recordOperation({
    kind: 'add',
    label: 'Step 3',
    replay: { version: 1, params: {}, areaRequest: {} },
  });

  manager.restoreStepInput(second.id);
  const replaced = manager.replaceBranchTailFrom(second.id);
  assert.equal(replaced.removedNodeCount, 2);
  assert.deepEqual(
    manager.listHistory().map((node) => node.operation.label),
    ['Step 1'],
  );
  assert.equal(manager.activeBranch().headNodeId, first.id);

  live = { model: { processRevision: 2 }, value: 'edited-step-2' };
  manager.recordOperation({
    kind: 'etch',
    label: 'Edited Step 2',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 3 }, value: 'replayed-step-3' };
  manager.recordOperation({
    kind: 'add',
    label: 'Step 3 replayed',
    replay: { version: 1, params: {}, areaRequest: {} },
  });

  assert.deepEqual(
    manager.listHistory().map((node) => node.operation.label),
    ['Step 1', 'Edited Step 2', 'Step 3 replayed'],
  );
});

test('current Variant tail replacement is blocked when a child Variant depends on that tail', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-1' };
  manager.recordOperation({
    kind: 'add',
    label: 'Step 1',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 2 }, value: 'step-2' };
  const second = manager.recordOperation({
    kind: 'etch',
    label: 'Step 2',
    replay: { version: 1, params: {}, areaRequest: {} },
  });
  live = { model: { processRevision: 3 }, value: 'step-3' };
  const third = manager.recordOperation({
    kind: 'add',
    label: 'Step 3',
    replay: { version: 1, params: {}, areaRequest: {} },
  });

  manager.createBranchFromNode(third.id, 'Dependent child');
  manager.switchBranch('main');
  manager.restoreStepInput(second.id);

  const context = manager.stepEditContext(second.id);
  assert.equal(context.canReplaceCurrentVariant, false);
  assert.deepEqual(context.dependentVariants.map((item) => item.name), ['Dependent child']);
  assert.throws(() => manager.replaceBranchTailFrom(second.id), /child Variant/i);
});


test('truncateBranchAfter keeps the selected Step and removes only the later tail', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let nodeId = 0;
  let snapshotId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
    idFactory: () => `snapshot-${++snapshotId}`,
  });

  live = { model: { processRevision: 1 }, value: 'step-a' };
  manager.recordOperation({ kind: 'add', label: 'A', replay: { version: 1, params: {} } });
  live = { model: { processRevision: 2 }, value: 'step-b' };
  const second = manager.recordOperation({
    kind: 'etch',
    label: 'B',
    replay: { version: 1, params: {} },
  });
  live = { model: { processRevision: 3 }, value: 'step-c' };
  const third = manager.recordOperation({
    kind: 'add',
    label: 'C',
    replay: { version: 1, params: {} },
  });
  manager.bookmarkStep(third.id, 'C bookmark');

  const result = manager.truncateBranchAfter(second.id);
  assert.equal(result.removedNodeCount, 1);
  assert.equal(result.removedBookmarkCount, 1);
  assert.deepEqual(
    manager.listHistory().map((node) => node.operation.label),
    ['A', 'B'],
  );
  assert.equal(manager.activeBranch().headNodeId, second.id);
  assert.equal(manager.currentPosition().atHead, true);
  assert.equal(live.value, 'step-b');
  assert.equal(live.model.processRevision, 2);
  assert.equal(manager.list().length, 0);
});

test('removeHeadStep restores the predecessor while preserving an empty child Variant', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'main-a' };
  const origin = manager.recordOperation({
    kind: 'add',
    label: 'Main A',
    replay: { version: 1, params: {} },
  });

  const child = manager.createBranchFromNode(origin.id, 'Variant child');
  live = { model: { processRevision: 2 }, value: 'child-b' };
  const childStep = manager.recordOperation({
    kind: 'etch',
    label: 'Child B',
    replay: { version: 1, params: {} },
  });

  const removed = manager.removeHeadStep(childStep.id);
  assert.equal(removed.headNodeId, origin.id);
  assert.equal(manager.activeBranch().id, child.id);
  assert.equal(manager.activeBranch().headNodeId, origin.id);
  assert.equal(manager.activeBranch().processStepCount, 0);
  assert.equal(manager.currentPosition().atHead, true);
  assert.equal(live.value, 'main-a');
  assert.equal(live.model.processRevision, 1);
  assert.deepEqual(
    manager.listHistory().map((node) => node.operation.label),
    ['Main A'],
  );
});

test('history truncation refuses to orphan a dependent child Variant', () => {
  let live = { model: { processRevision: 0 }, value: 'base' };
  let branchId = 0;
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    branchIdFactory: () => `branch-${++branchId}`,
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = { model: { processRevision: 1 }, value: 'a' };
  manager.recordOperation({ kind: 'add', label: 'A', replay: { version: 1, params: {} } });
  live = { model: { processRevision: 2 }, value: 'b' };
  const second = manager.recordOperation({
    kind: 'etch',
    label: 'B',
    replay: { version: 1, params: {} },
  });
  live = { model: { processRevision: 3 }, value: 'c' };
  const third = manager.recordOperation({
    kind: 'add',
    label: 'C',
    replay: { version: 1, params: {} },
  });

  manager.createBranchFromNode(third.id, 'Dependent child');
  manager.switchBranch('main');

  assert.throws(
    () => manager.truncateBranchAfter(second.id),
    /dependent Variant/i,
  );
  assert.equal(manager.activeBranch().headNodeId, third.id);
  assert.deepEqual(
    manager.listHistory().map((node) => node.operation.label),
    ['A', 'B', 'C'],
  );
});


test('insertBeforeContext carries the selected Step and later replay tail with stable entity refs', () => {
  let live = {
    model: {
      processRevision: 0,
      layers: [{ id: 'base', name: 'Base' }],
      implants: [],
      electricalRegions: [],
    },
    mask: 'base',
  };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = {
    ...live,
    model: {
      ...live.model,
      processRevision: 1,
      layers: [...live.model.layers, { id: 'layer-1', name: 'Oxide' }],
    },
    mask: 'mask-a',
  };
  const first = manager.recordOperation({
    kind: 'add',
    label: 'Deposit Oxide · Directional · 0.1 µm',
    name: 'Oxide',
    thickness: 0.1,
    growth: 'direct',
    replay: {
      version: 1,
      params: { type: 'add', name: 'Oxide', thickness: 0.1, growth: 'direct' },
      areaMode: 'full',
    },
  });

  live = {
    ...live,
    model: {
      ...live.model,
      processRevision: 2,
      layers: [...live.model.layers, { id: 'layer-2', name: 'Layer 2' }],
    },
    mask: 'mask-b',
  };
  const second = manager.recordOperation({
    kind: 'add',
    label: 'Deposit Layer 2 · Directional · 0.2 µm',
    name: 'Layer 2',
    thickness: 0.2,
    growth: 'direct',
    replay: {
      version: 1,
      params: { type: 'add', name: 'Layer 2', thickness: 0.2, growth: 'direct' },
      areaMode: 'full',
    },
  });

  live = {
    ...live,
    model: { ...live.model, processRevision: 3 },
    mask: 'mask-c',
  };
  const third = manager.recordOperation({
    kind: 'grow',
    label: 'Extend Layer 2 · Conformal · 0.05 µm',
    name: 'Layer 2',
    targetLayerId: 'layer-2',
    thickness: 0.05,
    growth: 'conformal',
    replay: {
      version: 1,
      params: {
        type: 'grow',
        name: 'Layer 2',
        targetLayerId: 'layer-2',
        thickness: 0.05,
        growth: 'conformal',
      },
      areaMode: 'full',
    },
  });

  const context = manager.insertBeforeContext(second.id, { includeReplayStates: true });
  assert.equal(context.editable, true);
  assert.equal(context.parentNodeId, first.id);
  assert.equal(context.laterStepCount, 2);
  assert.equal(context.replayableTail, true);
  assert.deepEqual(
    context.replaySteps.map((step) => step.id),
    [second.id, third.id],
  );
  assert.equal(context.replaySteps[0].entityRefs.resultLayerId, 'layer-2');
  assert.equal(context.replaySteps[1].entityRefs.targetLayerId, 'layer-2');
  assert.equal(context.replaySteps[0].state.mask, 'mask-b');

  assert.ok(manager.restoreStepInput(second.id));
  assert.equal(live.model.processRevision, 1);
  assert.equal(live.mask, 'mask-b');
});

test('renaming an entity propagates through restorable History states and replay metadata', () => {
  let live = {
    model: {
      processRevision: 0,
      layers: [{ id: 'base', name: 'Base' }],
      implants: [],
      electricalRegions: [],
    },
  };
  let nodeId = 0;
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (value) => {
      live = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
    nodeIdFactory: () => `process-${++nodeId}`,
  });

  live = {
    model: {
      ...live.model,
      processRevision: 1,
      layers: [...live.model.layers, { id: 'layer-6', name: 'Layer 6' }],
    },
  };
  const deposit = manager.recordOperation({
    kind: 'add',
    label: 'Deposit Layer 6 · Directional · 0.2 µm',
    name: 'Layer 6',
    thickness: 0.2,
    growth: 'direct',
    replay: {
      version: 1,
      params: { type: 'add', name: 'Layer 6', thickness: 0.2, growth: 'direct' },
      areaMode: 'full',
    },
  });

  live = {
    model: {
      ...live.model,
      processRevision: 2,
    },
  };
  manager.recordOperation({
    kind: 'grow',
    label: 'Extend Layer 6 · Conformal · 0.05 µm',
    name: 'Layer 6',
    targetLayerId: 'layer-6',
    thickness: 0.05,
    growth: 'conformal',
    replay: {
      version: 1,
      params: {
        type: 'grow',
        name: 'Layer 6',
        targetLayerId: 'layer-6',
        thickness: 0.05,
        growth: 'conformal',
      },
      areaMode: 'full',
    },
  });

  live.model.layers.find((layer) => layer.id === 'layer-6').name = 'ITO';
  assert.ok(manager.renameHistoryEntity('layer', 'layer-6', 'ITO') > 0);

  const history = manager.listHistory();
  assert.equal(history[0].entityRefs.resultLayerId, 'layer-6');
  assert.equal(history[0].operation.name, 'ITO');
  assert.equal(history[0].operation.replay.params.name, 'ITO');
  assert.equal(history[1].operation.name, 'ITO');
  assert.equal(history[1].operation.replay.params.name, 'ITO');

  assert.equal(manager.restoreProcessNode(deposit.id), true);
  assert.equal(live.model.layers.find((layer) => layer.id === 'layer-6').name, 'ITO');

  const exported = manager.exportBranchState();
  let importedLive = structuredClone(live);
  const imported = createSnapshotManager({
    capture: () => importedLive,
    restore: (value) => {
      importedLive = value;
    },
    validateState: (value) => Number.isInteger(value?.model?.processRevision),
  });
  imported.importRecords([], exported);
  const importedDeposit = imported.listHistory().find((node) => node.id === deposit.id);
  assert.equal(importedDeposit.displayLabel, 'Deposit ITO · Directional · 0.2 µm');
  assert.equal(imported.restoreProcessNode(deposit.id), true);
  assert.equal(
    importedLive.model.layers.find((layer) => layer.id === 'layer-6').name,
    'ITO',
  );
});


test('History display labels stay scoped when independent Variants reuse the same internal layer ID', () => {
  let live = {
    model: {
      revision: 0,
      processRevision: 0,
      layers: [{ id: 'base', name: 'Base' }],
      implants: [],
      electricalRegions: [],
    },
  };
  let snapshotId = 0,
    branchId = 0,
    nodeId = 0;
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

  const origin = manager.create('Before independent deposits');

  live = {
    model: {
      ...live.model,
      revision: 1,
      processRevision: 1,
      layers: [...live.model.layers, { id: 'layer-1', name: 'Main oxide' }],
    },
  };
  manager.recordOperation({
    kind: 'add',
    label: 'Deposit Main oxide · Directional · 0.1 µm',
    name: 'Main oxide',
    thickness: 0.1,
    growth: 'direct',
    replay: {
      version: 1,
      params: { type: 'add', name: 'Main oxide', thickness: 0.1, growth: 'direct' },
      areaMode: 'full',
    },
  });

  manager.createBranch(origin.id, 'Independent');
  live = {
    model: {
      ...live.model,
      revision: 1,
      processRevision: 1,
      layers: [...live.model.layers, { id: 'layer-1', name: 'Variant metal' }],
    },
  };
  manager.recordOperation({
    kind: 'add',
    label: 'Deposit Variant metal · Directional · 0.2 µm',
    name: 'Variant metal',
    thickness: 0.2,
    growth: 'direct',
    replay: {
      version: 1,
      params: { type: 'add', name: 'Variant metal', thickness: 0.2, growth: 'direct' },
      areaMode: 'full',
    },
  });

  let history = manager.listHistory();
  assert.equal(history.length, 2);
  assert.equal(
    history.find((node) => node.branchId === 'main').displayLabel,
    'Deposit Main oxide · Directional · 0.1 µm',
  );
  assert.equal(
    history.find((node) => node.branchId === 'branch-1').displayLabel,
    'Deposit Variant metal · Directional · 0.2 µm',
  );

  live.model.layers.find((layer) => layer.id === 'layer-1').name = 'Variant ITO';
  live.model.revision += 1;
  assert.ok(manager.renameHistoryEntity('layer', 'layer-1', 'Variant ITO') > 0);

  history = manager.listHistory();
  assert.equal(
    history.find((node) => node.branchId === 'main').displayLabel,
    'Deposit Main oxide · Directional · 0.1 µm',
  );
  assert.equal(
    history.find((node) => node.branchId === 'branch-1').displayLabel,
    'Deposit Variant ITO · Directional · 0.2 µm',
  );
});


test('History insertion topology supports current rewrite, branch start, branch carry, and dependency protection', () => {
  const createChain = () => {
    let live = {
      model: {
        revision: 0,
        processRevision: 0,
        layers: [{ id: 'base', name: 'Base' }],
        implants: [],
        electricalRegions: [],
      },
      tag: 'base',
    };
    let nodeId = 0,
      branchId = 0;
    const manager = createSnapshotManager({
      capture: () => live,
      restore: (value) => {
        live = value;
      },
      validateState: (value) => Number.isInteger(value?.model?.processRevision),
      nodeIdFactory: () => `process-${++nodeId}`,
      branchIdFactory: () => `variant-${++branchId}`,
    });
    const append = (label, revision) => {
      live = {
        ...live,
        model: {
          ...live.model,
          revision,
          processRevision: revision,
        },
        tag: label,
      };
      return manager.recordOperation({
        kind: 'record',
        label,
        replay: { version: 1, kind: 'record' },
      });
    };
    const a = append('A', 1),
      b = append('B', 2),
      c = append('C', 3);
    return {
      manager,
      append,
      a,
      b,
      c,
      getLive: () => live,
      setLive: (value) => {
        live = value;
      },
    };
  };

  const current = createChain();
  assert.equal(current.manager.restoreStepInput(current.b.id), true);
  current.manager.replaceBranchTailFrom(current.b.id);
  const inserted = current.append('X', 2),
    replayedB = current.append('B', 3),
    replayedC = current.append('C', 4);
  assert.deepEqual(
    current.manager
      .listHistory()
      .filter((node) => node.branchId === 'main')
      .map((node) => node.id),
    [current.a.id, inserted.id, replayedB.id, replayedC.id],
  );

  const branchStart = createChain();
  assert.equal(branchStart.manager.restoreStepInput(branchStart.b.id), true);
  const startVariant = branchStart.manager.createBranchFromCursor('Start');
  const startInserted = branchStart.append('X', 2);
  const startBranches = branchStart.manager.listBranches(),
    startMain = startBranches.find((branch) => branch.id === 'main'),
    startChild = startBranches.find((branch) => branch.id === startVariant.id);
  assert.equal(startMain.headNodeId, branchStart.c.id);
  assert.equal(startChild.rootNodeId, branchStart.a.id);
  assert.equal(startChild.headNodeId, startInserted.id);

  const branchCarry = createChain();
  assert.equal(branchCarry.manager.restoreStepInput(branchCarry.b.id), true);
  const carryVariant = branchCarry.manager.createBranchFromCursor('Carry');
  const carryInserted = branchCarry.append('X', 2),
    carryB = branchCarry.append('B', 3),
    carryC = branchCarry.append('C', 4);
  const carryBranches = branchCarry.manager.listBranches(),
    carryMain = carryBranches.find((branch) => branch.id === 'main'),
    carryChild = carryBranches.find((branch) => branch.id === carryVariant.id);
  assert.equal(carryMain.headNodeId, branchCarry.c.id);
  assert.equal(carryChild.rootNodeId, branchCarry.a.id);
  assert.equal(carryChild.headNodeId, carryC.id);
  assert.deepEqual(
    branchCarry.manager
      .listHistory()
      .filter((node) => node.branchId === carryVariant.id)
      .map((node) => node.id),
    [carryInserted.id, carryB.id, carryC.id],
  );

  const protectedChain = createChain();
  protectedChain.manager.createBranchFromNode(protectedChain.b.id, 'Dependent');
  assert.equal(protectedChain.manager.switchBranch('main'), true);
  const protectedContext = protectedChain.manager.insertBeforeContext(protectedChain.b.id);
  assert.equal(protectedContext.canReplaceCurrentVariant, false);
  assert.equal(protectedContext.dependentVariants.length, 1);
  assert.throws(
    () => protectedChain.manager.replaceBranchTailFrom(protectedChain.b.id),
    /Create a new Variant instead/,
  );
});
