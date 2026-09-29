import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';

import { parseLayoutFile } from '../layout-io.js';
import { assertOasisBlockSize, isOASIS, parseOAS } from '../oasis.js';

function uint(value) {
  const out = [];
  let n = value;
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n) byte |= 0x80;
    out.push(byte);
  } while (n);
  return Uint8Array.from(out);
}

function sint(value) {
  return uint(Math.abs(value) * 2 + (value < 0 ? 1 : 0));
}

function bytes(...parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(value) {
  return new TextEncoder().encode(value);
}

function oasisString(value) {
  const data = ascii(value);
  return bytes(uint(data.length), data);
}

function header() {
  return bytes(
    ascii('%SEMI-OASIS\r\n'),
    uint(1),
    oasisString('1.0'),
    uint(0),
    uint(1000),
    uint(0),
    ...Array.from({ length: 12 }, () => uint(0)),
  );
}

function syntheticOasis() {
  return bytes(
    header(),
    uint(14),
    oasisString('TOP'),
    uint(20),
    Uint8Array.of(0x7f),
    uint(1),
    uint(0),
    uint(1000),
    uint(2000),
    sint(0),
    sint(0),
    uint(2),
    uint(1),
    uint(5000),
    uint(21),
    Uint8Array.of(0x3b),
    uint(2),
    uint(0),
    uint(0),
    uint(2),
    sint(1000),
    sint(2000),
    sint(20000),
    sint(0),
    uint(2),
  );
}

test('OASIS import converts units, point lists, and repetitions into the shared layout model', async () => {
  const input = syntheticOasis();
  assert.equal(isOASIS(input.buffer), true);

  const { format, parsed, layout } = await parseLayoutFile(input.buffer, 'fixture.oas');
  assert.equal(format, 'OASIS');
  assert.equal(parsed.version, '1.0');
  assert.equal(parsed.root, 'TOP');
  assert.equal(parsed.units.xy, 'µm');
  assert.equal(parsed.units.dbuToMicron, 0.001);

  const cell = parsed.cells.get('TOP');
  assert.equal(cell.elements.length, 4);
  assert.deepEqual(cell.elements[0].points[2], [1, 2]);
  assert.deepEqual(cell.elements[1].points[0], [5, 0]);
  assert.deepEqual(cell.elements[2].points[0], [10, 0]);
  assert.deepEqual(cell.elements[3].points, [
    [20, 0],
    [21, 0],
    [21, 2],
    [20, 2],
  ]);

  assert.equal(layout.elements.length, 4);
  assert.equal(layout.bounds.minX, 0);
  assert.equal(layout.bounds.maxX, 21);
  assert.equal(layout.bounds.height, 2);
});

test('OASIS parser expands raw-deflate CBLOCK geometry', async () => {
  const body = bytes(
    uint(20),
    Uint8Array.of(0x7b),
    uint(7),
    uint(0),
    uint(1000),
    uint(2000),
    sint(0),
    sint(0),
  );
  const compressed = new Uint8Array(deflateRawSync(body));
  const input = bytes(
    header(),
    uint(14),
    oasisString('TOP'),
    uint(34),
    uint(0),
    uint(body.length),
    uint(compressed.length),
    compressed,
    uint(2),
  );

  const parsed = await parseOAS(input.buffer);
  const element = parsed.cells.get('TOP').elements[0];
  assert.equal(element.layer, 7);
  assert.deepEqual(element.points[2], [1, 2]);
});

test('OASIS parser rejects a false .oas payload by signature', async () => {
  const input = ascii('not oasis');
  assert.equal(isOASIS(input.buffer), false);
  await assert.rejects(() => parseOAS(input.buffer), /Invalid OASIS file signature/);
});

test('OASIS LAYERNAME singular intervals do not desynchronize following records', async () => {
  const input = bytes(
    header(),
    uint(11),
    oasisString('metal'),
    uint(3),
    uint(7),
    uint(3),
    uint(2),
    uint(14),
    oasisString('TOP'),
    uint(20),
    Uint8Array.of(0x7b),
    uint(7),
    uint(2),
    uint(1000),
    uint(1000),
    sint(0),
    sint(0),
    uint(2),
  );

  const parsed = await parseOAS(input.buffer);
  const element = parsed.cells.get('TOP').elements[0];
  assert.equal(element.layer, 7);
  assert.equal(element.datatype, 2);
  assert.deepEqual(element.points[2], [1, 1]);
});

test('OASIS g-delta directions decode southwest and southeast correctly', async () => {
  const southwest = (1000 << 4) | (6 << 1);
  const southeast = (1000 << 4) | (7 << 1);
  const input = bytes(
    header(),
    uint(14),
    oasisString('TOP'),
    uint(22),
    Uint8Array.of(0x7b),
    uint(4),
    uint(0),
    uint(50),
    uint(4),
    uint(2),
    uint(southwest),
    uint(southeast),
    sint(10000),
    sint(10000),
    uint(2),
  );

  const parsed = await parseOAS(input.buffer);
  const element = parsed.cells.get('TOP').elements[0];

  assert.deepEqual(element.points, [
    [10, 10],
    [9, 9],
    [10, 8],
  ]);
});


test('OASIS CBLOCK budget rejects unsafe expansion before decompression', () => {
  assert.doesNotThrow(() => assertOasisBlockSize(10, 10));
  assert.throws(() => assertOasisBlockSize(11, 10), /CBLOCK expands beyond/);
});
