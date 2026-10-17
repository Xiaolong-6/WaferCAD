import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');
const { bondWaferModels } = await import('../wafer-bonding.js');

const wafer = () =>
  modelApi.createModel({
    shape: 'rect',
    width: 100,
    height: 80,
    thickness: 400,
  });
const stackAt = (model, point) =>
  model.regions.find((region) => vectorApi.pointInMulti(point, region.geom))?.stack || [];
const layerAt = (model, point, z) =>
  stackAt(model, point).find((segment) => segment.z0 < z && segment.z1 > z)?.layerId || null;
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('two independently created 400 µm wafers bond into an 800 µm native stack', () => {
  const receiver = wafer();
  const donor = wafer();
  const beforeA = structuredClone(receiver);
  const beforeB = structuredClone(donor);
  const {
    model,
    interface: bond,
    donorLayerIds,
  } = bondWaferModels(receiver, donor, {
    receiverFace: 'front',
    donorFace: 'front',
    donorId: 'upper-400',
  });
  assert.deepEqual(receiver, beforeA, 'bond must not mutate the receiver');
  assert.deepEqual(donor, beforeB, 'bond must not mutate the donor');
  assert.equal(model.layers.length, 2);
  assert.notEqual(model.layers[0].id, model.layers[1].id);
  assert.equal(donorLayerIds.base, model.layers[1].id);
  assert.equal(model.layers[1].sourceWaferId, 'upper-400');
  assert.equal(model.regions.length, 1);
  assert.equal(stackAt(model, [0, 0]).length, 2);
  const stack = stackAt(model, [0, 0]);
  near(stack[0].z0, -200);
  near(stack[0].z1, 200);
  near(stack[1].z0, 200);
  near(stack[1].z1, 600);
  near(bond.z, 200);
  assert.equal(bond.flipped, true);
  near(modelApi.modelBoundsZ(model)[1] - modelApi.modelBoundsZ(model)[0], 800);
  near(model.thickness, 800);
  near(receiver.thickness, 400);
  near(donor.thickness, 400);
  near(modelApi.geometryArea(bond.contactGeometry), 8000);
  validateProcessModel(model);
});

test('bond caps an etched microchannel without filling the buried coolant void', () => {
  const receiver = wafer();
  const etch = modelApi.applyOperation(receiver, {
    type: 'etch',
    thickness: 100,
    face: 'front',
    area: vectorApi.rectMulti(10, 40),
  });
  assert.equal(etch.changed, true, etch.error);
  const { model, interface: bond } = bondWaferModels(receiver, wafer());
  assert.equal(layerAt(model, [0, 0], 0), 'base');
  assert.equal(layerAt(model, [0, 0], 150), null, 'buried trench must remain void');
  assert.notEqual(layerAt(model, [0, 0], 250), null, 'upper wafer must cap cavity');
  assert.equal(layerAt(model, [30, 0], 150), 'base', 'unetched ribs remain solid');
  assert.equal(vectorApi.pointInMulti([0, 0], bond.contactGeometry), false);
  assert.equal(vectorApi.pointInMulti([30, 0], bond.contactGeometry), true);
  validateProcessModel(model);
});

test('wafer flip also flips in-plane handedness, and rotation positions asymmetric pocket', () => {
  const donor = wafer();
  const opening = modelApi.applyOperation(donor, {
    type: 'etch',
    thickness: 50,
    face: 'front',
    area: vectorApi.rectMulti(6, 6, 20, 0),
  });
  assert.equal(opening.changed, true, opening.error);
  const { model, interface: bond } = bondWaferModels(wafer(), donor, {
    receiverFace: 'front',
    donorFace: 'front',
    flipAxis: 'x',
    rotationDeg: 90,
  });
  assert.equal(bond.flipped, true);
  assert.equal(layerAt(model, [0, -20], 225), null, 'mirrored rotated cavity is empty');
  assert.notEqual(layerAt(model, [0, 20], 225), null, 'opposite side is solid');
  validateProcessModel(model);
});

test('front-to-back bond preserves donor Z orientation and independent layer provenance', () => {
  const { model, interface: bond } = bondWaferModels(wafer(), wafer(), {
    receiverFace: 'front',
    donorFace: 'back',
    dx: 5,
  });
  assert.equal(bond.flipped, false);
  near(bond.z, 200);
  near(modelApi.modelBoundsZ(model)[1], 600);
  assert.notEqual(layerAt(model, [50, 0], 300), null, 'donor can extend beyond receiver XY');
  validateProcessModel(model);
});

test('third wafer attaches in another independent step without flattening the first pair', () => {
  const pair = bondWaferModels(wafer(), wafer(), { donorId: 'second' });
  const prior = structuredClone(pair.model);
  const third = bondWaferModels(pair.model, wafer(), { donorId: 'third' });
  assert.deepEqual(pair.model, prior);
  assert.equal(third.model.layers.length, 3);
  assert.equal(stackAt(third.model, [0, 0]).length, 3);
  near(modelApi.modelBoundsZ(third.model)[1] - modelApi.modelBoundsZ(third.model)[0], 1200);
  near(third.model.thickness, 1200);
  near(pair.model.thickness, 800);
  near(third.interface.z, 600);
  validateProcessModel(third.model);
});

test('rejects missing contact and unsupported physical conditions atomically', () => {
  const receiver = wafer();
  const donor = wafer();
  const beforeA = structuredClone(receiver);
  const beforeB = structuredClone(donor);
  assert.throws(
    () => bondWaferModels(receiver, donor, { dx: 400 }),
    /no finite-area physical contact/,
  );
  assert.throws(() => bondWaferModels(receiver, donor, { gapUm: -1 }), /zero gap/);
  assert.throws(
    () => bondWaferModels(receiver, donor, { method: 'adhesive' }),
    /only direct contact/,
  );
  assert.throws(() => bondWaferModels(receiver, donor, { rotationDeg: NaN }), /finite number/);
  assert.deepEqual(receiver, beforeA);
  assert.deepEqual(donor, beforeB);
});

test('does not silently drop Implant/Electrical annotations or array geometry', () => {
  const annotated = wafer();
  const result = modelApi.applyOperation(annotated, {
    type: 'implant',
    name: 'protected device',
    thickness: 1,
    face: 'front',
    area: annotated.boundary,
  });
  assert.equal(result.changed, true, result.error);
  assert.throws(() => bondWaferModels(wafer(), annotated), /annotations/);
  const array = { ...wafer(), kernel: 'vector-2.5d-array-v1' };
  assert.throws(() => bondWaferModels(wafer(), array), /array inputs are not yet supported/);
});

test('disconnected bond lands preserve genuine channels and report contact fractions', () => {
  const receiver = wafer();
  const cut = modelApi.applyOperation(receiver, {
    type: 'etch',
    thickness: 100,
    face: 'front',
    area: vectorApi.rectMulti(8, 80),
  });
  assert.equal(cut.changed, true, cut.error);
  const { model, interface: bond } = bondWaferModels(receiver, wafer());
  near(bond.contactAreaUm2, 7360);
  near(bond.receiverExposedAreaUm2, 7360);
  near(bond.donorExposedAreaUm2, 8000);
  near(bond.contactFractionReceiver, 1);
  near(bond.contactFractionDonor, 0.92);
  assert.equal(bond.contactIslands, 2, 'two separated bonding lands');
  assert.equal(layerAt(model, [0, 0], 150), null, 'channel remains empty');
  assert.notEqual(layerAt(model, [-30, 0], 150), null);
  assert.notEqual(layerAt(model, [30, 0], 150), null);
  validateProcessModel(model);
});

test('two independent recessed pockets remain true voids below donor material', () => {
  const receiver = wafer();
  const area = vectorApi.unionGeometries([
    vectorApi.rectMulti(8, 10, -25, 0),
    vectorApi.rectMulti(12, 10, 25, 0),
  ]);
  const etch = modelApi.applyOperation(receiver, {
    type: 'etch',
    thickness: 120,
    face: 'front',
    area,
  });
  assert.equal(etch.changed, true, etch.error);
  const { model, interface: bond } = bondWaferModels(receiver, wafer());
  near(bond.contactAreaUm2, 8000 - 80 - 120);
  assert.equal(layerAt(model, [-25, 0], 150), null);
  assert.equal(layerAt(model, [25, 0], 150), null);
  assert.equal(layerAt(model, [0, 0], 150), 'base');
  assert.notEqual(layerAt(model, [-25, 0], 250), null);
  assert.notEqual(layerAt(model, [25, 0], 250), null);
  validateProcessModel(model);
});

test('front-to-back bond preserves a distinct oxide interlayer deposited on donor back', () => {
  const receiver = wafer();
  const donor = wafer();
  const oxide = modelApi.applyOperation(donor, {
    type: 'add',
    name: 'Bonding oxide',
    thickness: 2,
    face: 'back',
    area: donor.boundary,
  });
  assert.equal(oxide.changed, true, oxide.error);
  const before = structuredClone(donor);
  const {
    model,
    interface: bond,
    donorLayerIds,
  } = bondWaferModels(receiver, donor, {
    receiverFace: 'front',
    donorFace: 'back',
    donorId: 'oxide-donor',
  });
  near(bond.z, 200);
  assert.equal(bond.flipped, false);
  const stack = stackAt(model, [0, 0]);
  assert.equal(stack.length, 3);
  near(stack[1].z0, 200);
  near(stack[1].z1, 202);
  assert.equal(stack[1].layerId, donorLayerIds[oxide.layerId]);
  assert.equal(stack[2].layerId, donorLayerIds.base);
  near(stack[2].z1, 602);
  assert.deepEqual(donor, before, 'source donor model remains untouched');
  validateProcessModel(model);
});

test('line contact, duplicate provenance and nested donor are rejected without mutation', () => {
  const receiver = wafer();
  const donor = wafer();
  assert.throws(() => bondWaferModels(receiver, donor, { dx: 100 }), /no finite-area/);
  const initial = bondWaferModels(receiver, donor, { donorId: 'w2' });
  const before = structuredClone(initial.model);
  assert.throws(
    () => bondWaferModels(initial.model, wafer(), { donorId: 'w2' }),
    /donorId already exists/,
  );
  assert.throws(
    () => bondWaferModels(receiver, initial.model, { donorId: 'nested' }),
    /already assembled/,
  );
  assert.deepEqual(initial.model, before);
  const broken = wafer();
  broken.regions[0].stack.push({ layerId: 'base', z0: 0, z1: 20 });
  const brokenBefore = structuredClone(broken);
  assert.throws(() => bondWaferModels(receiver, broken), /overlap/i);
  assert.deepEqual(broken, brokenBefore);
});

test('all four receiver/donor face pairings place adjacent wafers without material overlap', () => {
  const combinations = [
    ['front', 'front', true, -200, 600],
    ['front', 'back', false, -200, 600],
    ['back', 'front', false, -600, 200],
    ['back', 'back', true, -600, 200],
  ];
  for (const [receiverFace, donorFace, flipped, expectedLow, expectedHigh] of combinations) {
    const { model, interface: bond } = bondWaferModels(wafer(), wafer(), {
      receiverFace,
      donorFace,
    });
    const bounds = modelApi.modelBoundsZ(model);
    near(bounds[0], expectedLow);
    near(bounds[1], expectedHigh);
    assert.equal(bond.flipped, flipped);
    near(bond.z, receiverFace === 'front' ? 200 : -200);
    assert.equal(stackAt(model, [0, 0]).length, 2);
    near(bond.contactAreaUm2, 8000);
    validateProcessModel(model);
  }
});

test('nonrectangular through-hole remains empty and is absent from true contact geometry', () => {
  const receiver = wafer();
  const voidMask = vectorApi.circleMulti(20, 20, 72);
  const etch = modelApi.applyOperation(receiver, {
    type: 'etch',
    face: 'front',
    thickness: 400,
    area: voidMask,
  });
  assert.equal(etch.changed, true, etch.error);
  const { model, interface: bond } = bondWaferModels(receiver, wafer(), {
    receiverFace: 'front',
    donorFace: 'back',
  });
  assert.equal(layerAt(model, [0, 0], 0), null, 'through-hole is not filled by Bond');
  assert.notEqual(layerAt(model, [0, 0], 300), null, 'donor caps the hole');
  assert.equal(vectorApi.pointInMulti([0, 0], bond.contactGeometry), false);
  assert.equal(vectorApi.pointInMulti([30, 0], bond.contactGeometry), true);
  assert.ok(Math.abs(bond.contactAreaUm2 - (8000 - Math.PI * 100)) < 2);
  validateProcessModel(model);
});
