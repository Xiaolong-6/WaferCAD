import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractQ2ROI } from '../../scripts/transmon-gds-q2-roi.mjs';
import { parseGDS, flattenGDS } from '../gds.js';

function rec(type, dt = 0, data = Buffer.alloc(0)) {
  const b = Buffer.alloc(data.length + 4);
  b.writeUInt16BE(b.length);
  b[2] = type;
  b[3] = dt;
  data.copy(b, 4);
  return b;
}
function str(type, value) {
  const b = Buffer.from(value);
  return rec(type, 6, b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b);
}
function xy(coords) {
  const b = Buffer.alloc(coords.length * 8);
  for (const [i, [x, y]] of coords.entries()) {
    b.writeInt32BE(x, i * 8);
    b.writeInt32BE(y, i * 8 + 4);
  }
  return rec(0x10, 3, b);
}
function polygon(layer, datatype, x, y) {
  const l = Buffer.alloc(2);
  const d = Buffer.alloc(2);
  l.writeInt16BE(layer);
  d.writeInt16BE(datatype);
  return [
    rec(0x08),
    rec(0x0d, 2, l),
    rec(0x0e, 2, d),
    xy([
      [x, y],
      [x + 200, y],
      [x + 200, y + 200],
      [x, y + 200],
      [x, y],
    ]),
    rec(0x11),
  ];
}
function sref(name, x, y) {
  return [rec(0x0a), str(0x12, name), xy([[x, y]]), rec(0x11)];
}
function cell(name, contents) {
  return [rec(0x05), str(0x06, name), ...contents, rec(0x07)];
}
function unitReal8(value) {
  if (!value) return Buffer.alloc(8);
  let n = value;
  let e = 0;
  while (n < 1 / 16) {
    n *= 16;
    e--;
  }
  while (n >= 1) {
    n /= 16;
    e++;
  }
  const b = Buffer.alloc(8);
  b[0] = e + 64;
  for (let i = 1; i < 8; i++) {
    n *= 256;
    b[i] = Math.floor(n);
    n -= b[i];
  }
  return b;
}
function fixture() {
  const oneNm = Buffer.concat([unitReal8(0.001), unitReal8(1e-9)]);
  return Buffer.concat([
    rec(0x00, 2, Buffer.from([0, 7])),
    rec(0x01),
    str(0x02, 'TEST'),
    rec(0x03, 5, oneNm),
    ...cell('Unnamed_b0465f83', [
      ...polygon(2, 0, 1400000, 2513000),
      ...polygon(2, 0, 9000000, 9000000),
    ]),
    ...cell('jj_width0p18', [...polygon(8, 0, 0, 0), ...polygon(8, 1, 300, 300)]),
    ...cell('chip2', [
      ...sref('Unnamed_b0465f83', 0, 0),
      ...sref('jj_width0p18', 1400000, 2513000),
    ]),
    rec(0x04),
  ]);
}

test('Q2 selection preserves original layer geometry and JJ placement', () => {
  const result = extractQ2ROI(fixture(), { radius: 100 });
  assert.equal(result.report.keptBackgroundPolygons, 1);
  assert.deepEqual(result.report.polygonCounts, {
    '2/0': 1,
    '8/0': 1,
    '8/1': 1,
  });
  assert.deepEqual(result.report.q2CenterUm, [1400, 2513]);
  const bytes = result.bytes;
  const parsed = parseGDS(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  assert.deepEqual(parsed.roots, ['TRANSMON_Q2_ORIGINAL_ROI']);
  assert.equal(flattenGDS(parsed, parsed.root).elements.length, 3);
  assert.equal(result.report.noGeometryClipping, true);
});

test('Q2 selection refuses unverified ref and zero-radius ROI', () => {
  assert.throws(
    () => extractQ2ROI(fixture(), { center: [1401, 2513] }),
    /Junction ref\/position mismatch/,
  );
  assert.throws(() => extractQ2ROI(fixture(), { radius: 0 }), /ROI radius/);
});

test(
  'verify the original author GDS when available',
  {
    skip: !process.env.WAFERCAD_TRANSMON_GDS,
  },
  () => {
    const source = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
    const result = extractQ2ROI(source);
    assert.equal(
      result.report.sourceSha256,
      '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
    );
    assert.equal(result.report.keptBackgroundPolygons, 28);
    assert.deepEqual(result.report.polygonCounts, {
      '2/0': 28,
      '8/1': 9,
      '8/0': 8,
    });
  },
);
