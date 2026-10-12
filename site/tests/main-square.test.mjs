import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainSquare, squareFromDrag } from '../ui-v2/main-square.js';

test('Square drawing preserves the start corner in all four drag directions', () => {
  for (const [dx, dy] of [
    [3, 1],
    [3, -1],
    [-3, 1],
    [-3, -1],
  ]) {
    const roi = squareFromDrag([2, 4], [2 + dx, 4 + dy]);
    assert.equal(roi.type, 'rect');
    assert.equal(roi.b[0] - roi.a[0], 3);
    assert.equal(roi.b[1] - roi.a[1], 3);
    assert.ok([roi.a[0], roi.b[0]].includes(2));
    assert.ok([roi.a[1], roi.b[1]].includes(4));
  }
});

test('Square corner resize preserves the opposite corner', () => {
  const previous = { type: 'rect', a: [0, 0], b: [4, 4] };
  for (const [next, fixed] of [
    [{ type: 'rect', a: [-2, -1], b: [4, 4] }, [4, 4]],
    [{ type: 'rect', a: [0, -1], b: [6, 4] }, [0, 4]],
    [{ type: 'rect', a: [-2, 0], b: [4, 5] }, [4, 0]],
    [{ type: 'rect', a: [0, 0], b: [6, 5] }, [0, 0]],
  ]) {
    const roi = constrainSquare(next, previous);
    assert.equal(roi.b[0] - roi.a[0], roi.b[1] - roi.a[1]);
    assert.ok([roi.a[0], roi.b[0]].includes(fixed[0]));
    assert.ok([roi.a[1], roi.b[1]].includes(fixed[1]));
  }
});

test('Square translations and precise equal dimensions pass through unchanged', () => {
  const next = { type: 'rect', a: [0.000013, 0.000027], b: [1.000013, 1.000027] };
  assert.equal(constrainSquare(next, { type: 'rect', a: [0, 0], b: [1, 1] }), next);
  assert.equal(constrainSquare(null, next), null);
});
