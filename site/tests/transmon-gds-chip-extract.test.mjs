import assert from 'node:assert/strict';
import test from 'node:test';

import { extractGDSCell, verifyGDSSelection } from '../../scripts/transmon-gds-chip-extract.mjs';
import { parseGDS } from '../gds.js';

function record(type, dataType, bytes = Buffer.alloc(0)) {
  const out = Buffer.alloc(bytes.length + 4);
  out.writeUInt16BE(out.length, 0);
  out[2] = type;
  out[3] = dataType;
  bytes.copy(out, 4);
  return out;
}

function name(text) {
  const value = Buffer.from(text, 'ascii');
  return value.length % 2 ? Buffer.concat([value, Buffer.alloc(1)]) : value;
}

function xy(points) {
  const bytes = Buffer.alloc(points.length * 8);
  points.forEach(([x, y], i) => {
    bytes.writeInt32BE(x, i * 8);
    bytes.writeInt32BE(y, i * 8 + 4);
  });
  return bytes;
}

function structure(cellName, records) {
  return Buffer.concat([
    record(0x05, 0x02),
    record(0x06, 0x06, name(cellName)),
    ...records,
    record(0x07, 0),
  ]);
}

function polygon(layer) {
  const l = Buffer.alloc(2);
  l.writeInt16BE(layer);
  return [
    record(0x08, 0),
    record(0x0d, 0x02, l),
    record(0x0e, 0x02, Buffer.alloc(2)),
    record(
      0x10,
      0x03,
      xy([
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
        [0, 0],
      ]),
    ),
    record(0x11, 0),
  ];
}

function sref(cellName, x) {
  return [
    record(0x0a, 0),
    record(0x12, 0x06, name(cellName)),
    record(0x10, 0x03, xy([[x, 0]])),
    record(0x11, 0),
  ];
}

function library() {
  return Buffer.concat([
    record(0x00, 0x02, Buffer.from([0, 7])),
    record(0x01, 0x02),
    record(0x02, 0x06, name('TEST')),
    structure('SHARED', polygon(2)),
    structure('A', sref('SHARED', 10000)),
    structure('B', polygon(8)),
    structure('TOP', [...sref('A', 0), ...sref('B', 30000)]),
    record(0x04, 0),
  ]);
}

test('selected GDS cell is losslessly copied with referenced structures and a single root', () => {
  const src = library();
  const dst = extractGDSCell(src, 'A');
  assert.equal(dst.sourceCells, 4);
  assert.equal(dst.selectedCells, 2);
  const parsed = parseGDS(
    dst.bytes.buffer.slice(dst.bytes.byteOffset, dst.bytes.byteOffset + dst.bytes.length),
  );
  assert.deepEqual(parsed.roots, ['A']);
  assert.ok(parsed.cells.has('SHARED'));
  assert.ok(!parsed.cells.has('B'));
  assert.ok(!parsed.cells.has('TOP'));
  assert.deepEqual(verifyGDSSelection(src, dst.bytes, 'A').counts, { 'polygon/2/0': 1 });
});

test('GDS root selection rejects missing cells and malformed/truncated source data', () => {
  assert.throws(() => extractGDSCell(library(), 'nonexistent'), /Unknown GDS cell/);
  assert.throws(() => extractGDSCell(library().subarray(0, -2), 'A'), /Truncated GDS record/);
  assert.throws(() => extractGDSCell(Buffer.from([0, 3, 0, 0]), 'A'), /Invalid GDS record/);
});
