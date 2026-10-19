import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const vendor = { exports: {} };
new Function('module', 'exports', vendorSource)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');
const { planContinuousEtchFromTopology, remainingMaterialInContinuousPlan } =
  await import('../continuous-etch-topology.js');
const { remainingMaterialAt, continuousDepthAtXY } = await import('../continuous-etch-geometry.js');

function coatedFixture() {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 4 });
  model.layers.push({ id: 'oxide', name: 'Oxide', color: '#cad6e2', visible: true });
  model.regions[0].stack.push({ layerId: 'oxide', z0: 2, z1: 3 });
  return model;
}

function plan(model, changes = {}) {
  return planContinuousEtchFromTopology({
    model,
    face: 'front',
    targetLayerIds: ['oxide'],
    lateralUm: 3,
    verticalUm: 3,
    shape: 'circular',
    ...changes,
  });
}

test('canonical exposed oxide creates a continuous front without changing Model', () => {
  const model = coatedFixture();
  const before = structuredClone(model);
  const result = plan(model);
  assert.equal(result.mutatesModel, false);
  assert.equal(result.fronts.length, 1);
  assert.equal(result.fronts[0].seedZ, 3);
  assert.equal(result.fronts[0].layerId, 'oxide');
  assert.equal(result.fronts[0].kind, 'continuous-etch-front-v1');
  assert.equal(continuousDepthAtXY(result.fronts[0], [0, 0]), 3);
  assert.equal(remainingMaterialAt(model, result.fronts, [0, 0, 2.5]), null);
  assert.equal(remainingMaterialAt(model, result.fronts, [0, 0, 1]), 'base');
  assert.deepEqual(model, before);
});

test('buried front substrate is rejected but back face selects real Si', () => {
  const model = coatedFixture();
  assert.throws(() => plan(model, { targetLayerIds: ['base'] }), /No physically exposed/);
  const result = plan(model, { face: 'back', targetLayerIds: ['base'] });
  assert.equal(result.fronts.length, 1);
  assert.equal(result.fronts[0].seedZ, -2);
  assert.equal(result.fronts[0].face, 'back');
});

test('real Mask ROI changes seed footprint without changing canonical source', () => {
  const model = coatedFixture();
  const original = JSON.stringify(model);
  const roi = rectMulti(4, 2, -2, 1);
  const result = plan(model, { clip: roi });
  assert.equal(continuousDepthAtXY(result.fronts[0], [-2, 1]), 3);
  assert.ok(continuousDepthAtXY(result.fronts[0], [4, 1]) < 3);
  result.fronts[0].seedGeom[0][0][0][0] = 100;
  assert.equal(JSON.stringify(model), original);
});

test('no partial source mutation for invalid targets, arrays, masks or shape', () => {
  const model = coatedFixture();
  const before = JSON.stringify(model);
  for (const opts of [
    { targetLayerIds: ['missing'] },
    { targetLayerIds: [] },
    { face: 'both' },
    { clip: [] },
    { lateralUm: 0 },
    { verticalUm: Number.NaN },
    { lateralUm: 5 },
  ])
    assert.throws(() => plan(model, opts), RangeError);
  assert.throws(() => plan({ ...model, array: { instances: [] } }), /non-array/);
  assert.equal(JSON.stringify(model), before);
});

test('continuous occupancy rejects a stale material revision', () => {
  const model = coatedFixture();
  const planned = planContinuousEtchFromTopology({
    model,
    face: 'front',
    targetLayerIds: ['oxide'],
    lateralUm: 3,
    verticalUm: 3,
    shape: 'circular',
  });
  assert.equal(remainingMaterialInContinuousPlan(model, planned, [0, 0, 2.5]), null);
  model.revision++;
  assert.throws(() => remainingMaterialInContinuousPlan(model, planned, [0, 0, 2.5]), /stale/);
});

test('equal revisions cannot authorize a different History or Recovery material owner', () => {
  const source = coatedFixture();
  const plan = planContinuousEtchFromTopology({
    model: source,
    face: 'front',
    targetLayerIds: ['oxide'],
    lateralUm: 3,
    verticalUm: 3,
    shape: 'circular',
  });
  const clone = structuredClone(source);
  assert.equal(clone.revision, source.revision);
  assert.throws(() => remainingMaterialInContinuousPlan(clone, plan, [0, 0, 2.5]), /stale/);
  const serialized = JSON.parse(JSON.stringify(plan));
  assert.throws(() => remainingMaterialInContinuousPlan(source, serialized, [0, 0, 2.5]), /stale/);
});
