import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createExportController } = await import('../controllers/export-controller.js');
const { collectMaskExportElements } = await import('../layout-export.js');

test('Mask ROI SVG retains clipped zero-width and stroked file linework like GDS/OAS', async () => {
  const layout = {
    root: 'TOP',
    elements: [],
    linework: [
      {
        kind: 'path',
        sourceCell: 'TOP',
        layer: 1,
        datatype: 0,
        width: 0,
        points: [
          [-5, 0],
          [5, 0],
        ],
      },
      {
        kind: 'path',
        sourceCell: 'TOP',
        layer: 1,
        datatype: 0,
        width: 0.4,
        points: [
          [-5, 1.5],
          [5, 1.5],
        ],
      },
      {
        kind: 'path',
        sourceCell: 'TOP',
        layer: 1,
        datatype: 0,
        width: 0,
        points: [
          [20, 0],
          [30, 0],
        ],
      },
      {
        kind: 'path',
        sourceCell: 'OTHER',
        layer: 1,
        datatype: 0,
        width: 0,
        points: [
          [-5, -1],
          [5, -1],
        ],
      },
    ],
  };
  const maskRoi = { type: 'square', c: [0, 0], size: 4, rotation: 0 };
  const maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
  const exported = collectMaskExportElements({
    layout,
    maskSourceMode: 'file',
    maskTransform,
    maskRoi,
    selectedCells: new Set(['TOP']),
    selectedLayerKeys: new Set(['1|0']),
  });
  assert.equal(exported.elements.length, 2);
  assert.equal(exported.elements[0].kind, 'path');
  assert.equal(exported.elements[1].kind, 'polygon');
  assert.deepEqual(exported.elements[0].points, [
    [-2, 0],
    [2, 0],
  ]);

  const root = {
    body: { append() {} },
    createElement() {
      return { click() {}, remove() {} };
    },
    getElementById(id) {
      if (id === 'maskCanvas')
        return { getBoundingClientRect: () => ({ width: 320, height: 200 }) };
      if (id === 'maskExportCells') return { selectedOptions: [{ value: 'TOP' }] };
      if (id === 'maskExportLayers') return { selectedOptions: [{ value: '1|0' }] };
      return null;
    },
  };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalTimeout = globalThis.setTimeout;
  let downloaded;
  try {
    URL.createObjectURL = (blob) => {
      downloaded = blob;
      return 'blob:mask-roi-svg-test';
    };
    URL.revokeObjectURL = () => {};
    // The controller defers URL cleanup; avoid a long-lived timer in the unit test.
    globalThis.setTimeout = () => 0;

    const controller = createExportController({
      root,
      getState: () => ({ layout, maskRoi, maskTransform, maskSourceMode: 'file' }),
      viewport: () => ({ s: 1, cx: 0, cy: 0 }),
      worldToCanvas: ([x, y], view) => [x * view.s + view.cx, view.cy - y * view.s],
      maskPoint: ([x, y]) => [x, y],
      layerKey: (layer, datatype) => `${layer}|${datatype}`,
      layerColor: () => '#abcdef',
      status: () => {},
    });
    controller.exportMaskSvg();

    assert.ok(downloaded, 'SVG export should create a download');
    const svg = await downloaded.text();
    assert.match(svg, /<path d="M64 100L256 100" fill="none"/);
    assert.equal((svg.match(/<path /g) || []).length, 2);
    assert.match(svg, /fill="#abcdef" stroke="#abcdef"/);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.setTimeout = originalTimeout;
  }
});
