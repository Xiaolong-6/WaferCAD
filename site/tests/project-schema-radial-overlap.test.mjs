import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ createModel }, { validateProcessModel }] = await Promise.all([
  import('../model.js'),
  import('../project-schema.js'),
]);

function ring(radius, n = 96) {
  const pts = Array.from({ length: n }, (_, index) => {
    const angle = (2 * Math.PI * index) / n;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  return [...pts, pts[0]];
}

function annulus(inner, outer) {
  return [[ring(outer), ring(inner).reverse()]];
}

function narrowBands() {
  const model = createModel({ shape: 'rect', width: 400, height: 400, thickness: 2 });
  model.regions = Array.from({ length: 30 }, (_, index) => ({
    id: `ring-${index}`,
    geom: annulus(25 + index, 25.72 + index),
    stack: [{ layerId: 'base', z0: -1, z1: 1 }],
  }));
  return model;
}

test('dense annular regions separated by gaps pass strict geometric validation', () => {
  assert.doesNotThrow(() => validateProcessModel(narrowBands()));
});

test('nearby but actually overlapping bands must still be rejected', () => {
  const model = narrowBands();
  model.regions[20].geom = annulus(44.5, 45.5);
  assert.throws(() => validateProcessModel(model), /overlaps model\.regions/);
});

test('exactly identical hollow polygons cannot bypass overlap validation', () => {
  const model = narrowBands();
  model.regions[29].geom = structuredClone(model.regions[28].geom);
  assert.throws(() => validateProcessModel(model), /overlaps model\.regions/);
});

test('a disk within a ring hole is allowed but crossing the hole wall fails', () => {
  const model = narrowBands();
  model.regions.push({
    id: 'center-island',
    geom: [[ring(10)]],
    stack: [{ layerId: 'base', z0: -1, z1: 1 }],
  });
  assert.doesNotThrow(() => validateProcessModel(model));
  model.regions.at(-1).geom = [[ring(25.2)]];
  assert.throws(() => validateProcessModel(model), /overlaps model\.regions/);
});
