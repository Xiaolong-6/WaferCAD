import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel, fullFaceGeometry, layerById, surfaceSegment } =
  await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

function stackAt(model, x, y = 0) {
  return model.regions.find((region) => pointInMulti([x, y], region.geom))?.stack || [];
}

test('the First 10 Minutes process produces an oxide window without etching the Base', () => {
  const model = createModel({ shape: 'rect', width: 100, height: 100, thickness: 10 });
  assert.equal(model.layers[0].name, 'Base');
  assert.deepEqual(
    stackAt(model, 0).map((segment) => segment.layerId),
    ['base'],
  );

  const coat = applyOperation(model, {
    type: 'add',
    name: 'SiO2',
    thickness: 0.2,
    face: 'front',
    growth: 'direct',
    area: fullFaceGeometry(model),
  });
  assert.equal(coat.changed, true, coat.error);
  assert.equal(layerById(model, coat.layerId).name, 'SiO2');

  for (const x of [0, 30]) {
    assert.equal(surfaceSegment(stackAt(model, x), 'front').layerId, coat.layerId);
  }

  const opening = applyOperation(model, {
    type: 'etch',
    thickness: 0.2,
    face: 'front',
    etchProfile: 'directional',
    etchTargetLayerIds: [coat.layerId],
    area: rectMulti(20, 20),
  });
  assert.equal(opening.changed, true, opening.error);

  const throughOpening = stackAt(model, 0);
  assert.deepEqual(
    throughOpening.map((segment) => segment.layerId),
    ['base'],
    'the etch must expose the original Base without creating a substrate hole',
  );
  assert.deepEqual([throughOpening[0].z0, throughOpening[0].z1], [-5, 5]);

  const outsideOpening = stackAt(model, 30);
  assert.deepEqual(
    outsideOpening.map((segment) => segment.layerId),
    ['base', coat.layerId],
    'the oxide outside the drawn mask must remain',
  );
  const oxide = outsideOpening.find((segment) => segment.layerId === coat.layerId);
  assert.ok(Math.abs(oxide.z0 - 5) < 1e-8);
  assert.ok(Math.abs(oxide.z1 - 5.2) < 1e-8);
});
