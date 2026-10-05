import assert from 'node:assert/strict';
import test from 'node:test';

const { flattenGDS, makeDemoLayout, parseGDS } = await import('../gds.js');

test('GDS demo and physical-unit parsing smoke', () => {
  const demo = makeDemoLayout();
  assert.equal(demo.linework.length, 1);
  assert.ok(!demo.combos.some((x) => x.layer === 99));

  function gdsReal8(value) {
    const out = new Uint8Array(8);
    if (value === 0) return out;
    let x = Math.abs(value),
      exp = 0;
    while (x >= 1) {
      x /= 16;
      exp++;
    }
    while (x < 1 / 16) {
      x *= 16;
      exp--;
    }
    out[0] = (value < 0 ? 0x80 : 0) | (exp + 64);
    for (let i = 1; i < 8; i++) {
      x *= 256;
      out[i] = Math.floor(x);
      x -= out[i];
    }
    return out;
  }
  function gdsRecord(type, dataType, data = new Uint8Array()) {
    const out = new Uint8Array(4 + data.length),
      v = new DataView(out.buffer);
    v.setUint16(0, out.length, false);
    out[2] = type;
    out[3] = dataType;
    out.set(data, 4);
    return out;
  }
  function gdsString(value) {
    const raw = new TextEncoder().encode(value),
      out = new Uint8Array(raw.length + (raw.length % 2));
    out.set(raw);
    return out;
  }
  function gdsI16(value) {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setInt16(0, value, false);
    return out;
  }
  function gdsXY(points) {
    const out = new Uint8Array(points.length * 8),
      v = new DataView(out.buffer);
    points.forEach(([x, y], i) => {
      v.setInt32(i * 8, x, false);
      v.setInt32(i * 8 + 4, y, false);
    });
    return out;
  }
  function concatBytes(parts) {
    const n = parts.reduce((sum, p) => sum + p.length, 0),
      out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
  const units = concatBytes([gdsReal8(1e-3), gdsReal8(1e-9)]);
  const gdsBytes = concatBytes([
    gdsRecord(0x03, 0x05, units),
    gdsRecord(0x05, 0x02),
    gdsRecord(0x06, 0x06, gdsString('TOP')),
    gdsRecord(0x08, 0x00),
    gdsRecord(0x0d, 0x02, gdsI16(1)),
    gdsRecord(0x0e, 0x02, gdsI16(0)),
    gdsRecord(
      0x10,
      0x03,
      gdsXY([
        [0, 0],
        [10000, 0],
        [10000, 20000],
        [0, 20000],
        [0, 0],
      ]),
    ),
    gdsRecord(0x11, 0x00),
    gdsRecord(0x07, 0x00),
  ]);
  const parsed = parseGDS(gdsBytes.buffer),
    flat = flattenGDS(parsed, 'TOP');
  assert.equal(parsed.units.xy, 'µm');
  assert.ok(Math.abs(parsed.units.dbuToMicron - 0.001) < 1e-12);
  assert.ok(Math.abs(flat.bounds.width - 10) < 1e-9);
  assert.ok(Math.abs(flat.bounds.height - 20) < 1e-9);
  assert.deepEqual(flat.elements[0].points[2], [10, 20]);
});
