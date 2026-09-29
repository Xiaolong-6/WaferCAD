import assert from 'node:assert/strict';
import test from 'node:test';

import {
  availableSelectedLayers,
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

test('zoom limit expands far beyond 12x for nanometre-scale features', () => {
  const limit = zoomLimitForFeature(0.005, 0.001);
  assert.ok(limit > 1_000_000);
  assert.ok(limit <= 100_000_000);
  assert.equal(zoomLimitForFeature(1, null), 12);
});
