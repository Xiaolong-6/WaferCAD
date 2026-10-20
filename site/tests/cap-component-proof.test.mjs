import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ buildRenderSurfacePlan }, { createModel }, { rectMulti }] = await Promise.all([
  import('../renderer-geometry.js'),
  import('../model.js'),
  import('../vector-geometry.js'),
]);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function twoMaterialIslands(x = 10) {
  const model = createModel({ shape: 'rect', width: 50, height: 50, thickness: 4 });
  model.layers.push({ id: 'top', name: 'Top', color: '#ffbb44' });
  model.regions = [
    {
      id: 'base-islands',
      geom: [...rectMulti(2, 2, -10, -10), ...rectMulti(2, 2, 10, 10)],
      stack: [{ layerId: 'base', z0: -2, z1: 0 }],
    },
    {
      id: 'top-islands',
      geom: [...rectMulti(2, 2, x, -10), ...rectMulti(2, 2, -10, 10)],
      stack: [{ layerId: 'top', z0: 0, z1: 2 }],
    },
  ];
  return model;
}

test('disconnected opposite-height cap footprints bypass exact polygon Boolean without mutating input', () => {
  const model = twoMaterialIslands();
  const before = JSON.stringify(model);
  const kernel = globalThis.polygonClipping;
  const original = kernel.intersection;
  let calls = 0;
  kernel.intersection = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    const result = buildRenderSurfacePlan(model);
    assert.ok(result.caps.length);
    assert.equal(calls, 0, 'provably disjoint cap components must not enter polygon-clipping');
    assert.equal(JSON.stringify(model), before);
    assert.equal(hash(result), '2fbcf8f7f5c953d76f0f86fa63e91b0f5f251711a206b29040ef6990a50588f6');
  } finally {
    kernel.intersection = original;
  }
});

test('EPS-near cap interfaces still invoke the full exact polygon Boolean', () => {
  const model = twoMaterialIslands(-8 + 0.5e-8);
  const kernel = globalThis.polygonClipping;
  const original = kernel.intersection;
  let calls = 0;
  kernel.intersection = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    const result = buildRenderSurfacePlan(model);
    assert.ok(calls > 0, 'uncertain touching/near-contact must retain exact Boolean');
    assert.equal(hash(result), '99c117157e3f7d8e2f2d946f7ebc7801fa8265ef43c9ccca57b0e8b01df304bf');
  } finally {
    kernel.intersection = original;
  }
});
