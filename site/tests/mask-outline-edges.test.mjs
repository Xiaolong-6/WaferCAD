import assert from 'node:assert/strict';
import test from 'node:test';
import { maskVisibleOutlineEdges } from '../mask-outline-edges.js';

test('ordinary GDS squares retain the original Canvas outline fast path', () => {
  assert.equal(
    maskVisibleOutlineEdges([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]),
    null,
  );
});

test('a source keyhole excludes paired zero-width bridges without changing polygon vertices', () => {
  const points = [
    [4990, 4990],
    [-4990, 4990],
    [-4990, -4800],
    [-4800, -4800],
    [-4800, 4800],
    [4800, 4800],
    [4800, -4800],
    [-4800, -4800],
    [-4990, -4800],
    [-4990, -4990],
    [4990, -4990],
  ];
  const before = structuredClone(points);
  const edges = maskVisibleOutlineEdges(points);
  assert.equal(edges.length, points.length - 2);
  assert.equal(
    edges.some(([a, b]) => a[0] === -4990 && a[1] === -4800 && b[0] === -4800 && b[1] === -4800),
    false,
  );
  assert.deepEqual(points, before);
});

test('only matching opposite directions cancel, not same-direction edges', () => {
  const p = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
    [2, 0],
    [2, 2],
  ];
  assert.equal(maskVisibleOutlineEdges(p), null);
});

test(
  'original chip2 has 17 source keyholes, all drawn without their reversible connector edges',
  { skip: !process.env.WAFERCAD_TRANSMON_GDS && 'Source GDS not supplied' },
  async () => {
    const { readFile } = await import('node:fs/promises');
    const { flattenGDS, parseGDS } = await import('../gds.js');
    const bytes = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
    const parsed = parseGDS(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const source = flattenGDS(parsed, 'chip2').elements;
    let cleaned = 0;
    let fastSquares = 0;
    for (const element of source) {
      const edges = maskVisibleOutlineEdges(element.points);
      if (edges) {
        cleaned++;
        assert.ok(edges.length < element.points.length);
      } else if (element.points.length === 4 && element.layer === 2) {
        fastSquares++;
      }
    }
    assert.equal(cleaned, 17);
    assert.ok(fastSquares >= 39194, 'Source apertures retain the constant-time fast path');
  },
);
