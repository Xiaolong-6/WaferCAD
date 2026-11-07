import assert from 'node:assert/strict';
import test from 'node:test';
import { clipCanvasSegment } from '../canvas-segment-clip.js';

test('skip large out-of-view wafer outlines without expanding canvas stroke paths', () => {
  assert.equal(clipCanvasSegment([-200000, -100000], [200000, -100000], 1400, 900), null);
  assert.equal(clipCanvasSegment([-200000, -100000], [-200000, 200000], 1400, 900), null);
});

test('clip long crossing edges to the finite viewport while retaining visible endpoints', () => {
  assert.deepEqual(clipCanvasSegment([-200000, 450], [200000, 450], 1400, 900), [
    [-4, 450],
    [1404, 450],
  ]);
  assert.deepEqual(clipCanvasSegment([100, 100], [200, 200], 1400, 900), [
    [100, 100],
    [200, 200],
  ]);
});

test('preserve full edges when Canvas display dimensions are unavailable', () => {
  const a = [-1000, 500],
    b = [2500, 500];
  assert.deepEqual(clipCanvasSegment(a, b, 0, 0), [a, b]);
});
