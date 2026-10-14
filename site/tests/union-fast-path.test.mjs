import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { unionGeometries, normalizeMulti, rectMulti, isEmpty } =
  await import('../vector-geometry.js');

test('disjoint wafer array union preserves exact normalized coordinates and input isolation', () => {
  const input = Array.from({ length: 625 }, (_, index) => {
    const col = index % 25;
    const row = Math.floor(index / 25);
    return rectMulti(0.4, 0.25, col * 2.123456789, row * 1.234567891);
  });
  const expected = normalizeMulti(input.flatMap((geom) => geom));
  const result = unionGeometries(input);
  assert.deepEqual(result, expected);
  assert.notStrictEqual(result[0], input[0][0]);
  assert.notStrictEqual(result[0][0], input[0][0][0]);
  assert.notStrictEqual(result[0][0][0], input[0][0][0][0]);
  result[0][0][0][0] = 12345;
  assert.notEqual(input[0][0][0][0][0], 12345);
  assert.deepEqual(unionGeometries(input), expected);
});

test('single normalized polygon detaches original and preserves unrounded subnanometer coordinates', () => {
  const tiny = 0.0000004;
  const original = [[[[0, 0], [tiny, 0], [tiny, tiny], [0, tiny]]]];
  const result = unionGeometries([original]);
  assert.deepEqual(result, normalizeMulti(original));
  assert.equal(result[0][0][1][0], tiny);
  result[0][0][1][0] = 9;
  assert.equal(original[0][0][1][0], tiny);
});

test('mixed touching and isolated components retain Boolean ownership and ring ordering', () => {
  const input = [
    rectMulti(2, 2, 0, 0),
    rectMulti(2, 2, 1.5, 0),
    rectMulti(1, 1, 15, 13),
  ];
  const expected = unionGeometries(input);
  assert.equal(expected.length, 2);
  assert.deepEqual(unionGeometries(input), expected);
  assert.equal(isEmpty(expected), false);
  assert.equal(expected[1][0][0].length, 2);
});

test('normalization ignores invalid polygons before the independent fast path', () => {
  const input = [
    [[[[0, 0], [1, 0], [1, 1], [0, 1]]]],
    [[[[NaN, 0], [Infinity, 2]]]],
    [],
    null,
  ];
  assert.deepEqual(unionGeometries(input), normalizeMulti(input.flatMap((geom) => geom || [])));
});
