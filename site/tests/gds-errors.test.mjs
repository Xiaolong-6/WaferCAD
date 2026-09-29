import assert from 'node:assert/strict';
import test from 'node:test';

import { flattenGDS, parseGDS } from '../gds.js';

function parsedWith(cells, root = 'A') {
  return {
    cells: new Map(cells),
    cellOrder: cells.map(([name]) => name),
    root,
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}

function sref(name) {
  return {
    kind: 'sref',
    name,
    layer: 0,
    datatype: 0,
    width: 0,
    points: [],
    mag: 1,
    angle: 0,
    reflect: false,
  };
}

test('parseGDS rejects truncated records', () => {
  const bytes = new Uint8Array([0, 8, 0, 0]);
  assert.throws(() => parseGDS(bytes.buffer), /Invalid GDS record at byte 0/);
});

test('parseGDS rejects records shorter than the header', () => {
  const bytes = new Uint8Array([0, 3, 0, 0]);
  assert.throws(() => parseGDS(bytes.buffer), /Invalid GDS record at byte 0/);
});

test('flattenGDS terminates cyclic SREF hierarchies', () => {
  const parsed = parsedWith([
    ['A', { name: 'A', elements: [sref('B')] }],
    ['B', { name: 'B', elements: [sref('A')] }],
  ]);
  const flat = flattenGDS(parsed, 'A');
  assert.deepEqual(flat.elements, []);
  assert.deepEqual(flat.linework, []);
});

test('flattenGDS safely ignores missing referenced cells', () => {
  const parsed = parsedWith([['A', { name: 'A', elements: [sref('MISSING')] }]]);
  assert.doesNotThrow(() => flattenGDS(parsed, 'A'));
  assert.equal(flattenGDS(parsed, 'A').elements.length, 0);
});

test('flattenGDS enforces the hierarchy depth guard', () => {
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const name = `C${i}`;
    const elements =
      i === 34
        ? [
            {
              kind: 'polygon',
              layer: 1,
              datatype: 0,
              points: [
                [0, 0],
                [1, 0],
                [0, 1],
              ],
            },
          ]
        : [sref(`C${i + 1}`)];
    cells.push([name, { name, elements }]);
  }
  const flat = flattenGDS(parsedWith(cells, 'C0'), 'C0');
  assert.equal(flat.elements.length, 0);
});


test('parseGDS stops at ENDLIB and ignores trailing zero padding', () => {
  const bytes = new Uint8Array([
    0, 4, 0x05, 0,
    0, 8, 0x06, 0x06, 0x54, 0x4f, 0x50, 0,
    0, 4, 0x07, 0,
    0, 4, 0x04, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const parsed = parseGDS(bytes.buffer);
  assert.equal(parsed.root, 'TOP');
  assert.equal(parsed.cells.size, 1);
});
