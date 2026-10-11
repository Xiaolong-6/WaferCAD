import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { applyProcessFaces } = await import('../process-face-execution.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { normalizeProcessRecipe, parseProcessRecipeSource, serializeProcessRecipe } =
  await import('../process-recipe.js');
const { validateProcessModel } = await import('../project-schema.js');
const { ARRAY_MODEL_KERNEL, resolveArrayModel } = await import('../model-array.js');

const slab = () => modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const stackAt = (model, point) =>
  model.regions.find((r) => vectorApi.pointInMulti(point, r.geom))?.stack || [];
const coat = { type: 'add', name: 'Al2O3', thickness: 0.2, growth: 'conformal', face: 'both' };

test('Both deposits a single shared layer on the two exposed wafer faces', () => {
  const model = slab();
  const result = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(result.changed, true, result.error);
  assert.equal(result.face, 'both');
  assert.equal(model.layers.length, 2, 'one layer identity for both surfaces');
  assert.equal(result.layerId, model.layers[1].id);
  assert.equal(model.processRevision, 2, 'Front then Back are both computed');
  const stack = stackAt(model, [0, 0]);
  assert.equal(stack.length, 3);
  assert.deepEqual(
    stack.map(({ layerId, z0, z1 }) => ({ layerId, z0, z1 })),
    [
      { layerId: result.layerId, z0: -5.2, z1: -5 },
      { layerId: 'base', z0: -5, z1: 5 },
      { layerId: result.layerId, z0: 5, z1: 5.2 },
    ],
  );
  validateProcessModel(model);
});

test('Both applies the same mask footprint to both faces without coating outside', () => {
  const model = slab();
  const result = modelApi.applyOperation(model, {
    type: 'add', name: 'SiNx', thickness: 0.1, face: 'both', area: vectorApi.rectMulti(4, 4),
  });
  assert.equal(result.changed, true, result.error);
  assert.equal(stackAt(model, [0, 0]).length, 3);
  assert.equal(stackAt(model, [8, 0]).length, 1);
  validateProcessModel(model);
});

test('Both Extend grows the shared film on both sides', () => {
  const model = slab();
  const deposit = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(deposit.changed, true);
  const extend = modelApi.applyOperation(model, {
    type: 'grow', thickness: 0.1, growth: 'direct', targetLayerId: deposit.layerId,
    face: 'both', area: model.boundary,
  });
  assert.equal(extend.changed, true, extend.error);
  const stack = stackAt(model, [0, 0]);
  assert.ok(Math.abs(stack[0].z0 + 5.3) < 1e-8);
  assert.ok(Math.abs(stack.at(-1).z1 - 5.3) < 1e-8);
  assert.equal(model.layers.length, 2);
  validateProcessModel(model);
});

test('Both is atomic if Back fails after a successful Front operation', () => {
  const model = slab();
  const front = modelApi.applyOperation(model, {
    type: 'add', name: 'Top only', thickness: 0.1, face: 'front', area: model.boundary,
  });
  assert.equal(front.changed, true);
  const before = structuredClone(model);
  const result = modelApi.applyOperation(model, {
    type: 'grow', targetLayerId: front.layerId, thickness: 0.1, face: 'both',
    area: model.boundary,
  });
  assert.equal(result.changed, false);
  assert.match(result.error, /^Back face:/);
  assert.deepEqual(model, before, 'Front growth must not leak after Back rejection');
});

test('Both Transfer preserves one material identity and both surface placements', () => {
  const model = slab();
  const applied = applyProcessFaces(
    model,
    { type: 'add', name: 'Laminate', growth: 'transfer', transferMode: 'follow',
      thickness: 0.15, face: 'both', area: model.boundary },
    (candidate, params) =>
      applyAdvancedProcessOperation(candidate, params, params.area, modelApi, vectorApi) ??
      modelApi.applyOperation(candidate, params),
  );
  assert.equal(applied.result.changed, true, applied.result.error);
  assert.equal(applied.model.layers.length, 2);
  const stack = stackAt(applied.model, [0, 0]);
  assert.equal(stack[0].layerId, applied.result.layerId);
  assert.equal(stack.at(-1).layerId, applied.result.layerId);
  validateProcessModel(applied.model);
  assert.equal(model.layers.length, 1, 'worker-style caller input remains unchanged');
});

test('Both annotations retain separate physical faces and IDs in one logical operation', () => {
  const model = slab();
  const implant = modelApi.applyOperation(model, {
    type: 'implant', name: 'Dual-side doping', thickness: 0.1, face: 'both',
    area: model.boundary,
  });
  assert.equal(implant.changed, true, implant.error);
  assert.equal(model.implants.length, 2);
  assert.deepEqual(model.implants.map(({ face }) => face), ['front', 'back']);
  assert.deepEqual(implant.implantIds, model.implants.map(({ id }) => id));
  const electrical = modelApi.applyOperation(model, {
    type: 'electrical', name: 'Surface passivation', thickness: 0.01, face: 'both',
    area: model.boundary,
  });
  assert.equal(electrical.changed, true, electrical.error);
  assert.deepEqual(electrical.electricalRegionIds, model.electricalRegions.map(({ id }) => id));
  assert.deepEqual(model.electricalRegions.map(({ face }) => face), ['front', 'back']);
  validateProcessModel(model);
});

test('Both works with canonical array templates without flattening the wafer', () => {
  const leaf = slab();
  const model = {
    ...leaf, kernel: ARRAY_MODEL_KERNEL, width: 40,
    boundary: vectorApi.rectMulti(40, 20), regions: [],
    array: { version: 1, templates: [{ id: 'cell', model: leaf }],
      instances: [
        { id: 'left', templateId: 'cell', x: -10, y: 0 },
        { id: 'right', templateId: 'cell', x: 10, y: 0 },
      ],
    },
  };
  const result = modelApi.applyOperation(model, {
    type: 'add', name: 'Dual array film', thickness: 0.1, face: 'both',
    area: model.boundary,
  });
  assert.equal(result.changed, true, result.error);
  assert.equal(model.regions.length, 0);
  assert.equal(model.layers.length, 2);
  const expanded = resolveArrayModel(model);
  assert.equal(stackAt(expanded, [-10, 0]).length, 3);
  assert.equal(stackAt(expanded, [10, 0]).length, 3);
  for (const region of expanded.regions)
    assert.equal(region.stack[0].layerId, region.stack.at(-1).layerId);
  validateProcessModel(model);
});

test('Both recipe parses, normalizes and serializes without falling back to Front', () => {
  const source = 'deposit({ material: "Al2O3", thickness: "20 nm", coverage: "conformal", face: "both", area: "full" });';
  const parsed = parseProcessRecipeSource(source);
  assert.equal(parsed.steps[0].params.face, 'both');
  assert.equal(normalizeProcessRecipe(parsed).steps[0].params.face, 'both');
  assert.equal(parseProcessRecipeSource(serializeProcessRecipe(parsed)).steps[0].params.face, 'both');
  assert.throws(() => parseProcessRecipeSource(source.replace('face: "both"', 'face: "side"')), /Unsupported recipe face/);
});

test('Both rejects Planarize and Lift-off without changing the model', () => {
  const model = slab();
  const before = structuredClone(model);
  for (const params of [
    { type: 'etch', etchProfile: 'planarize', targetZ: 0, thickness: 0 },
    { type: 'liftoff', sacrificialLayerId: 'layer-1' },
  ]) {
    const result = modelApi.applyOperation(model, { ...params, face: 'both', area: model.boundary });
    assert.equal(result.changed, false);
    assert.match(result.error, /Both faces are unsupported/);
    assert.deepEqual(model, before);
  }
});
