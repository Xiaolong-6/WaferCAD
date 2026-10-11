import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { applyProcessFaces } = await import('../process-face-execution.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { normalizeProcessRecipe, parseProcessRecipeSource, serializeProcessRecipe } =
  await import('../process-recipe.js');
const { validateProcessModel, migrateProjectFile } = await import('../project-schema.js');
const { ARRAY_MODEL_KERNEL, resolveArrayModel } = await import('../model-array.js');
const { serializeProject, readProjectFile } = await import('../project-io.js');

const slab = () => modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const stackAt = (model, point) =>
  model.regions.find((r) => vectorApi.pointInMulti(point, r.geom))?.stack || [];
const coat = { type: 'add', name: 'Al2O3', thickness: 0.2, growth: 'conformal', face: 'both' };

test('Both deposits two linked independent layers on the two exposed wafer faces', () => {
  const model = slab();
  const result = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(result.changed, true, result.error);
  assert.equal(result.face, 'both');
  assert.equal(model.layers.length, 3, 'one distinct layer ID per face');
  assert.notEqual(result.layerIds.front, result.layerIds.back);
  assert.equal(result.layerId, result.layerIds.front);
  assert.equal(model.layers[1].id, result.layerIds.front);
  assert.equal(model.layers[2].id, result.layerIds.back);
  assert.equal(model.layers[1].processGroupId, model.layers[2].processGroupId);
  assert.equal(model.layers[1].pairedLayerId, model.layers[2].id);
  assert.equal(model.layers[2].pairedLayerId, model.layers[1].id);
  assert.deepEqual(
    model.layers.slice(1).map((layer) => layer.processFace),
    ['front', 'back'],
  );
  assert.equal(model.processRevision, 2, 'Front then Back are both computed');
  const stack = stackAt(model, [0, 0]);
  assert.equal(stack.length, 3);
  assert.deepEqual(
    stack.map(({ layerId, z0, z1 }) => ({ layerId, z0, z1 })),
    [
      { layerId: result.layerIds.back, z0: -5.2, z1: -5 },
      { layerId: 'base', z0: -5, z1: 5 },
      { layerId: result.layerIds.front, z0: 5, z1: 5.2 },
    ],
  );
  validateProcessModel(model);
});

test('Both applies the same mask footprint to both faces without coating outside', () => {
  const model = slab();
  const result = modelApi.applyOperation(model, {
    type: 'add',
    name: 'SiNx',
    thickness: 0.1,
    face: 'both',
    area: vectorApi.rectMulti(4, 4),
  });
  assert.equal(result.changed, true, result.error);
  assert.equal(stackAt(model, [0, 0]).length, 3);
  assert.equal(stackAt(model, [8, 0]).length, 1);
  validateProcessModel(model);
});

test('Both Extend targets paired independent films on both sides', () => {
  const model = slab();
  const deposit = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(deposit.changed, true);
  const extend = modelApi.applyOperation(model, {
    type: 'grow',
    thickness: 0.1,
    growth: 'direct',
    targetLayerId: deposit.layerId,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(extend.changed, true, extend.error);
  const stack = stackAt(model, [0, 0]);
  assert.ok(Math.abs(stack[0].z0 + 5.3) < 1e-8);
  assert.ok(Math.abs(stack.at(-1).z1 - 5.3) < 1e-8);
  assert.equal(model.layers.length, 3);
  assert.equal(model.layers[1].pairedLayerId, model.layers[2].id);
  validateProcessModel(model);
});

test('Both is atomic if Back fails after a successful Front operation', () => {
  const model = slab();
  const front = modelApi.applyOperation(model, {
    type: 'add',
    name: 'Top only',
    thickness: 0.1,
    face: 'front',
    area: model.boundary,
  });
  assert.equal(front.changed, true);
  const before = structuredClone(model);
  const result = modelApi.applyOperation(model, {
    type: 'grow',
    targetLayerId: front.layerId,
    thickness: 0.1,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(result.changed, false);
  assert.match(result.error, /^Back face:/);
  assert.deepEqual(model, before, 'Front growth must not leak after Back rejection');
});

test('Both Transfer creates independently identifiable surface films', () => {
  const model = slab();
  const applied = applyProcessFaces(
    model,
    {
      type: 'add',
      name: 'Laminate',
      growth: 'transfer',
      transferMode: 'follow',
      thickness: 0.15,
      face: 'both',
      area: model.boundary,
    },
    (candidate, params) =>
      applyAdvancedProcessOperation(candidate, params, params.area, modelApi, vectorApi) ??
      modelApi.applyOperation(candidate, params),
  );
  assert.equal(applied.result.changed, true, applied.result.error);
  assert.equal(applied.model.layers.length, 3);
  assert.notEqual(applied.result.layerIds.front, applied.result.layerIds.back);
  const stack = stackAt(applied.model, [0, 0]);
  assert.equal(stack[0].layerId, applied.result.layerIds.back);
  assert.equal(stack.at(-1).layerId, applied.result.layerIds.front);
  validateProcessModel(applied.model);
  assert.equal(model.layers.length, 1, 'worker-style caller input remains unchanged');
});

test('Both selective Etch maps the front target to its paired back layer', () => {
  const model = slab();
  const added = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(added.changed, true, added.error);
  const removed = modelApi.applyOperation(model, {
    type: 'etch',
    thickness: 0.1,
    etchProfile: 'directional',
    etchTargetLayerIds: [added.layerIds.front],
    face: 'both',
    area: model.boundary,
  });
  assert.equal(removed.changed, true, removed.error);
  const stack = stackAt(model, [0, 0]);
  assert.ok(Math.abs(stack[0].z0 + 5.1) < 1e-8);
  assert.ok(Math.abs(stack.at(-1).z1 - 5.1) < 1e-8);
  validateProcessModel(model);
});

test('single-face selective Etch can remove one coating without touching the other', () => {
  const model = slab();
  const added = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(added.changed, true, added.error);
  const result = modelApi.applyOperation(model, {
    type: 'etch',
    thickness: 0.2,
    etchProfile: 'directional',
    etchTargetLayerIds: [added.layerIds.front],
    face: 'front',
    area: model.boundary,
  });
  assert.equal(result.changed, true, result.error);
  const stack = stackAt(model, [0, 0]);
  assert.equal(stack[0].layerId, added.layerIds.back);
  assert.equal(stack.at(-1).layerId, 'base');
  validateProcessModel(model);
});

test('Both annotations retain separate physical faces and IDs in one logical operation', () => {
  const model = slab();
  const implant = modelApi.applyOperation(model, {
    type: 'implant',
    name: 'Dual-side doping',
    thickness: 0.1,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(implant.changed, true, implant.error);
  assert.equal(model.implants.length, 2);
  assert.deepEqual(
    model.implants.map(({ face }) => face),
    ['front', 'back'],
  );
  assert.deepEqual(
    implant.implantIds,
    model.implants.map(({ id }) => id),
  );
  const electrical = modelApi.applyOperation(model, {
    type: 'electrical',
    name: 'Surface passivation',
    thickness: 0.01,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(electrical.changed, true, electrical.error);
  assert.deepEqual(
    electrical.electricalRegionIds,
    model.electricalRegions.map(({ id }) => id),
  );
  assert.deepEqual(
    model.electricalRegions.map(({ face }) => face),
    ['front', 'back'],
  );
  validateProcessModel(model);
});

test('Both works with canonical array templates without flattening the wafer', () => {
  const leaf = slab();
  const model = {
    ...leaf,
    kernel: ARRAY_MODEL_KERNEL,
    width: 40,
    boundary: vectorApi.rectMulti(40, 20),
    regions: [],
    array: {
      version: 1,
      templates: [{ id: 'cell', model: leaf }],
      instances: [
        { id: 'left', templateId: 'cell', x: -10, y: 0 },
        { id: 'right', templateId: 'cell', x: 10, y: 0 },
      ],
    },
  };
  const result = modelApi.applyOperation(model, {
    type: 'add',
    name: 'Dual array film',
    thickness: 0.1,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(result.changed, true, result.error);
  assert.equal(model.regions.length, 0);
  assert.equal(model.layers.length, 3);
  const expanded = resolveArrayModel(model);
  assert.equal(stackAt(expanded, [-10, 0]).length, 3);
  assert.equal(stackAt(expanded, [10, 0]).length, 3);
  for (const region of expanded.regions) {
    assert.equal(region.stack[0].layerId, result.layerIds.back);
    assert.equal(region.stack.at(-1).layerId, result.layerIds.front);
  }
  validateProcessModel(model);
});

test('Both linked layers survive normal project export and import', async () => {
  const model = slab();
  const deposited = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(deposited.changed, true, deposited.error);
  const project = migrateProjectFile(
    projectForBenchmark({
      model,
      section: { a: [-9, 0], b: [9, 0] },
    }),
  );
  const text = serializeProject(project);
  const restored = await readProjectFile({
    size: Buffer.byteLength(text),
    text: async () => text,
  });
  const front = restored.model.layers.find((layer) => layer.id === deposited.layerIds.front);
  const back = restored.model.layers.find((layer) => layer.id === deposited.layerIds.back);
  assert.equal(front.processFace, 'front');
  assert.equal(back.processFace, 'back');
  assert.equal(front.processGroupId, back.processGroupId);
  assert.equal(front.pairedLayerId, back.id);
  assert.equal(back.pairedLayerId, front.id);
});

test('Both recipe parses, normalizes and serializes without falling back to Front', () => {
  const source =
    'deposit({ material: "Al2O3", thickness: "20 nm", coverage: "conformal", face: "both", area: "full" });';
  const parsed = parseProcessRecipeSource(source);
  assert.equal(parsed.steps[0].params.face, 'both');
  assert.equal(normalizeProcessRecipe(parsed).steps[0].params.face, 'both');
  assert.equal(
    parseProcessRecipeSource(serializeProcessRecipe(parsed)).steps[0].params.face,
    'both',
  );
  assert.throws(
    () => parseProcessRecipeSource(source.replace('face: "both"', 'face: "side"')),
    /Unsupported recipe face/,
  );
});

test('Both rejects Planarize and Lift-off without changing the model', () => {
  const model = slab();
  const before = structuredClone(model);
  for (const params of [
    { type: 'etch', etchProfile: 'planarize', targetZ: 0, thickness: 0 },
    { type: 'liftoff', sacrificialLayerId: 'layer-1' },
  ]) {
    const result = modelApi.applyOperation(model, {
      ...params,
      face: 'both',
      area: model.boundary,
    });
    assert.equal(result.changed, false);
    assert.match(result.error, /Both faces are unsupported/);
    assert.deepEqual(model, before);
  }
});


test('deleting only one Both film unlinks its surviving counterpart', () => {
  const model = slab();
  const deposited = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(deposited.changed, true, deposited.error);
  assert.equal(modelApi.deleteExposedLayer(model, deposited.layerIds.back), true);
  assert.equal(model.layers.length, 2);
  const front = model.layers.find((layer) => layer.id === deposited.layerIds.front);
  assert.equal(front.processFace, 'front');
  assert.equal(front.processGroupId, deposited.layerGroupId);
  assert.equal(front.pairedLayerId, undefined);
  const before = structuredClone(model);
  const attempt = modelApi.applyOperation(model, {
    type: 'grow',
    thickness: 0.1,
    growth: 'direct',
    targetLayerId: front.id,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(attempt.changed, false);
  assert.match(attempt.error, /^Back face:/);
  assert.deepEqual(model, before);
  validateProcessModel(model);
});

test('incomplete stored Both pairing fails safely without partial geometry', () => {
  const model = slab();
  const deposited = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(deposited.changed, true, deposited.error);
  const back = model.layers.find((layer) => layer.id === deposited.layerIds.back);
  back.pairedLayerId = 'layer-missing';
  const before = structuredClone(model);
  const attempt = modelApi.applyOperation(model, {
    type: 'grow',
    thickness: 0.1,
    targetLayerId: deposited.layerIds.front,
    face: 'both',
    area: model.boundary,
  });
  assert.equal(attempt.changed, false);
  assert.match(attempt.error, /Back face: Both-face material pair is incomplete/);
  assert.deepEqual(model, before);
});

test('array Both deletion unlinks the surviving layer throughout its templates', () => {
  const leaf = slab();
  const model = {
    ...leaf,
    kernel: ARRAY_MODEL_KERNEL,
    regions: [],
    array: {
      version: 1,
      templates: [{ id: 'cell', model: leaf }],
      instances: [{ id: 'one', templateId: 'cell', x: 0, y: 0 }],
    },
  };
  const added = modelApi.applyOperation(model, { ...coat, area: model.boundary });
  assert.equal(added.changed, true, added.error);
  assert.equal(modelApi.deleteExposedLayer(model, added.layerIds.back), true);
  const front = model.layers.find((layer) => layer.id === added.layerIds.front);
  assert.equal(front.pairedLayerId, undefined);
  for (const template of model.array.templates) {
    const remaining = template.model.layers.find((layer) => layer.id === added.layerIds.front);
    assert.equal(remaining.pairedLayerId, undefined);
  }
  validateProcessModel(model);
});
