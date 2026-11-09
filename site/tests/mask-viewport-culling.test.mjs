import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaskViewportCuller } from '../mask-viewport-culling.js';

const element = {
  points: [
    [20, 0],
    [24, 0],
    [24, 2],
    [20, 2],
  ],
};
const view = { cx: 0, cy: 50, s: 1 };

test('culls only polygons safely outside the visible Mask viewport', () => {
  const contains = createMaskViewportCuller((point) => point);
  assert.equal(contains(element, view, 15, 100, 'identity'), false);
  assert.equal(contains(element, view, 20, 100, 'identity'), true);
  assert.equal(contains(element, view, 15, 100, 'identity', 10), true);
});

test('rotated mask polygons use all four transformed bounding corners', () => {
  const rotated = createMaskViewportCuller(([x, y]) => [-y, x]);
  const canvas = { cx: 5, cy: 50, s: 1 };
  assert.equal(rotated(element, canvas, 12, 100, 'rot90'), true);
  assert.equal(rotated(element, { cx: 100, cy: 50, s: 1 }, 12, 100, 'rot90'), false);
});

test('transform changes invalidate only display bounds, not source coordinates', () => {
  const shift = [0, 0];
  let transformed = 0;
  const contains = createMaskViewportCuller(([x, y]) => {
    transformed++;
    return [x + shift[0], y + shift[1]];
  });
  const original = structuredClone(element.points);
  contains(element, view, 100, 100, 'shift0');
  contains(element, view, 100, 100, 'shift0');
  assert.equal(transformed, 4);
  shift[0] = 200;
  assert.equal(contains(element, view, 100, 100, 'shift200'), false);
  assert.equal(transformed, 8);
  assert.deepEqual(element.points, original);
});
