import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendIndexedSmoothWallQuad,
  canIndexSmoothSidewallParts,
} from '../renderer-smooth-wall-index.js';

function oldUnindexedTriangles([a, b, c, d]) {
  const positions = [], normals = [];
  const triangle = (u, v, w) => {
    const ab = v.map((n, i) => n - u[i]);
    const ac = w.map((n, i) => n - u[i]);
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const magnitude = Math.hypot(...normal) || 1;
    const unit = normal.map((x) => x / magnitude);
    positions.push(...u, ...v, ...w);
    normals.push(...unit, ...unit, ...unit);
  };
  triangle(a, b, c);
  triangle(a, c, d);
  return { positions, normals };
}

function expandIndexed(positions, normals, indices) {
  const expanded = { positions: [], normals: [] };
  for (const index of indices) {
    expanded.positions.push(...positions.slice(index * 3, index * 3 + 3));
    expanded.normals.push(...normals.slice(index * 3, index * 3 + 3));
  }
  return expanded;
}

test('indexed smooth wall retains same triangles, normal orientation, vertex order and depth', () => {
  for (const quad of [
    [[0, 0, 0], [5, 0, 0], [5, 0, 2], [0, 0, 2]],
    [[5, -3, 4], [-1, 2, 4], [-1, 2, -2], [5, -3, -2]],
    [[-2, 3, -1], [-1, -4, -1], [-1, -4, 0.02], [-2, 3, 0.02]],
  ]) {
    const positions = [], normals = [], indices = [];
    const inputCopy = structuredClone(quad);
    appendIndexedSmoothWallQuad(positions, normals, indices, ...quad);
    const old = oldUnindexedTriangles(quad);
    const expanded = expandIndexed(positions, normals, indices);
    assert.deepEqual(quad, inputCopy, 'canonical part points must never be mutated');
    assert.equal(positions.length, 12, 'four vertices replace six');
    assert.equal(indices.length, 6, 'triangle count unchanged');
    assert.deepEqual(expanded.positions, old.positions);
    for (let k = 0; k < expanded.normals.length; k++) {
      assert.ok(Math.abs(expanded.normals[k] - old.normals[k]) <= 1e-14,
        'same smooth-wall normal up to floating-point rounding');
    }
  }
});

test('adjacent indexed quads share vertices only within their own planar face', () => {
  const vertices = [], normals = [], indices = [];
  appendIndexedSmoothWallQuad(
    vertices, normals, indices,
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
  );
  appendIndexedSmoothWallQuad(
    vertices, normals, indices,
    [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1],
  );
  assert.equal(vertices.length / 3, 8);
  assert.deepEqual(indices, [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  assert.notDeepEqual(normals.slice(0, 3), normals.slice(12, 15));
});

test('rough, implant gradient and invalid parts may not be indexed', () => {
  const smooth = { p: [0, 0], q: [1, 0], z0: 0, z1: 1 };
  assert.equal(canIndexSmoothSidewallParts([smooth]), true);
  assert.equal(canIndexSmoothSidewallParts([]), false);
  for (const change of [
    { lowerSurface: { appearance: { kind: 'rough' } } },
    { upperSurface: { appearance: { kind: 'rough' } } },
    { lowerDepth: 0, upperDepth: 1 },
    { z1: Number.NaN },
    { p: [Infinity, 0] },
    { q: [1, Number.NaN] },
  ]) {
    assert.equal(canIndexSmoothSidewallParts([{ ...smooth, ...change }]), false,
      JSON.stringify(change));
  }
});
