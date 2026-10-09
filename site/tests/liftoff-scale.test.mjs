import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vector = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { applyArrayOperation } = await import('../model-array-process.js');
const { ARRAY_MODEL_KERNEL, resolveArrayModel } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');

test('625-site Lift-off remains compact, selective and physically correct', () => {
  const leaf = modelApi.createModel({ shape: 'rect', width: 4, height: 4, thickness: 2 });
  const pmma = modelApi.applyOperation(leaf, {
    type: 'add', name: 'PMMA', thickness: 0.2, face: 'front',
    area: leaf.boundary, growth: 'direct',
  });
  modelApi.applyOperation(leaf, {
    type: 'etch', etchProfile: 'directional', thickness: 0.2,
    face: 'front', area: vector.rectMulti(1, 1),
    etchTargetLayerIds: [pmma.layerId],
  });
  const cr = modelApi.applyOperation(leaf, {
    type: 'add', name: 'Cr', thickness: 0.03,
    area: leaf.boundary, face: 'front', growth: 'direct',
  });
  const instances = [];
  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 25; col++)
      instances.push({
        id: `site-${row}-${col}`, templateId: 'metalens-unit',
        x: (col - 12) * 4, y: (row - 12) * 4,
      });
  }
  const array = {
    ...structuredClone(leaf),
    kernel: ARRAY_MODEL_KERNEL,
    width: 100,
    height: 100,
    boundary: vector.rectMulti(100, 100),
    regions: [],
    array: {
      version: 1,
      templates: [{ id: 'metalens-unit', model: structuredClone(leaf) }],
      instances,
    },
  };
  validateProcessModel(array);
  const beginning = performance.now();
  const result = applyArrayOperation(
    array,
    {
      type: 'liftoff', sacrificialLayerId: pmma.layerId,
      face: 'front', area: array.boundary,
    },
    (candidate, p) =>
      applyAdvancedProcessOperation(candidate, p, p.area, modelApi, vector),
  );
  const elapsed = performance.now() - beginning;
  assert.equal(result.changed, true, result.error);
  assert.equal(result.arrayChangedInstances, 625);
  assert.ok(result.arrayWorkingSets <= 625);
  assert.equal(array.array.instances.length, 625);
  assert.equal(array.array.templates.length, 1, 'identical post-lift-off sites must share one template');
  assert.equal(array.kernel, ARRAY_MODEL_KERNEL);
  validateProcessModel(array);

  for (const center of [[0, 0], [-48, -48], [48, 48]]) {
    const near = resolveArrayModel(array, {
      minX: center[0] - 1.95, maxX: center[0] + 1.95,
      minY: center[1] - 1.95, maxY: center[1] + 1.95,
    });
    const stackAt = (x, y) => near.regions.find((r) =>
      vector.pointInMulti([x, y], r.geom))?.stack.map((seg) => seg.layerId);
    assert.deepEqual(stackAt(center[0], center[1]), ['base', cr.layerId]);
    assert.deepEqual(stackAt(center[0] + 1.2, center[1]), ['base']);
  }
  // Performance telemetry is informative; no platform-specific timing ceiling.
  console.log(`Lift-off 625-site: ${elapsed.toFixed(1)} ms; ${result.arrayWorkingSets} working sets; ${array.array.templates.length} template`);
});
