import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanRenderers } from '../plan-renderers.js';

function fixture(selected, mapPoint = (point) => point) {
  const calls = [];
  const ctx = {
    clearRect() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo(...args) {
      calls.push(['move', ...args]);
    },
    lineTo(...args) {
      calls.push(['line', ...args]);
    },
    closePath() {
      calls.push(['close']);
    },
    fill(...args) {
      calls.push(['fill', ...args]);
    },
    stroke() {
      calls.push(['stroke']);
    },
  };
  const polygons = [
    [
      [0, 0],
      [20, 0],
      [20, 5],
      [0, 5],
    ],
    [
      [0, 15],
      [20, 15],
      [20, 20],
      [0, 20],
    ],
    [
      [0, 5],
      [5, 5],
      [5, 15],
      [0, 15],
    ],
    [
      [15, 5],
      [20, 5],
      [20, 15],
      [15, 15],
    ],
    [
      [0, 16],
      [20, 16],
      [20, 19],
      [0, 19],
    ],
  ];
  const layout = {
    elements: [
      ...polygons.map((points) => ({
        kind: 'polygon',
        layer: 12,
        datatype: 0,
        sourceCell: 'Chip2',
        points,
      })),
      {
        kind: 'polygon',
        layer: 2,
        datatype: 0,
        sourceCell: 'Chip2',
        points: [
          [0, 5],
          [20, 5],
          [20, 6],
          [0, 6],
        ],
      },
    ],
    linework: [],
    maskPresentation: {
      background: '#fff',
      showStructure: false,
      showUnselected: false,
      layers: [
        {
          layer: 12,
          datatype: 0,
          color: '#65a9cf',
          opacity: 0.62,
          mode: 'fill',
          sourceElementCount: 5,
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
  };
  const original = JSON.stringify(layout.elements);
  const state = {
    maskSourceMode: 'file',
    readOnlyPreview: true,
    layout,
    selectedLayerKeys: selected,
  };
  const renderers = createPlanRenderers({
    root: { getElementById: () => ({}) },
    getState: () => state,
    getDrawMaskController: () => null,
    getMaskRoiController: () => null,
    setupCanvas: () => ({ ctx, w: 400, h: 300 }),
    viewport: () => ({ cx: 0, cy: 0, s: 1 }),
    worldToCanvas: mapPoint,
    maskPoint: (p) => p,
    selectedElement: (e) => selected.includes(`${e.layer}|${e.datatype}`),
    layerKey: (l, d) => `${l}|${d}`,
    layerColor: () => '#777777',
    drawPlanAxes: () => {},
    canvasTheme: false,
  });
  return { calls, ctx, state, original, renderers };
}

test('5 overlapping GDS fragments render as one union with a genuine hole and no seams', () => {
  const x = fixture(['12|0']);
  x.renderers.renderMask();
  assert.deepEqual(
    x.calls.filter((c) => c[0] === 'fill'),
    [['fill', 'evenodd']],
  );
  assert.equal(x.calls.filter((c) => c[0] === 'close').length, 2);
  assert.equal(x.calls.filter((c) => c[0] === 'stroke').length, 0);
  assert.equal(JSON.stringify(x.state.layout.elements), x.original);
});
test('separate layer 2 remains selectable and visible without altering layer 12', () => {
  const x = fixture(['12|0', '2|0']);
  x.renderers.renderMask();
  assert.deepEqual(
    x.calls.filter((c) => c[0] === 'fill'),
    [['fill', 'evenodd'], ['fill']],
  );
  assert.equal(x.calls.filter((c) => c[0] === 'stroke').length, 1);
  assert.equal(JSON.stringify(x.state.layout.elements), x.original);
});
test('stale source count disables cached silhouette instead of painting stale holes', () => {
  const x = fixture(['12|0']);
  x.state.layout.maskPresentation.layers[0].sourceElementCount = 999;
  x.renderers.renderMask();
  assert.deepEqual(
    x.calls.filter((c) => c[0] === 'fill'),
    [['fill', 'nonzero']],
  );
  assert.equal(x.calls.filter((c) => c[0] === 'close').length, 5);
});

test('Path2D builds the merged contour once and composes exact affine mask transforms', () => {
  const previous = globalThis.Path2D;
  const instances = [];
  class FakePath2D {
    constructor() {
      this.calls = [];
      instances.push(this);
    }
    moveTo(...coords) {
      this.calls.push(['move', ...coords]);
    }
    lineTo(...coords) {
      this.calls.push(['line', ...coords]);
    }
    closePath() {
      this.calls.push(['close']);
    }
  }
  globalThis.Path2D = FakePath2D;
  try {
    const x = fixture(['12|0'], ([px, py]) => [10 + 2 * px - py, 20 + px / 2 + 3 * py]);
    x.ctx.transform = (...args) => x.calls.push(['transform', ...args]);
    x.renderers.renderMask();
    x.renderers.renderMask();
    assert.equal(instances.length, 1, 'same silhouette uses cached native geometry');
    assert.equal(instances[0].calls.filter((c) => c[0] === 'close').length, 2);
    assert.deepEqual(
      x.calls.filter((c) => c[0] === 'transform'),
      [
        ['transform', 2, 0.5, -1, 3, 10, 20],
        ['transform', 2, 0.5, -1, 3, 10, 20],
      ],
    );
    assert.deepEqual(
      x.calls.filter((c) => c[0] === 'fill'),
      [
        ['fill', instances[0], 'evenodd'],
        ['fill', instances[0], 'evenodd'],
      ],
    );
    assert.equal(x.calls.filter((c) => c[0] === 'stroke').length, 0);
    assert.equal(JSON.stringify(x.state.layout.elements), x.original);
    x.state.layout.maskPresentation.layers[0].silhouette = structuredClone(
      x.state.layout.maskPresentation.layers[0].silhouette,
    );
    x.renderers.renderMask();
    assert.equal(instances.length, 2, 'new silhouette identity invalidates native cache');
  } finally {
    if (previous === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previous;
  }
});
