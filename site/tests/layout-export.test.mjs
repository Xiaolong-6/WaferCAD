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
