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
