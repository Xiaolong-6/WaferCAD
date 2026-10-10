import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canIndexSmoothWalls,
  pushIndexedSmoothWall,
} from '../renderer-quality-index-experiment.js';

const oldTriangles = (a, b, c, d) => {
  const p = [],
    n = [];
  for (const [u, v, w] of [
    [a, b, c],
    [a, c, d],
  ]) {
    const ab = v.map((x, i) => x - u[i]),
      ac = w.map((x, i) => x - u[i]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const mag = Math.hypot(...cross) || 1;
    const normal = cross.map((x) => x / mag);
    p.push(...u, ...v, ...w);
    n.push(...normal, ...normal, ...normal);
  }
  return { positions: p, normals: n };
};

test('Quality indexed wall expands to the exact original two triangles and normals', () => {
  const quads = [
    [
      [0, 0, 0],
      [3, 0, 0],
      [3, 0, 2],
      [0, 0, 2],
    ],
    [
      [1, 2, -0.3],
      [-3, 4, -0.3],
      [-3, 4, 0.1],
      [1, 2, 0.1],
    ],
    [
      [-2, 4, 3],
      [-3, 1, 3],
      [-3, 1, -5],
      [-2, 4, -5],
    ],
  ];
  const p = [],
    n = [],
    ind = [];
  quads.forEach((q) => pushIndexedSmoothWall(p, n, ind, ...q));
  assert.equal(p.length / 3, 4 * quads.length);
  assert.equal(ind.length / 3, 2 * quads.length);
  const expanded = { positions: [], normals: [] };
  for (const id of ind) {
    expanded.positions.push(...p.slice(id * 3, id * 3 + 3));
    expanded.normals.push(...n.slice(id * 3, id * 3 + 3));
  }
  const old = { positions: [], normals: [] };
  for (const q of quads) {
    const one = oldTriangles(...q);
    old.positions.push(...one.positions);
    old.normals.push(...one.normals);
  }
  assert.deepEqual(expanded.positions, old.positions);
  for (let i = 0; i < old.normals.length; i++)
    assert.ok(Math.abs(expanded.normals[i] - old.normals[i]) <= 1e-14, `normal ${i}`);
  assert.deepEqual(ind.slice(0, 6), [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(ind.slice(6, 12), [4, 5, 6, 4, 6, 7]);
  assert.equal(old.positions.length / 3 / (p.length / 3), 1.5);
});

test('reject rough appearance, annotation depth, and invalid geometry before indexing', () => {
  const smooth = { p: [0, 0], q: [1, 1], z0: 0, z1: 2 };
  assert.equal(canIndexSmoothWalls([smooth]), true);
  assert.equal(canIndexSmoothWalls([]), false);
  for (const part of [
    { ...smooth, upperSurface: { appearance: { kind: 'rough' } } },
    { ...smooth, lowerSurface: { appearance: { kind: 'rough' } } },
    { ...smooth, lowerDepth: 0, upperDepth: 1 },
    { ...smooth, lowerDepth: null, upperDepth: null },
    { ...smooth, p: [NaN, 0] },
    { ...smooth, q: [0, Infinity] },
    { ...smooth, z0: NaN },
  ])
    assert.equal(canIndexSmoothWalls([part]), false);
});

test('indexing must not touch input positions or shared corners across distinct walls', () => {
  const a = [0, 0, 0],
    b = [1, 0, 0],
    c = [1, 0, 2],
    d = [0, 0, 2];
  const unchanged = structuredClone([a, b, c, d]),
    positions = [],
    normals = [],
    indices = [];
  pushIndexedSmoothWall(positions, normals, indices, a, b, c, d);
  pushIndexedSmoothWall(positions, normals, indices, [1, 0, 0], [1, 1, 0], [1, 1, 2], [1, 0, 2]);
  assert.deepEqual([a, b, c, d], unchanged);
  assert.equal(positions.length / 3, 8);
  assert.notDeepEqual(normals.slice(0, 3), normals.slice(12, 15));
});
