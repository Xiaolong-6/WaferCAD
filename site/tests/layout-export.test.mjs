import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { flattenGDS, parseGDS } = await import('../gds.js');
const { parseOAS } = await import('../oasis.js');
const { collectMaskExportElements, serializeGDS, serializeOASIS } = await import('../layout-export.js');

function bounds(elements) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const element of elements) {
    for (const [x, y] of element.points || []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

test('Mask layout export applies Cell/Layer filters and crops geometry to Mask ROI', async () => {
  const layout = {
    root: 'TOP',
    elements: [
      {
        kind: 'polygon',
        sourceCell: 'TOP',
        layer: 1,
        datatype: 0,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      },
      {
        kind: 'polygon',
        sourceCell: 'OTHER',
        layer: 2,
        datatype: 0,
        points: [
          [20, 20],
          [30, 20],
          [30, 30],
          [20, 30],
        ],
      },
    ],
    linework: [],
  };
  const selected = collectMaskExportElements({
    layout,
    maskSourceMode: 'file',
    maskTransform: { x: 2, y: -1, scale: 1, rotation: 0 },
    maskRoi: { type: 'square', c: [5, 5], size: 4, rotation: 0 },
    selectedCells: new Set(['TOP']),
    selectedLayerKeys: new Set(['1|0']),
  });
  assert.equal(selected.roiApplied, true);
  assert.ok(selected.elements.length > 0);
  assert.ok(selected.elements.every((element) => element.layer === 1 && element.datatype === 0));
  assert.deepEqual(bounds(selected.elements), { minX: 5, minY: 2, maxX: 9, maxY: 6 });

  const gds = parseGDS(serializeGDS(selected.elements).buffer);
  const gdsFlat = flattenGDS(gds, gds.root);
  const gdsBounds = bounds(gdsFlat.elements);
  assert.ok(Math.abs(gdsBounds.minX - 5) <= 0.00011);
  assert.ok(Math.abs(gdsBounds.maxX - 9) <= 0.00011);
  assert.equal(new Set(gdsFlat.elements.map((element) => `${element.layer}|${element.datatype}`)).size, 1);

  const oas = await parseOAS(serializeOASIS(selected.elements).buffer);
  const oasFlat = flattenGDS(oas, oas.root);
  const oasBounds = bounds(oasFlat.elements);
  assert.ok(Math.abs(oasBounds.minY - 2) <= 0.00011);
  assert.ok(Math.abs(oasBounds.maxY - 6) <= 0.00011);
});

test('Draw Mask ring exports as hole-free GDS/OAS polygons instead of filling the center', async () => {
  const exported = collectMaskExportElements({
    maskSourceMode: 'draw',
    drawMask: {
      nextShapeId: 2,
      shapes: [{ id: 'shape-1', type: 'ring', c: [0, 0], innerR: 2, outerR: 4 }],
    },
    maskRoi: { type: 'circle', c: [0, 0], r: 3 },
  });
  assert.equal(exported.roiApplied, true);
  assert.ok(exported.elements.length > 4);
  assert.ok(exported.elements.every((element) => element.kind === 'polygon'));

  const gds = flattenGDS(parseGDS(serializeGDS(exported.elements).buffer), 'WAFERCAD_EXPORT');
  assert.ok(gds.elements.length > 4);
  const oasParsed = await parseOAS(serializeOASIS(exported.elements).buffer);
  const oas = flattenGDS(oasParsed, oasParsed.root);
  assert.ok(oas.elements.length > 4);
});

test('Mask GDS/OAS export rejects geometry below each format DBU precision', () => {
  const gdsTinyPolygon = [
    {
      kind: 'polygon',
      layer: 1,
      datatype: 0,
      points: [
        [0, 0],
        [0.00004, 0],
        [0.00004, 0.00004],
      ],
    },
  ];
  assert.throws(() => serializeGDS(gdsTinyPolygon), /collapses at the selected .* database unit/);

  const oasTinyPolygon = [
    {
      kind: 'polygon',
      layer: 1,
      datatype: 0,
      points: [
        [0, 0],
        [0.00002, 0],
        [0.00002, 0.00002],
      ],
    },
  ];
  assert.throws(() => serializeOASIS(oasTinyPolygon), /collapses at the selected .* database unit/);

  const gdsTinyPath = [
    {
      kind: 'path',
      layer: 2,
      datatype: 0,
      width: 0,
      points: [
        [0, 0],
        [0.00004, 0],
      ],
    },
  ];
  assert.throws(() => serializeGDS(gdsTinyPath), /path collapses at the selected .* database unit/);

  const oasTinyPath = [
    {
      kind: 'path',
      layer: 2,
      datatype: 0,
      width: 0,
      points: [
        [0, 0],
        [0.00002, 0],
      ],
    },
  ];
  assert.throws(() => serializeOASIS(oasTinyPath), /path collapses at the selected .* database unit/);
});

test('OASIS preserves a 0.1 nm PATH width exactly through integer half-width encoding', async () => {
  const source = [
    {
      kind: 'path',
      layer: 3,
      datatype: 0,
      width: 0.0001,
      points: [
        [0, 0],
        [1, 0],
      ],
    },
  ];
  const parsed = await parseOAS(serializeOASIS(source).buffer),
    flat = flattenGDS(parsed, parsed.root);
  assert.equal(flat.elements.length, 1);
  assert.ok(Math.abs(flat.elements[0].width - 0.0001) <= 1e-12);
});

test('OASIS preserves large non-negative layer numbers while GDSII rejects INT2 overflow', async () => {
  const elements = [
    {
      kind: 'polygon',
      layer: 40000,
      datatype: 17,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    },
  ];

  assert.throws(() => serializeGDS(elements), /cannot represent layer\/datatype 40000\/17/);

  const parsed = await parseOAS(serializeOASIS(elements).buffer),
    flat = flattenGDS(parsed, parsed.root);
  assert.equal(flat.elements.length, 1);
  assert.equal(flat.elements[0].layer, 40000);
  assert.equal(flat.elements[0].datatype, 17);
});

test('layout export rejects negative layer or datatype instead of silently remapping to zero', () => {
  const polygon = {
    kind: 'polygon',
    layer: -1,
    datatype: 0,
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  };
  assert.throws(() => serializeGDS([polygon]), /layer is invalid/);
  assert.throws(() => serializeOASIS([polygon]), /layer is invalid/);

  polygon.layer = 1;
  polygon.datatype = -2;
  assert.throws(() => serializeGDS([polygon]), /datatype is invalid/);
  assert.throws(() => serializeOASIS([polygon]), /datatype is invalid/);
});
