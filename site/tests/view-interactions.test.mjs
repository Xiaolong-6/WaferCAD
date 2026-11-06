import assert from 'node:assert/strict';
import test from 'node:test';

import {
  availableSelectedLayers,
  maskTransformAfterDrag,
  nearestNamedPoint,
  zoomLimitForFeature,
} from '../view-interactions.js';

test('nearestNamedPoint selects A/B endpoints within the interaction radius', () => {
  const points = { a: [10, 10], b: [100, 10] };
  assert.equal(nearestNamedPoint([24, 10], points, 18), 'a');
  assert.equal(nearestNamedPoint([88, 10], points, 18), 'b');
  assert.equal(nearestNamedPoint([50, 50], points, 18), null);
});

test('mask summary counts only selected layers available in the active cell scope', () => {
  const layers = [
    { key: '1/0', cells: new Set(['A']) },
    { key: '2/0', cells: new Set(['B']) },
    { key: '3/0', cells: new Set(['A', 'B']) },
  ];
  const selected = new Set(['1/0', '2/0', '3/0']);
  const scope = new Set(['A']);
  assert.deepEqual(
    availableSelectedLayers(layers, selected, scope).map((item) => item.key),
    ['1/0', '3/0'],
  );
});

test('Mask alignment drag translates physical XY without modifying scale, rotation or source', () => {
  const original = Object.freeze({ x: -0.125, y: 1.23456789, scale: 1.25, rotation: 31.5 });
  const next = maskTransformAfterDrag(original, 48, -24, 12);
  assert.deepEqual(next, { x: 3.875, y: 3.23456789, scale: 1.25, rotation: 31.5 });
  assert.equal(original.x, -0.125);
  assert.equal(original.y, 1.23456789);
  assert.deepEqual(maskTransformAfterDrag(original, 0, 0, 12), original);
});

test('Mask alignment drag is independent of viewport zoom and validates projection inputs', () => {
  const original = { x: 10, y: 20, scale: 0.5, rotation: -93 };
  assert.deepEqual(
    maskTransformAfterDrag(original, 100, 50, 10),
    maskTransformAfterDrag(original, 200, 100, 20),
  );
  for (const s of [0, -1, Infinity, NaN]) {
    assert.equal(maskTransformAfterDrag(original, 10, 20, s), null);
  }
  assert.equal(maskTransformAfterDrag(original, Infinity, 20, 10), null);
  assert.equal(maskTransformAfterDrag({ ...original, x: Infinity }, 10, 20, 10), null);
});

test('zoom limit expands far beyond 12x for nanometre-scale features', () => {
  const limit = zoomLimitForFeature(0.005, 0.001);
  assert.ok(limit > 1_000_000);
  assert.ok(limit <= 100_000_000);
  assert.equal(zoomLimitForFeature(1, null), 12);
});
