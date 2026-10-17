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
const { planTopologySelectiveIsotropicRelease } = await import('../isotropic-release-topology.js');
const { rectMulti, multiBounds } = await import('../vector-geometry.js');

function coatedFixture() {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 4 });
  model.layers.push({ id: 'oxide', name: 'Oxide', color: '#cad6e2', visible: true });
  model.regions[0].stack.push({ layerId: 'oxide', z0: 2, z1: 3 });
  return model;
}
function derive(model, overrides = {}) {
  return planTopologySelectiveIsotropicRelease({
    model,
    face: 'front',
    targetLayerIds: ['oxide'],
    radius: 6,
    maxLateralErrorUm: 0.25,
    ...overrides,
  });
}

test('canonical exposed front is oxide; hidden silicon is never promoted to release seed', () => {
  const model = coatedFixture();
  const baseline = structuredClone(model);
  const front = derive(model);
  assert.equal(front.kind, 'wafercad-exposed-topology-isotropic-plan-v1');
  assert.equal(front.mutatesModel, false);
  assert.equal(front.seedPlans.length, 1);
  assert.equal(front.seedPlans[0].sourceKind, 'canonical-exposed-surface');
  assert.equal(front.seedPlans[0].seedLayerId, 'oxide');
  assert.equal(front.seedPlans[0].seedZ, 3);
  assert.equal(front.seedPlans[0].bands.length, 12);
  assert.deepEqual(front.seedPlans[0].targetLayerIds, ['oxide']);
  assert.deepEqual(multiBounds(front.seedPlans[0].seedGeom), multiBounds(model.boundary));
  assert.throws(
    () => derive(model, { targetLayerIds: ['base'] }),
    /no physically exposed seed/,
  );
  assert.deepEqual(model, baseline, 'Planning must never mutate the physical Model');
});

test('backside release selects the real silicon face, not the hidden oxide', () => {
  const model = coatedFixture();
  const back = derive(model, { face: 'back', targetLayerIds: ['base'] });
  assert.equal(back.seedPlans.length, 1);
  assert.equal(back.seedPlans[0].seedZ, -2);
  assert.equal(back.seedPlans[0].bands[0].z0, -2);
  assert.equal(back.seedPlans[0].bands.at(-1).z1, 4);
  assert.throws(() => derive(model, { face: 'back' }), /no physically exposed seed/);
});

test('mask XY intersection selects a real subregion, not the entire source wafer', () => {
  const model = coatedFixture();
  const clip = rectMulti(4, 2, -2, 1);
  const result = derive(model, { clip });
  assert.equal(result.seedPlans.length, 1);
  assert.deepEqual(multiBounds(result.seedPlans[0].seedGeom), multiBounds(clip));
  result.seedPlans[0].seedGeom[0][0][0][0] = 900;
  assert.deepEqual(multiBounds(model.boundary), {
    minX: -6,
    maxX: 6,
    minY: -4,
    maxY: 4,
    width: 12,
    height: 8,
  });
});

test('material selectivity and unsupported topology fail before any partial mutation', () => {
  const model = coatedFixture();
  const baseline = JSON.stringify(model);
  for (const opts of [
    { face: 'both' },
    { face: 'side' },
    { targetLayerIds: ['missing'] },
    { targetLayerIds: [] },
    { clip: [] },
    { radius: -1 },
    { maxLateralErrorUm: 0 },
    { maxBands: 1 },
  ]) {
    assert.throws(() => derive(model, opts), RangeError);
    assert.equal(JSON.stringify(model), baseline);
  }
  assert.throws(
    () => derive({ ...model, kernel: 'vector-physical-facet-experimental-v1' }),
    /canonical non-array vector/,
  );
  assert.throws(
    () => derive({ ...model, array: { instances: [] } }),
    /canonical non-array vector/,
  );
});

test('topology-derived seed plan is JSON-safe and has deterministic Front/Back owner', () => {
  const model = coatedFixture();
  const expected = derive(model);
  const actual = derive(model);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
  assert.notStrictEqual(actual.seedPlans[0].seedGeom, expected.seedPlans[0].seedGeom);
});
