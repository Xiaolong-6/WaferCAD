import assert from 'node:assert/strict';
import test from 'node:test';
import { ringMayIntersectCanvas } from '../plan-ring-visibility.js';

const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
const view = { cx: 50, cy: 50, s: 2 };

test('conservative canvas culling includes inner and outer rings near viewport', () => {
  assert.equal(ringMayIntersectCanvas(rect(-100, -100, 200, 200), view, 100, 100), true);
  assert.equal(ringMayIntersectCanvas(rect(1, 1, 8, 8), view, 100, 100), true);
  assert.equal(ringMayIntersectCanvas(rect(100, 100, 8, 8), view, 100, 100), false);
  assert.equal(ringMayIntersectCanvas(rect(28, 0, 4, 4), view, 100, 100), true);
  assert.equal(ringMayIntersectCanvas(rect(29, 0, 4, 4), view, 100, 100), false);
});

test('mirrored Back-face and invalid view inputs never discard visible contours', () => {
  assert.equal(ringMayIntersectCanvas(rect(-30, -2, 5, 4), view, 100, 100, true), true);
  assert.equal(ringMayIntersectCanvas(rect(-30, -2, 5, 4), view, 100, 100, false), true);
  assert.equal(ringMayIntersectCanvas(rect(-200, 0, 5, 4), view, 100, 100, false), false);
  assert.equal(ringMayIntersectCanvas(rect(100, 100, 8, 8), { ...view, s: NaN }, 100, 100), true);
});

test('outside holes are rejected without touching their original vertices', () => {
  const ring = rect(10000, 10000, 20, 20);
  const before = structuredClone(ring);
  assert.equal(ringMayIntersectCanvas(ring, view, 100, 100), false);
  assert.deepEqual(ring, before);
});
