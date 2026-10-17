import assert from 'node:assert/strict';
import test from 'node:test';

import { sectionCutContours, unownedContourSegments } from '../three-outline-geometry.js';

test('one physical rough edge owns one outline, even with reversed cut segments', () => {
  const a = [0, 0, 1];
  const b = [1, 0, 1.1];
  const c = [1, 0, 0];
  const d = [1, 0, 1];
  const rough = [a, b];
  const cut = [c, d];
  assert.deepEqual(unownedContourSegments([[b, a], cut, cut], [rough]), [cut]);
});

test('overlapping silicon slab segments preserve only real exterior edges', () => {
  const clip = [
    [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
    ],
  ];
  const lower = { p: [0, 0], q: [4, 0], z0: 0, z1: 1, layerId: 'base' };
  const upper = { ...lower, p: [0, 0], q: [2, 0], z0: 1, z1: 2 };
  const atSeam = ([a, b]) => a[2] === 1 && b[2] === 1;
  const partial = sectionCutContours([lower, upper], clip).filter(atSeam);
  assert.equal(partial.length, 1);
  assert.equal(partial[0][0][0], 2);
  assert.equal(partial[0][1][0], 4);

  const rest = { ...upper, p: [2, 0], q: [4, 0] };
  const full = sectionCutContours([lower, upper, rest], clip);
  assert.equal(full.some(atSeam), false);
});
