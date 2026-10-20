import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { auditAuthorQ2Junction } from '../../scripts/transmon-junction-dose-audit.mjs';

const rec = (t, dtype = 0, raw = Buffer.alloc(0)) => {
  const b = Buffer.alloc(raw.length + 4);
  b.writeUInt16BE(b.length);
  b[2] = t;
  b[3] = dtype;
  raw.copy(b, 4);
  return b;
};
const textRec = (t, str) => {
  const b = Buffer.from(str, 'ascii');
  return rec(t, 6, b.length & 1 ? Buffer.concat([b, Buffer.alloc(1)]) : b);
};
const uint16Rec = (t, n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return rec(t, 2, b);
};
const pointsRec = (pts) => {
  const b = Buffer.alloc(pts.length * 8);
  pts.forEach(([x, y], i) => {
    b.writeInt32BE(x, i * 8);
    b.writeInt32BE(y, i * 8 + 4);
  });
  return rec(0x10, 3, b);
};
function real8(value) {
  if (!value) return Buffer.alloc(8);
  const out = Buffer.alloc(8);
  let n = value,
    e = 0;
  while (n >= 1) {
    n /= 16;
    e++;
  }
  while (n < 1 / 16) {
    n *= 16;
    e--;
  }
  out[0] = e + 64;
  for (let i = 1; i < 8; i++) {
    n *= 256;
    out[i] = Math.floor(n);
    n -= out[i];
  }
  return out;
}
function boundary(datatype, x) {
  return [
    rec(0x08),
    uint16Rec(0x0d, 8),
    uint16Rec(0x0e, datatype),
    pointsRec([
      [x, 0],
      [x + 400, 0],
      [x + 400, 400],
      [x, 400],
      [x, 0],
    ]),
    rec(0x11),
  ];
}
function structure(name, elems) {
  return [rec(0x05), textRec(0x06, name), ...elems, rec(0x07)];
}
function sourceFixture({ rotation = 90, intersect = false } = {}) {
  const pos = intersect ? 200 : 1000;
  return Buffer.concat([
    rec(0x00, 2, Buffer.from([0, 7])),
    rec(0x01),
    textRec(0x02, 'AUDIT'),
    rec(0x03, 5, Buffer.concat([real8(0.001), real8(1e-9)])),
    ...structure('jj_width0p18', [...boundary(0, 0), ...boundary(1, pos)]),
    ...structure('chip2', [
      rec(0x0a),
      textRec(0x12, 'jj_width0p18'),
      rec(0x1c, 5, real8(rotation)),
      pointsRec([[1400000, 2513000]]),
      rec(0x11),
    ]),
    rec(0x04),
  ]);
}

test('author-like Q2 GDS audit measures independent dose geometries and correct 90-degree SREF', async () => {
  const audit = await auditAuthorQ2Junction(sourceFixture());
  assert.equal(audit.junctionReferenceRotationDeg, 90);
  assert.deepEqual(audit.junctionReferenceXYUm, [1400, 2513]);
  assert.equal(audit.selectedAbsoluteChipPolygons, 2);
  assert.equal(audit.layer8Datatype0.polygons, 1);
  assert.equal(audit.layer8Datatype1.polygons, 1);
  assert.equal(audit.layer8Datatype0.areaUm2, 0.16);
  assert.equal(audit.datatypesOverlapAreaUm2, 0);
  assert.match(audit.interpretation.confidence, /unverified/);
});

test('Q2 GDS audit refuses incorrect SREF orientation and overlapping exposure regions', async () => {
  await assert.rejects(auditAuthorQ2Junction(sourceFixture({ rotation: 0 })), /transform changed/);
  await assert.rejects(
    auditAuthorQ2Junction(sourceFixture({ intersect: true })),
    /overlap unexpectedly/,
  );
});

test(
  'real author GDS gives exactly 17 independently transformed Q2 polygons',
  {
    skip: !process.env.WAFERCAD_TRANSMON_GDS,
  },
  async () => {
    const source = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
    const audit = await auditAuthorQ2Junction(source);
    assert.equal(
      audit.sourceSha256,
      '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
    );
    assert.equal(audit.localJunctionPolygons, 17);
    assert.equal(audit.selectedAbsoluteChipPolygons, 17);
    assert.equal(audit.layer8Datatype0.polygons, 8);
    assert.equal(audit.layer8Datatype1.polygons, 9);
    assert.equal(audit.layer8Datatype0.areaUm2, 11.2);
    assert.equal(audit.layer8Datatype1.areaUm2, 11.201288);
    assert.equal(audit.datatypesOverlapAreaUm2, 0);
  },
);
