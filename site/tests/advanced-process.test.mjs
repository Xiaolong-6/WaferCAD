import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');

function regionAt(model, point) {
  return model.regions.find((region) => vectorApi.pointInMulti(point, region.geom)) || null;
}

function runAdvanced(model, params, area = model.boundary) {
  return applyAdvancedProcessOperation(model, params, area, modelApi, vectorApi);
}

test('Planarize/CMP removes material down to an absolute target plane without filling low areas', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  modelApi.applyOperation(model, {
    type: 'add',
    name: 'Topography',
    thickness: 3,
    face: 'front',
    area: vectorApi.rectMulti(6, 20),
    growth: 'direct',
  });

  const result = runAdvanced(model, {
    type: 'etch',
    etchProfile: 'planarize',
    targetZ: 6,
    thickness: 6,
    face: 'front',
  });

  assert.equal(result.changed, true);
  assert.equal(modelApi.surfaceZ(regionAt(model, [0, 0]).stack, 'front'), 6);
  assert.equal(
    modelApi.surfaceZ(regionAt(model, [7, 0]).stack, 'front'),
    5,
    'CMP must not invent fill material where the local surface is below target Z',
  );
});

test('Transfer/Laminate places one flat membrane plane and bridges open voids', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  modelApi.applyOperation(model, {
    type: 'etch',
    thickness: 10,
    face: 'front',
    area: vectorApi.rectMulti(4, 20),
    etchProfile: 'directional',
    etchTargetLayerIds: ['base'],
  });

  const result = runAdvanced(model, {
    type: 'add',
    name: 'Transferred Si',
    thickness: 0.1,
    transferGap: 0.2,
    transferSource: 'SOI donor',
    growth: 'transfer',
    face: 'front',
  });

  assert.equal(result.changed, true);
  assert.equal(result.transferPlaneZ, 5);
  assert.equal(result.transferGap, 0.2);
  const bridge = regionAt(model, [0, 0]);
  assert.ok(bridge);
  assert.deepEqual(bridge.stack, [{ layerId: result.layerId, z0: 5.2, z1: 5.3 }]);
  const supported = regionAt(model, [7, 0]);
  assert.equal(modelApi.surfaceSegment(supported.stack, 'front').layerId, result.layerId);
});

test('Undercut release laterally removes a selected sacrificial material under a membrane', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const sacrificial = modelApi.applyOperation(model, {
    type: 'add',
    name: 'BOX',
    thickness: 1,
    face: 'front',
    area: model.boundary,
    growth: 'direct',
  });
  const transfer = runAdvanced(model, {
    type: 'add',
    name: 'Si membrane',
    thickness: 0.1,
    growth: 'transfer',
    face: 'front',
  });
  assert.equal(transfer.changed, true);

  modelApi.applyOperation(model, {
    type: 'etch',
    thickness: 0.1,
    face: 'front',
    area: vectorApi.rectMulti(2, 20),
    etchProfile: 'directional',
    etchTargetLayerIds: [transfer.layerId],
  });

  const result = runAdvanced(
    model,
    {
      type: 'etch',
      etchProfile: 'undercut',
      thickness: 3,
      face: 'front',
      etchTargetLayerIds: [sacrificial.layerId],
    },
    vectorApi.rectMulti(2, 20),
  );
  assert.equal(result.changed, true);
  assert.equal(
    regionAt(model, [2, 0]).stack.some((segment) => segment.layerId === sacrificial.layerId),
    false,
    'sacrificial film should be removed laterally underneath the surviving membrane',
  );
  assert.equal(
    regionAt(model, [6, 0]).stack.some((segment) => segment.layerId === sacrificial.layerId),
    true,
    'material beyond the requested undercut distance must remain',
  );
});

test('vector booleans retry once on the 0.1 nm persistence grid after a sweep failure', () => {
  const original = globalThis.polygonClipping.intersection;
  let calls = 0;
  globalThis.polygonClipping.intersection = (...args) => {
    calls++;
    if (calls === 1)
      throw new Error('Unable to find segment in SweepLine tree after save/reopen quantization');
    return original(...args);
  };
  try {
    const hit = vectorApi.intersection(
      vectorApi.rectMulti(10.00004, 10.00004),
      vectorApi.rectMulti(6.00004, 6.00004, 1.00004, 0),
    );
    assert.equal(vectorApi.isEmpty(hit), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.polygonClipping.intersection = original;
  }
});

test('union skips the polygon sweep for disjoint wafer-array instances', () => {
  const original = globalThis.polygonClipping.union;
  let calls = 0;
  globalThis.polygonClipping.union = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    const cells = [];
    for (let x = 0; x < 25; x++) {
      for (let y = 0; y < 25; y++) {
        cells.push(vectorApi.rectMulti(0.4, 0.4, x * 2, y * 2));
      }
    }
    const union = vectorApi.unionGeometries(cells);
    assert.equal(union.length, 625);
    assert.equal(calls, 0, 'disjoint repeated polygons should bypass Martinez union entirely');

    const touching = vectorApi.unionGeometries([
      vectorApi.rectMulti(2, 2, -1, 0),
      vectorApi.rectMulti(2, 2, 1, 0),
    ]);
    assert.equal(touching.length, 1);
    assert.ok(calls >= 1, 'touching components must still pass through the boolean kernel');
  } finally {
    globalThis.polygonClipping.union = original;
  }
});

test('repeated conformal coating survives persistence-grid coordinate quantization', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  modelApi.applyOperation(model, {
    type: 'add',
    name: 'Step',
    thickness: 2,
    face: 'front',
    area: vectorApi.rectMulti(6.00003, 20),
    growth: 'direct',
  });
  for (let index = 0; index < 3; index++) {
    const result = modelApi.applyOperation(model, {
      type: 'add',
      name: `ILD ${index + 1}`,
      thickness: 0.10003,
      face: 'front',
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(result.changed, true, result.error);
    for (const region of model.regions) {
      region.geom = vectorApi.canonicalizeBooleanGeometry(region.geom);
    }
  }
  const final = modelApi.applyOperation(model, {
    type: 'add',
    name: 'Post-open conformal',
    thickness: 0.10003,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(final.changed, true, final.error);
});
