import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { applyOperation, createModel, geometryArea } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');

test('Conformal does not assign a boolean-retry crack across two valid material owners', () => {
  // Synthetic step geometry, independent of any user project or layout.
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.regions = [
    { id: 'left', geom: rectMulti(10, 10, -5, 0), stack: [{ layerId: 'base', z0: -4, z1: 4 }] },
    { id: 'right', geom: rectMulti(10, 10, 5, 0), stack: [{ layerId: 'base', z0: -4, z1: 3 }] },
  ];
  validateProcessModel(model);
  const kernel = globalThis.polygonClipping;
  let coverageCalls = 0;
  globalThis.polygonClipping = {
    ...kernel,
    difference(...geometries) {
      const result = kernel.difference(...geometries);
      const coverageQuery =
        geometries.length === 2 &&
        !result.length &&
        Math.abs(geometryArea(geometries[0]) - 200) < 1e-8 &&
        Math.abs(geometryArea(geometries[1]) - 200) < 1e-8;
      if (coverageQuery && ++coverageCalls === 2) {
        // Emulate a sub-grid uncovered-domain artifact only after coating.
        return rectMulti(5e-5, 2, 1, 0);
      }
      return result;
    },
  };
  try {
    const result = applyOperation(model, {
      type: 'add',
      name: 'Coat',
      thickness: 1,
      face: 'front',
      growth: 'conformal',
      area: model.boundary,
    });
    assert.equal(result.changed, true, result.error);
    assert.ok(coverageCalls >= 2, 'The post-coating coverage path was exercised');
    validateProcessModel(model);
    assert.equal(model.layers.length, 2);
    assert.ok(
      model.regions.some((region) =>
        region.stack.some(
          (segment) => segment.layerId === result.layerId && segment.role === 'conformal-sidewall',
        ),
      ),
    );
  } finally {
    globalThis.polygonClipping = kernel;
  }
});
