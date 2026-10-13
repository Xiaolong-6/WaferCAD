import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { flattenGDS, parseGDS } = await import('../gds.js');
const { parseOAS } = await import('../oasis.js');
const { collectMaskExportElements, serializeGDS, serializeOASIS } =
  await import('../layout-export.js');

// The same parser is not an independent external-format oracle. These
// canonical polygon comparisons strengthen the internal contract; KLayout
// compatibility remains the separately owned external acceptance gate.
const grid = (value) => Math.round(value * 10000);

function canonicalPolygon(points) {
  const ring = points.map(([x, y]) => [grid(x), grid(y)]);
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) {
    ring.pop();
  }
  const rotations = [];
  for (const ordered of [ring, [...ring].reverse()]) {
    for (let index = 0; index < ordered.length; index++) {
      rotations.push(
        [...ordered.slice(index), ...ordered.slice(0, index)]
          .map((point) => point.join(','))
          .join(';'),
      );
    }
  }
  return rotations.sort()[0];
}

function inventory(elements) {
  return elements
    .map((element) => {
      assert.equal(element.kind, 'polygon', 'unexpected path conversion');
      return `${element.layer}|${element.datatype}|${canonicalPolygon(element.points)}`;
    })
    .sort();
}

async function decode(bytes, format) {
  const parsed = format === 'gds' ? parseGDS(bytes.buffer) : await parseOAS(bytes.buffer);
  const flattened = flattenGDS(parsed, parsed.root);
  assert.deepEqual(flattened.warnings, [], 'no references may be silently skipped');
  return flattened.elements;
}

function exportBytes(elements, format) {
  return format === 'gds' ? serializeGDS(elements) : serializeOASIS(elements);
}

const source = [
  {
    kind: 'polygon',
    layer: 1,
    datatype: 7,
    points: [
      [-5.0001, -2],
      [5.0001, -2],
      [5.0001, 2],
      [-5.0001, 2],
    ],
  },
  {
    kind: 'polygon',
    layer: 1,
    datatype: 7,
    points: [
      [10, 0],
      [14, 0],
      [14, 4],
      [12, 4],
      [12, 2],
      [10, 2],
    ],
  },
  {
    kind: 'polygon',
    layer: 9,
    datatype: 2,
    points: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
  },
  {
    kind: 'polygon',
    layer: 9,
    datatype: 3,
    points: [
      [20.0002, 3],
      [21.0002, 3],
      [21.0002, 4],
      [20.0002, 4],
    ],
  },
];

test('GDS/OAS preserve exact representable polygon topology and Layer/Datatype pairs', async () => {
  const expected = inventory(source);
  for (const format of ['gds', 'oas']) {
    const restored = await decode(exportBytes(source, format), format);
    assert.deepEqual(inventory(restored), expected, format);
  }
});

test('GDS → OAS → GDS and OAS → GDS → OAS preserve canonical layout geometry', async () => {
  const expected = inventory(source);
  for (const first of ['gds', 'oas']) {
    const second = first === 'gds' ? 'oas' : 'gds';
    let current = await decode(exportBytes(source, first), first);
    current = await decode(exportBytes(current, second), second);
    current = await decode(exportBytes(current, first), first);
    assert.deepEqual(inventory(current), expected, `${first} → ${second} → ${first}`);
  }
});

test('ROI and Cell/Layer selection export exact geometry without mutating imported Mask', async () => {
  const layout = {
    root: 'TOP',
    elements: [
      { ...structuredClone(source[0]), sourceCell: 'TOP' },
      { ...structuredClone(source[1]), sourceCell: 'OTHER' },
      { ...structuredClone(source[2]), sourceCell: 'TOP' },
      { ...structuredClone(source[3]), sourceCell: 'TOP' },
    ],
    linework: [],
  };
  const original = structuredClone(layout);
  const exported = collectMaskExportElements({
    layout,
    maskSourceMode: 'file',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskRoi: { type: 'square', c: [0, 0], size: 2, rotation: 0 },
    selectedCells: new Set(['TOP']),
    selectedLayerKeys: new Set(['1|7', '9|2']),
  });
  assert.equal(exported.roiApplied, true);
  assert.deepEqual(layout, original, 'export must never change the source cell collection');
  assert.ok(exported.elements.length > 0);
  assert.ok(
    exported.elements.every((element) =>
      ['1|7', '9|2'].includes(`${element.layer}|${element.datatype}`),
    ),
  );
  const expected = inventory(exported.elements);
  for (const format of ['gds', 'oas']) {
    const restored = await decode(exportBytes(exported.elements, format), format);
    assert.deepEqual(inventory(restored), expected, format);
    for (const element of restored) {
      for (const [x, y] of element.points) {
        assert.ok(x >= -1.00011 && x <= 1.00011);
        assert.ok(y >= -1.00011 && y <= 1.00011);
      }
    }
  }
});
