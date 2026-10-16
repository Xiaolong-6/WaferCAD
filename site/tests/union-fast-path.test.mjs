import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { unionGeometries, normalizeMulti, rectMulti } = await import('../vector-geometry.js');

test('disjoint wafer polygons preserve exact geometry and input isolation', () => {
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

test('single polygon retains subnanometer values and detaches the input', () => {
  const tiny = 0.0000004;
  const original = rectMulti(tiny, tiny, tiny / 2, tiny / 2);
  original[0][0].pop();
  const result = unionGeometries([original]);
  assert.deepEqual(result, normalizeMulti(original));
  assert.equal(result[0][0][1][0], tiny);
  result[0][0][1][0] = 9;
  assert.equal(original[0][0][1][0], tiny);
});

test('overlapping and isolated components preserve Boolean ownership', () => {
  const input = [rectMulti(2, 2), rectMulti(2, 2, 1.5), rectMulti(1, 1, 15, 13)];
  const result = unionGeometries(input);
  assert.equal(result.length, 2);
  assert.deepEqual(unionGeometries(input), result);
});

test('reused geometry identities do not trigger redundant Boolean ownership work', () => {
  const shared = rectMulti(2, 2, 0.0000004, 0);
  const partlyOverlapping = rectMulti(2, 2, 1.5, 0);
  const independent = rectMulti(0.5, 0.4, 15, -10);
  const baseline = unionGeometries([shared, partlyOverlapping, independent]);
  const repeated = [
    ...Array.from({ length: 240 }, () => shared),
    partlyOverlapping,
    ...Array.from({ length: 180 }, () => independent),
  ];
  const result = unionGeometries(repeated);
  assert.deepEqual(result, baseline, 'repeat references leave exact union unchanged');
  assert.equal(result.length, 2, 'the overlapping component still uses the Boolean kernel');
  const before = structuredClone(shared);
  result[0][0][0][0] = 999;
  assert.deepEqual(shared, before, 'a reused source must remain detached from the result');
  assert.deepEqual(unionGeometries(repeated), baseline, 'a prior result mutation has no effect');
});

test('distinct but equivalent geometry objects retain normal ownership semantics', () => {
  const source = rectMulti(0.5, 0.5, 0.0000004, 0);
  const distinct = structuredClone(source);
  const result = unionGeometries([source, distinct]);
  assert.deepEqual(result, unionGeometries([source]));
  result[0][0][1][0] = 987;
  assert.notEqual(source[0][0][1][0], 987);
  assert.notEqual(distinct[0][0][1][0], 987);
});

test('invalid polygons are ignored before the disjoint fast path', () => {
  const valid = rectMulti(1, 1);
  const invalid = [
    [
      [
        [NaN, 0],
        [Infinity, 2],
      ],
    ],
  ];
  const input = [valid, invalid, [], null];
  const expected = normalizeMulti(input.flatMap((geom) => geom || []));
  assert.deepEqual(unionGeometries(input), expected);
});
