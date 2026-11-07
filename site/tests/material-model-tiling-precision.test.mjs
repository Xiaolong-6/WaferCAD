import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { resolveArrayModel } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');
const { difference, materialGeometryArea } = await import('../material-process-boolean.js');

test('3 µm dense chip tile boundaries share exact material-grid coordinates', () => {
  // 125.6108 µm is the boundary of the original chip2 dense-halo fixture.
  // Before canonical local translation, a derived -1.4999999999999982 µm
  // border falsely excludes the actual -1.5 µm clipped substrate polygon.
  const source = createModel({ shape: 'rect', width: 125.6108, height: 125.6108, thickness: 1 });
  const original = structuredClone(source);
  const tiled = tileMaterialModel(source, { cellSizeUm: 3 });
  assert.deepEqual(source, original, 'tiling must not mutate the source model');
  for (const { model } of tiled.array.templates) validateProcessModel(model);
  validateProcessModel(tiled);
  const restored = resolveArrayModel(tiled);
  validateProcessModel(restored);
  assert.equal(materialGeometryArea(difference(original.boundary, restored.boundary)), 0);
  assert.equal(materialGeometryArea(difference(restored.boundary, original.boundary)), 0);
  for (const { model } of tiled.array.templates) {
    for (const polygon of model.boundary)
      for (const ring of polygon)
        for (const point of ring)
          for (const coordinate of point) {
            const scaled = coordinate * 10000000;
            assert.ok(Math.abs(scaled - Math.round(scaled)) < 1e-6);
          }
  }
});
