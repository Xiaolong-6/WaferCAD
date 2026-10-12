import assert from 'node:assert/strict';
import test from 'node:test';
import { equalStatePairs, stateValuesEqual } from '../state-equality.js';

test('state equality preserves non-finite values, signed zero and all own keys', () => {
  for (const [left, right] of [
    [NaN, null],
    [0, -0],
    [{ value: undefined }, {}],
    [[undefined], new Array(1)],
    [Object.assign([1], { extra: true }), [1]],
    [Object.assign([1, 2], { extra: true }), [1, 2]],
    [
      [NaN, -0],
      [NaN, 0],
    ],
    [{ geom: [[1, Infinity]] }, { geom: [[1, null]] }],
    [{ geom: [] }, { geom: {} }],
  ])
    assert.equal(stateValuesEqual(left, right), false);
  assert.equal(stateValuesEqual({ value: NaN }, { value: NaN }), true);
  assert.equal(stateValuesEqual({ value: undefined }, { value: undefined }), true);
  assert.equal(stateValuesEqual([NaN, Infinity], [NaN, Infinity]), true);
  const inherited = Object.assign(new Array(2), { x: 1, y: 2 });
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: 1, 1: 2 }));
  assert.equal(stateValuesEqual(inherited, [1, 2]), false);
  assert.equal(stateValuesEqual([1, 2], inherited), false);
});

test('shared geometry is visited once per synchronous comparison batch', () => {
  let reads = 0;
  const geometry = {};
  Object.defineProperty(geometry, 'points', {
    enumerable: true,
    get: () => {
      reads++;
      return [
        [0, 0],
        [1, 0],
        [1, 1],
      ];
    },
  });
  const copy = {
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  };
  const pairs = Array.from({ length: 16 }, () => [
    { model: { geom: geometry }, layout: { geom: geometry } },
    { model: { geom: copy }, layout: { geom: copy } },
  ]);
  assert.deepEqual(equalStatePairs(pairs), Array(16).fill(true));
  assert.equal(reads, 1, 'Shared payload traversal must scale with unique pairs, not references.');
  copy.points[0][0] = 2;
  assert.equal(equalStatePairs([pairs[0]])[0], false, 'No memo survives a later edit.');
});

test('one left object compared to different right objects cannot hide a difference', () => {
  const shared = { points: [1, 2] };
  assert.deepEqual(
    equalStatePairs([
      [shared, { points: [1, 2] }],
      [shared, { points: [1, 3] }],
      [shared, { points: [1, 2] }],
    ]),
    [true, false, true],
  );
});

test('failed traversal cannot certify unfinished pairs for another History state', () => {
  const left = { points: [1, 2] };
  const right = { points: [1, 3] };
  assert.deepEqual(
    equalStatePairs([
      [
        { geom: left, changed: true },
        { geom: right, changed: false },
      ],
      [left, right],
      [left, right],
    ]),
    [false, false, false],
  );
});

test('cyclic or exponentially shared structures terminate and still detect leaf edits', () => {
  let left = { value: 1 },
    right = { value: 1 };
  const leaf = right;
  for (let depth = 0; depth < 32; depth++) {
    left = { a: left, b: left };
    right = { a: right, b: right };
  }
  assert.equal(stateValuesEqual(left, right), true);
  leaf.value = 2;
  assert.equal(stateValuesEqual(left, right), false);
  const a = { value: 1 },
    b = { value: 1 };
  a.self = a;
  b.self = b;
  assert.equal(stateValuesEqual(a, b), true);
  b.value = 2;
  assert.equal(stateValuesEqual(a, b), false);
});
