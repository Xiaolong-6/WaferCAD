import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createDrawMaskController } = await import('../controllers/draw-mask-controller.js');
const { createMaskRoiController } = await import('../controllers/mask-roi-controller.js');

test('Mask public ports use optional v2 callbacks without constructing controller UI', () => {
  let changed = 0;
  let mask = {
      nextShapeId: 3,
      shapes: [
        { id: 'shape-1', type: 'rect', a: [0, 0], b: [4, 2] },
        { id: 'shape-2', type: 'circle', c: [8, 0], r: 1 },
      ],
    },
    mode = 'draw',
    summary = 0;
  const events = [],
    sync = [],
    fields = new Map([
      ['drawShapeCx', { value: '2' }],
      ['drawShapeCy', { value: '1' }],
      ['drawShapeWidth', { value: '4' }],
      ['drawShapeHeight', { value: '2' }],
    ]);
  const controller = createDrawMaskController({
    root: {
      getElementById: (id) => fields.get(id),
      createElement: () => {
        throw Error('Controller must not build v2 UI');
      },
    },
    getMode: () => mode,
    setMode: (value) => {
      mode = value;
    },
    getDrawMask: () => mask,
    setDrawMask: (value) => {
      mask = value;
    },
    manualMicron: Number,
    renderMask: () => {},
    status: () => {},
    onMaskChanged: () => {
      changed += 1;
    },
    onUiSync: (value) => sync.push(value),
    onEditorSync: (kind, shape) => events.push({ kind, shape }),
    syncSourceSummary: () => {
      summary++;
    },
  });
  controller.openEditor(mask.shapes[0]);
  assert.equal(controller.getSelectedId(), 'shape-1');
  assert.equal(events[0].kind, 'open');
  const original = structuredClone(mask);
  controller.applyEditor();
  assert.deepEqual(mask, original, 'an unchanged edit preserves exact sub-grid geometry');
  assert.equal(changed, 0, 'an unchanged edit does not dirty a Mask project');
  fields.get('drawShapeCx').value = '2.0001';
  controller.applyEditor();
  assert.equal(mask.shapes[0].id, 'shape-1');
  assert.ok(Math.abs(mask.shapes[0].a[0] - 0.0001) < 1e-12);
  assert.equal(changed, 1);
  controller.removeSelected();
  assert.deepEqual(
    mask.shapes.map((shape) => shape.id),
    ['shape-2'],
  );
  assert.equal(sync.at(-1).selected, null);
  controller.setTool('polygon');
  assert.equal(controller.getTool(), 'polygon');
  const before = structuredClone(mask);
  controller.setSourceMode('file');
  assert.equal(mode, 'file');
  assert.deepEqual(mask, before);
  assert.equal(summary, sync.length);
});

test('Legacy Mask defaults retain source/toolbar sync; ROI callback is opt-in', () => {
  const nodes = new Map([
    ['drawMaskToolbar', {}],
    ['maskFileControls', {}],
    ['maskDrawInfo', {}],
    ['maskSourceToggleBtn', {}],
    ['drawShapeEditor', {}],
    ['drawMaskDeleteBtn', {}],
    ['drawMaskClearBtn', {}],
  ]);
  createDrawMaskController({
    root: { getElementById: (id) => nodes.get(id), querySelectorAll: () => [] },
    getMode: () => 'draw',
    getDrawMask: () => ({ nextShapeId: 1, shapes: [] }),
  }).syncUi();
  assert.equal(nodes.get('drawMaskToolbar').hidden, false);
  assert.equal(nodes.get('maskFileControls').hidden, true);
  assert.equal(nodes.get('drawMaskDeleteBtn').disabled, true);
  assert.equal(nodes.get('drawMaskClearBtn').disabled, true);
  const roi = { type: 'circle', c: [1, 2], r: 3 };
  let received;
  createMaskRoiController({
    root: {
      getElementById: () => {
        throw Error('v2 callback owns fields');
      },
    },
    getRoi: () => roi,
    onEditorSync: (value) => {
      received = value;
    },
  }).syncEditor();
  assert.equal(received, roi);
});
