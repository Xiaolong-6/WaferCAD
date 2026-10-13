import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const { applyProcessFaces } = await import('../process-face-execution.js');
const { validateProcessModel } = await import('../project-schema.js');
const { pointInMulti } = await import('../vector-geometry.js');

function stackAt(model, point = [0, 0]) {
  const region = model.regions.find((item) => pointInMulti(point, item.geom));
  assert.ok(region, 'expected a material region containing the probe');
  return region.stack;
}

function checkStacks(model) {
  validateProcessModel(model);
  const ids = new Set(model.layers.map((layer) => layer.id));
  assert.equal(ids.size, model.layers.length, 'material Layer IDs must remain unique');
  for (const region of model.regions) {
    let previousZ = -Infinity;
    for (const segment of region.stack) {
      assert.ok(ids.has(segment.layerId), `dangling Layer ID ${segment.layerId}`);
      assert.ok(Number.isFinite(segment.z0) && Number.isFinite(segment.z1));
      assert.ok(segment.z1 > segment.z0, 'canonical material segments have positive thickness');
      assert.ok(segment.z0 >= previousZ - 1e-10, 'one XY stack may not overlap in Z');
      previousZ = segment.z1;
    }
  }
}

for (const outcome of ['front-throw', 'front-decline', 'back-throw', 'back-decline']) {
  test(`Both-face fault ${outcome} cannot partially commit even if a callback mutates its candidate`, () => {
    const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
    const before = structuredClone(model);
    const result = applyProcessFaces(
      model,
      { type: 'add', name: 'Fault injection', thickness: 0.2, face: 'both', area: model.boundary },
      (candidate, params) => {
        candidate.layers.push({ id: `injected-${params.face}`, name: 'Incomplete' });
        candidate.processRevision++;
        if (outcome === `${params.face}-throw`) throw new Error('synthetic worker failure');
        if (outcome === `${params.face}-decline`) {
          return { changed: false, error: 'synthetic no-change failure' };
        }
        return { changed: true, layerId: `injected-${params.face}` };
      },
    );
    assert.equal(result.result.changed, false);
    assert.strictEqual(result.model, model, 'failure returns the unchanged input model');
    assert.deepEqual(model, before, 'Front and Back must share one all-or-nothing transaction');
    assert.match(result.result.error, /face:/i);
    checkStacks(model);
  });
}

for (const seed of [3, 11, 29, 47]) {
  test(`seed=${seed}: Deposit both → selective Front/Back Etch preserves stack invariants`, () => {
    const width = 15 + seed / 10;
    const height = 20 + seed / 10;
    const thickness = 5 + seed / 20;
    const coat = 0.1 + seed / 1000;
    const cut = coat / 4;
    const model = modelApi.createModel({ shape: 'rect', width, height, thickness });
    checkStacks(model);

    const deposited = modelApi.applyOperation(model, {
      type: 'add',
      name: 'SiO2',
      growth: 'direct',
      thickness: coat,
      face: 'both',
      area: model.boundary,
    });
    assert.equal(deposited.changed, true, deposited.error);
    assert.notEqual(deposited.layerIds.front, deposited.layerIds.back);
    checkStacks(model);
    const beforeEtch = structuredClone(stackAt(model));

    const front = modelApi.applyOperation(model, {
      type: 'etch',
      face: 'front',
      etchProfile: 'directional',
      etchTargetLayerIds: [deposited.layerIds.front],
      thickness: cut,
      area: model.boundary,
    });
    assert.equal(front.changed, true, front.error);
    checkStacks(model);
    const afterFront = stackAt(model);
    assert.ok(Math.abs(afterFront[0].z0 - beforeEtch[0].z0) < 1e-9);
    assert.ok(Math.abs(afterFront.at(-1).z1 - (beforeEtch.at(-1).z1 - cut)) < 1e-8);

    const back = modelApi.applyOperation(model, {
      type: 'etch',
      face: 'back',
      etchProfile: 'directional',
      etchTargetLayerIds: [deposited.layerIds.back],
      thickness: cut,
      area: model.boundary,
    });
    assert.equal(back.changed, true, back.error);
    checkStacks(model);
    const afterBack = stackAt(model);
    assert.ok(Math.abs(afterBack[0].z0 - (beforeEtch[0].z0 + cut)) < 1e-8);
    assert.ok(Math.abs(afterBack.at(-1).z1 - (beforeEtch.at(-1).z1 - cut)) < 1e-8);
    assert.equal(afterBack[1].layerId, 'base', 'selective Etch must not consume Base');
  });
}
