import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel } = await import('../model.js');
const {
  createContinuousMaterialOwner,
  restoreContinuousMaterialOwner,
  continuousOwnerColumnAtXY,
  continuousOwnerMaterialAt,
} = await import('../continuous-material-owner.js');
const { continuousMaterialColumn } = await import('../continuous-etch-geometry.js');

function fixture() {
  const model = createModel({ shape: 'rect', width: 100, height: 100, thickness: 20 });
  model.layers.push({ id: 'oxide', name: 'Oxide', color: '#eeeeee', visible: true });
  model.regions[0].stack.push({ layerId: 'oxide', z0: 10, z1: 12 });
  return model;
}

function operation() {
  return {
    face: 'back',
    targetLayerIds: ['base'],
    lateralUm: 5,
    verticalUm: 5,
    shape: 'circular',
  };
}

test('physical material Z intervals use exact continuous front and preserve oxide', () => {
  const model = fixture();
  const untouched = structuredClone(model);
  const owner = createContinuousMaterialOwner(model, operation());
  const column = continuousOwnerColumnAtXY(owner, [0, 0]);
  assert.deepEqual(column, [
    { layerId: 'base', z0: -5, z1: 10 },
    { layerId: 'oxide', z0: 10, z1: 12 },
  ]);
  assert.equal(continuousOwnerMaterialAt(owner, [0, 0, -9]), null);
  assert.equal(continuousOwnerMaterialAt(owner, [0, 0, 0]), 'base');
  assert.equal(continuousOwnerMaterialAt(owner, [0, 0, 11]), 'oxide');
  assert.deepEqual(model, untouched, 'Planning cannot mutate live model');
});

test('overlapping front intervals are subtracted without duplicate material', () => {
  const model = fixture();
  const front = {
    kind: 'continuous-etch-front-v1',
    seedGeom: model.boundary,
    seedZ: 10,
    face: 'front',
    layerId: 'base',
    lateralUm: 5,
    verticalUm: 5,
    shape: 'circular',
  };
  const back = { ...front, seedZ: -10, face: 'back' };
  assert.deepEqual(continuousMaterialColumn(model, [front, back], [0, 0]), [
    { layerId: 'base', z0: -5, z1: 5 },
    { layerId: 'oxide', z0: 10, z1: 12 },
  ]);
  const overlapping = { ...front, seedZ: 9 };
  assert.deepEqual(continuousMaterialColumn(model, [front, overlapping], [0, 0]), [
    { layerId: 'base', z0: -10, z1: 4 },
    { layerId: 'oxide', z0: 10, z1: 12 },
  ]);
});

test('owner round-trips losslessly with no 8/72 band state', () => {
  const model = fixture();
  const live = createContinuousMaterialOwner(model, operation());
  const json = JSON.stringify(live);
  assert.ok(!json.includes('bands'));
  const restored = restoreContinuousMaterialOwner(JSON.parse(json));
  assert.deepEqual(restored, live);
  for (const point of [
    [0, 0, -9],
    [0, 0, -4],
    [0, 0, 11],
  ])
    assert.equal(
      continuousOwnerMaterialAt(restored, point),
      continuousOwnerMaterialAt(live, point),
    );
  assert.throws(() => continuousOwnerMaterialAt(JSON.parse(json), [0, 0, 0]), /validated/);
});

test('restoration rejects tampered physical parameters and seed geometry', () => {
  const owner = createContinuousMaterialOwner(fixture(), operation());
  const tamperedFront = structuredClone(owner);
  tamperedFront.fronts[0].seedZ += 1;
  assert.throws(() => restoreContinuousMaterialOwner(tamperedFront), /disagrees/);
  const tamperedSource = structuredClone(owner);
  tamperedSource.sourceModel.regions[0].stack[0].z0 -= 1;
  // The old exposure is no longer at the recorded bottom surface.
  assert.throws(() => restoreContinuousMaterialOwner(tamperedSource), /disagrees/);
  const tamperedRevision = structuredClone(owner);
  tamperedRevision.sourceModel.revision += 1;
  assert.throws(() => restoreContinuousMaterialOwner(tamperedRevision), /revision/);
  const tamperedParameter = structuredClone(owner);
  tamperedParameter.operation.verticalUm = Number.NaN;
  assert.throws(() => restoreContinuousMaterialOwner(tamperedParameter), /finite/);
});

test('validated owner cannot silently change after restore', () => {
  const live = createContinuousMaterialOwner(fixture(), operation());
  assert.ok(Object.isFrozen(live.sourceModel.regions[0].stack[0]));
  assert.ok(Object.isFrozen(live.fronts[0].seedGeom));
  assert.throws(() => {
    live.fronts[0].verticalUm = 200;
  }, TypeError);
  assert.throws(() => {
    live.sourceModel.regions[0].stack[0].z0 = 200;
  }, TypeError);
  assert.equal(continuousOwnerMaterialAt(live, [0, 0, -9]), null);
});
