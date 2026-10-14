import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGanMicrochannel,
  GAN_MICROCHANNEL_MASKS,
} from '../../scripts/build-gan-hemt-microchannel-example.mjs';
import { assertSameMaterialGeometry } from '../../scripts/magic1000-geometry-comparison.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { validateProcessModel } = await import('../project-schema.js');
const masks = new Map(GAN_MICROCHANNEL_MASKS.map((mask) => [mask.id, mask]));

function selectedArea(model, params) {
  if (params.area === 'full') return model.boundary;
  assert.equal(params.area, 'mask');
  const key = params.mask?.layerKeys?.[0];
  assert.ok(key, 'Recipe mask selector is missing');
  const number = Number(key.split('|')[0]);
  const mask = masks.get(number);
  assert.ok(mask, 'Recipe refers to unknown mask ' + key);
  return vectorApi.unionGeometries([
    ...mask.rectangles.map((r) => vectorApi.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2)),
    ...(mask.polygons || []).map((points) => [[ [...points, points[0]] ]]),
  ]);
}

test('GaN microchannel Recipe runs fresh from Base to identical physical material slabs', async () => {
  const { project } = await buildGanMicrochannel();
  const recipe = project.processRecipe;
  const model = modelApi.createModel(recipe.base);
  model.layers[0].name = recipe.base.material;
  let executed = 0;
  for (const step of recipe.steps) {
    const params = step.params;
    if (step.command === 'record') {
      model.revision++;
      model.processRevision++;
      executed++;
      continue;
    }
    let op;
    if (step.command === 'deposit') {
      op = {
        type: 'add',
        face: params.face,
        name: params.material,
        thickness: params.thicknessUm,
        growth: params.coverage,
        ...(params.coverage === 'transfer' ? { transferMode: params.placement } : {}),
      };
    } else if (step.command === 'etch') {
      op = {
        type: 'etch',
        face: params.face,
        thickness: params.thicknessUm,
        etchProfile: params.profile,
        ...(params.target ? {
          etchTargetLayerIds: model.layers.filter((layer) =>
            layer.name === params.target
          ).map((layer) => layer.id),
        } : {}),
      };
      if (params.target) assert.equal(op.etchTargetLayerIds.length, 1, 'Missing etch target');
    } else {
      assert.fail('Unrecognized Recipe operation ' + step.command);
    }
    const footprint = selectedArea(model, params);
    const result =
      applyAdvancedProcessOperation(model, op, footprint, modelApi, vectorApi) ||
      modelApi.applyOperation(model, { ...op, area: footprint });
    assert.equal(
      result?.changed,
      true,
      step.id + ' / ' + step.command + ' could not replay: ' + (result?.error || ''),
    );
    validateProcessModel(model);
    executed++;
  }
  assert.equal(executed, recipe.steps.length);
  const comparison = await assertSameMaterialGeometry(project.model, model);
  assert.equal(comparison.verified, true);
  assert.ok(comparison.slabsChecked >= 10);
});
