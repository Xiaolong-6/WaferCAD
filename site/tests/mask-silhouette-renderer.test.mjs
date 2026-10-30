import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanRenderers } from '../plan-renderers.js';

function fixture(selectedLayerKeys) {
  const calls = [];
  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    closePath: () => calls.push(['closePath']),
    fill: (...args) => calls.push(['fill', ...args]),
    stroke: () => calls.push(['stroke']),
  };
  const canvas = {};
  const layer12 = {
    kind: 'polygon',
    sourceCell: 'Chip2',
    layer: 12,
    datatype: 0,
    points: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
  };
  const layer2 = {
    kind: 'polygon',
    sourceCell: 'Chip2',
    layer: 2,
    datatype: 0,
    points: [
      [0, 5],
      [20, 5],
      [20, 6],
      [0, 6],
    ],
  };
  const state = {
    maskSourceMode: 'file',
    readOnlyPreview: true,
    layout: {
      elements: [layer12, layer2],
      linework: [],
      maskPresentation: {
        background: '#fff',
        showStructure: false,
        showUnselected: false,
        layers: [
          {
            layer: 12,
            datatype: 0,
            mode: 'fill',
            color: '#65a9cf',
            opacity: 0.62,
            sourceElementCount: 1,
            silhouette: [
              [
                [
                  [0, 0],
                  [20, 0],
                  [20, 20],
                  [0, 20],
                  [0, 0],
                ],
                [
                  [5, 5],
                  [5, 15],
                  [15, 15],
                  [15, 5],
                  [5, 5],
                ],
              ],
            ],
          },
        ],
      },
    },
    selectedLayerKeys,
  };
  const before = JSON.stringify(state.layout.elements);
  const renderer = createPlanRenderers({
    root: { getElementById: () => canvas },
    getState: () => state,
    getDrawMaskController: () => null,
    getMaskRoiController: () => null,
    setupCanvas: () => ({ ctx, w: 400, h: 300 }),
    viewport: () => ({ cx: 0, cy: 0, s: 1 }),
    worldToCanvas: (point) => point,
    selectedElement: (e) => selectedLayerKeys.includes(`${e.layer}|${e.datatype}`),
    maskPoint: (p) => p,
    layerKey: (l, d) => `${l}|${d}`,
    layerColor: () => '#777777',
    drawPlanAxes: () => {},
    canvasTheme: false,
  });
  return { renderer, calls, state, before };
}

test('real Mask renderer fills pre-unioned L12 once and preserves genuine holes', () => {
  const item = fixture(['12|0']);
  item.renderer.renderMask();
  assert.deepEqual(
    item.calls.filter((x) => x[0] === 'fill'),
    [['fill', 'evenodd']],
  );
  assert.equal(item.calls.filter((x) => x[0] === 'stroke').length, 0);
  assert.equal(item.calls.filter((x) => x[0] === 'closePath').length, 2);
  assert.equal(JSON.stringify(item.state.layout.elements), item.before);
});

test('real Mask renderer retains unstyled L2 and uses source geometry rather than silhouette', () => {
  const item = fixture(['12|0', '2|0']);
  item.renderer.renderMask();
  assert.equal(item.calls.filter((x) => x[0] === 'fill').length, 2);
  assert.equal(item.calls.filter((x) => x[0] === 'stroke').length, 1);
  assert.equal(JSON.stringify(item.state.layout.elements), item.before);
});

test('real Mask renderer does not use stale union with a mismatched source count', () => {
  const item = fixture(['12|0']);
  item.state.layout.maskPresentation.layers[0].sourceElementCount = 13;
  item.renderer.renderMask();
  assert.deepEqual(
    item.calls.filter((x) => x[0] === 'fill'),
    [['fill', 'nonzero']],
  );
  assert.equal(item.calls.filter((x) => x[0] === 'closePath').length, 1);
});
