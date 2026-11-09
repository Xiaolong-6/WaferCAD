import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');
const { provablyDisjointGridGeometry } = await import('../geometry-grid-separation.js');
const { robustIntersection } = await import('../polygon-boolean.js');
const { materialGeometryArea } = await import('../material-process-boolean.js');

const rect = (x0, x1, y0, y1) => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
];
function twoRegions(first, second) {
  const model = createModel({ shape: 'rect', width: 6, height: 6, thickness: 1 });
  model.regions = [
    { ...model.regions[0], id: 'left', geom: first },
    { ...model.regions[0], id: 'right', geom: second },
  ];
  return model;
}

test('near-grid coordinates cannot erase finite physical overlap in validation', () => {
  const left = rect(-1, 1, -2, 2);
  for (const overlapUm of [3e-14, 5e-14, 8e-14]) {
    const right = rect(1 - overlapUm, 2, -2, 2);
    assert.ok(materialGeometryArea(robustIntersection(left, right)) > 1e-13);
    assert.equal(provablyDisjointGridGeometry(left, right), false);
    assert.throws(() => validateProcessModel(twoRegions(left, right)), /geom overlaps/);
  }
});

test('exact 0.1 nm-scale material grid segments still distinguish touching from overlap', () => {
  const left = rect(-1, 1, -2, 2);
  const touching = rect(1, 2, -2, 2);
  const overlapping = rect(1 - 1e-7, 2, -2, 2);
  assert.equal(provablyDisjointGridGeometry(left, touching), true);
  validateProcessModel(twoRegions(left, touching));
  assert.equal(provablyDisjointGridGeometry(left, overlapping), false);
  assert.throws(() => validateProcessModel(twoRegions(left, overlapping)), /geom overlaps/);
});

test('a sub-grid physical gap is never mistaken for exact grid disjointness', () => {
  const left = rect(-1, 1, -2, 2);
  const right = rect(1 + 5e-14, 2, -2, 2);
  assert.equal(provablyDisjointGridGeometry(left, right), false);
  validateProcessModel(twoRegions(left, right));
});
