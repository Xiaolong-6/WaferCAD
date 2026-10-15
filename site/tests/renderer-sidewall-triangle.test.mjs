import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSidewallTriangle } from '../renderer-sidewall-triangle.js';

// Previous geometryFromSidewallParts implementation: keep independent
// reference arithmetic for exact geometry/shading parity.
function referenceTriangle(positions, normals, annotationDepths, a, b, c, depths = null) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const magnitude = Math.hypot(...normal) || 1;
  const unit = normal.map((value) => value / magnitude);
  positions.push(...a, ...b, ...c);
  normals.push(...unit, ...unit, ...unit);
  if (depths) annotationDepths.push(...depths);
}

test('sidewall emission matches prior positions, normals and annotation depths', () => {
  let seed = 0x4bd15f29;
  const rand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cases = [
    [[0, 0, 0], [1, 0, 0], [1, 0, 0.07], null],
    [
      [0, 0, -0.07],
      [0, 2, -0.07],
      [0, 2, 0.01],
      [0.1, 0.1, 0.8],
    ],
    [[1e-10, 2e-10, 0], [1e-10, 2e-10, 0], [2e-10, 2e-10, 0], null],
    [
      [-1e8, 1e8, 0.25],
      [-1e8 + 0.1, 1e8, 0.25],
      [-1e8 + 0.1, 1e8, 0.2505],
      [0, 0.5, 1],
    ],
  ];
  for (let i = 0; i < 5000; i++) {
    const a = Array.from({ length: 3 }, () => (rand() - 0.5) * 500);
    const b = Array.from({ length: 3 }, () => (rand() - 0.5) * 500);
    const c = Array.from({ length: 3 }, () => (rand() - 0.5) * 500);
    cases.push([a, b, c, i % 3 ? null : [rand(), rand(), rand()]]);
  }
  const old = { positions: [], normals: [], depths: [] };
  const newer = { positions: [], normals: [], depths: [] };
  for (const [a, b, c, depths] of cases) {
    referenceTriangle(old.positions, old.normals, old.depths, a, b, c, depths);
    appendSidewallTriangle(newer.positions, newer.normals, newer.depths, a, b, c, depths);
  }
  assert.deepEqual(newer, old);
  // The renderer still casts the same coordinate and normal sequence through
  // Float32BufferAttribute, so bitwise Float32 conversion must also match.
  assert.deepEqual(new Float32Array(newer.positions), new Float32Array(old.positions));
  assert.deepEqual(new Float32Array(newer.normals), new Float32Array(old.normals));
  assert.deepEqual(new Float32Array(newer.depths), new Float32Array(old.depths));
});

test('sidewall appender preserves caller vectors and handles degenerate faces identically', () => {
  const a = Object.freeze([4, 5, 6]);
  const b = Object.freeze([4, 5, 6]);
  const c = Object.freeze([4, 5, 6]);
  const positions = [];
  const normals = [];
  const depths = [];
  appendSidewallTriangle(positions, normals, depths, a, b, c, [0.4, 0.5, 0.6]);
  assert.deepEqual(normals, Array(9).fill(0));
  assert.deepEqual(depths, [0.4, 0.5, 0.6]);
  assert.deepEqual(positions, [...a, ...b, ...c]);
});
