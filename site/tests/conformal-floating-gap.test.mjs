import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createModel, applyOperation } = await import('../model.js');
const { difference, pointInMulti, rectMulti } = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');

function buildFloatingCap(face) {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 10 });
  const island = rectMulti(4, 10);
  const remaining = difference(model.boundary, island);
  model.layers.push({
    id: 'floating',
    name: 'Floating disjoint slab',
    visible: true,
    color: '#aaaaaa',
  });
  model.regions = [
    {
      id: 'region-1',
      geom: island,
      stack: [
        { layerId: 'base', z0: -5, z1: 5 },
        {
          layerId: 'floating',
          z0: face === 'front' ? 9 : -11,
          z1: face === 'front' ? 11 : -9,
        },
      ].sort((a, b) => a.z0 - b.z0),
    },
    {
      id: 'region-2',
      geom: remaining,
      stack: [{ layerId: 'base', z0: -5, z1: 5 }],
    },
  ];
  model.nextRegionId = 3;
  validateProcessModel(model);
  return model;
}

function materialAt(model, x, z, layerId = null) {
  return model.regions.some(
    (region) =>
      pointInMulti([x, 0], region.geom) &&
      region.stack.some((s) => s.z0 < z && s.z1 > z && (layerId == null || s.layerId === layerId)),
  );
}

test('Conformal on a floating cap never bridges the real internal air gap (front/back)', () => {
  for (const face of ['front', 'back']) {
    const model = buildFloatingCap(face);
    const inVoid = face === 'front' ? 7 : -7;
    const nearCap = face === 'front' ? 10 : -10;
    assert.equal(materialAt(model, 2.25, inVoid), false, 'Precondition: air gap is void');

    const coating = applyOperation(model, {
      type: 'add',
      name: 'Thin conformal coating',
      thickness: 0.5,
      growth: 'conformal',
      face,
      area: model.boundary,
    });
    assert.equal(coating.changed, true, coating.error);
    validateProcessModel(model);
    assert.equal(
      materialAt(model, 2.25, inVoid),
      false,
      face + ': conformal built a false Z-spanning wall through the floating gap',
    );
    assert.equal(
      materialAt(model, 2.25, nearCap, coating.layerId),
      true,
      face + ': the genuine exposed cap sidewall lost its conformal coating',
    );
    assert.equal(
      materialAt(model, 2.25, face === 'front' ? 5.25 : -5.25, coating.layerId),
      true,
      face + ': the lower base surface lost its horizontal coating',
    );
  }
});
