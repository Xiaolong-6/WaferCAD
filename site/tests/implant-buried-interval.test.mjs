import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const { implantSectionBands, implantSolids } = await import('../model-view-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');
const {
  normalizeProcessRecipe,
  parseProcessRecipeSource,
  serializeProcessRecipe,
} = await import('../process-recipe.js');

test('buried Implant depths are physically clipped without changing substrate material', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 3, height: 3, thickness: 2 });
  const before = structuredClone(model);
  for (const startDepth of [-0.01, 0.3, 0.31, Infinity, NaN]) {
    const invalid = modelApi.applyOperation(model, {
      type: 'implant',
      name: 'Invalid buried interval',
      thickness: 0.3,
      depthStart: startDepth,
      face: 'front',
      area: model.boundary,
    });
    assert.equal(invalid.changed, false, 'Out-of-range interval must fail');
    assert.deepEqual(
      model,
      before,
      'Invalid Implant must leave material/History inputs untouched',
    );
  }
  const valid = modelApi.applyOperation(model, {
    type: 'implant',
    name: 'Buried marker',
    thickness: 0.3,
    depthStart: 0.1,
    face: 'front',
    area: model.boundary,
  });
  assert.equal(valid.changed, true);
  assert.equal(model.implants[0].depthStart, 0.1);
  assert.deepEqual(model.regions, before.regions, 'Annotations must not mutate material topology');
  validateProcessModel(model);
  const bands = implantSectionBands(model, [-1, 0], [1, 0]);
  assert.ok(bands.length > 0);
  for (const band of bands) {
    assert.ok(Math.abs(band.outerZ - 0.9) < 1e-9);
    assert.ok(Math.abs(band.innerZ - 0.7) < 1e-9);
    assert.equal(band.surfaceExposed, false);
  }
  const solids = implantSolids(model);
  assert.ok(solids.length > 0);
  for (const solid of solids) {
    assert.ok(Math.abs(solid.z0 - 0.7) < 1e-9);
    assert.ok(Math.abs(solid.z1 - 0.9) < 1e-9);
  }
});

test('legacy Implant and optional buried Recipe survive normalization and code round-trip', () => {
  const source = 'implant({ name: "HVT", depth: "300 nm", startDepth: "100 nm", area: "full" });';
  const a = parseProcessRecipeSource(source);
  assert.equal(a.steps[0].params.depthUm, 0.3);
  assert.equal(a.steps[0].params.startDepthUm, 0.1);
  const b = parseProcessRecipeSource(serializeProcessRecipe(a));
  assert.deepEqual(b.steps[0].params, a.steps[0].params);

  const legacy = normalizeProcessRecipe({
    steps: [{ command: 'implant', params: { name: 'Historical', depth: '200 nm' } }],
  });
  assert.equal(legacy.steps[0].params.startDepthUm, 0);
  const model = modelApi.createModel({ shape: 'rect', width: 3, height: 3, thickness: 2 });
  const applied = modelApi.applyOperation(model, {
    type: 'implant',
    name: 'Historical',
    thickness: 0.2,
    face: 'front',
    area: model.boundary,
  });
  assert.equal(applied.changed, true);
  assert.equal(model.implants[0].depthStart, undefined);
  const bands = implantSectionBands(model, [-1, 0], [1, 0]);
  assert.ok(bands.length);
  assert.ok(Math.abs(bands[0].outerZ - 1) < 1e-9);
  assert.ok(Math.abs(bands[0].innerZ - 0.8) < 1e-9);
});
