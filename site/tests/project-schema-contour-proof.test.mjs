import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ createModel }, { validateProcessModel }] = await Promise.all([
  import('../model.js'),
  import('../project-schema.js'),
]);

function polygon(points) {
  return [[[...points, [...points[0]]]]];
}
function modelWithRegionPairs(first, second) {
  const model = createModel({ shape: 'rect', width: 40, height: 40, thickness: 2 });
  model.regions = [first, second].map((geom, index) => ({
    id: `shape-${index}`,
    geom,
    stack: [{ layerId: 'base', z0: -1, z1: 1 }],
  }));
  return model;
}
const lShape = polygon([
  [-8, -8],
  [8, -8],
  [8, -6],
  [-6, -6],
  [-6, 8],
  [-8, 8],
]);
const square = (x0, y0, x1, y1) =>
  polygon([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);

test('nonoverlapping concave shapes sharing XY bounds pass the exact validator', () => {
  assert.doesNotThrow(() => validateProcessModel(modelWithRegionPairs(lShape, square(0, 0, 2, 2))));
});

test('small positive-area overlap with a concave shape still fails', () => {
  assert.throws(
    () => validateProcessModel(modelWithRegionPairs(lShape, square(-6.0005, 0, -5, 2))),
    /overlaps model\.regions/,
  );
});

test('vertex/edge contacts and narrow clearance do not become false positives', () => {
  assert.doesNotThrow(() =>
    validateProcessModel(modelWithRegionPairs(lShape, square(-6, 0, -5, 2))),
  );
  assert.doesNotThrow(() =>
    validateProcessModel(modelWithRegionPairs(lShape, square(-5.999, 0, -5, 2))),
  );
});

test('fully contained regions are rejected even when no contour edges cross', () => {
  const outer = square(-9, -9, 9, 9);
  assert.throws(
    () => validateProcessModel(modelWithRegionPairs(outer, square(-1, -1, 1, 1))),
    /overlaps model\.regions/,
  );
});

// Their XY bounds overlap, but x+y projections are separated. A real
// positive-area overlap must remain rejected by the unchanged Boolean path.
test('45-degree conservative interval proof distinguishes separated and overlapping diamonds', () => {
  const diamond = (cx, cy, radius) =>
    polygon([
      [cx - radius, cy],
      [cx, cy - radius],
      [cx + radius, cy],
      [cx, cy + radius],
    ]);
  assert.doesNotThrow(() =>
    validateProcessModel(modelWithRegionPairs(diamond(0, 0, 5), diamond(5, 5, 2))),
  );
  assert.throws(
    () => validateProcessModel(modelWithRegionPairs(diamond(0, 0, 5), diamond(3, 3, 2))),
    /overlaps model\.regions/,
  );
});
