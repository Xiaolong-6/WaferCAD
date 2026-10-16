import assert from 'node:assert/strict';
import test from 'node:test';

import { unownedContourSegments } from '../three-outline-geometry.js';

test('one physical rough edge owns one outline, even with reversed cut segments', () => {
  const a = [0, 0, 1];
  const b = [1, 0, 1.1];
  const c = [1, 0, 0];
  const d = [1, 0, 1];
  const rough = [a, b];
  const cut = [c, d];
  assert.deepEqual(unownedContourSegments([[b, a], cut, cut], [rough]), [cut]);
});
