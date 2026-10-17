import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel } = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

function sectionStackAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom))?.stack || [];
}

function maskedMicroReleaseFixture() {
  const model = createModel({ shape: 'rect', width: 26, height: 26, thickness: 10 });
  const deposited = applyOperation(model, {
    type: 'add',
    name: 'Protective oxide',
    thickness: 1.2,
    area: model.boundary,
    face: 'front',
  });
  assert.equal(deposited.changed, true);
  const opened = applyOperation(model, {
    type: 'etch',
    etchProfile: 'directional',
    etchTargetLayerIds: [deposited.layerId],
    thickness: 1.5,
    area: rectMulti(4, 4),
    face: 'front',
  });
  assert.equal(opened.changed, true);
  assert.ok(sectionStackAt(model, [0, 0]).every((s) => s.layerId === 'base'));
  assert.ok(sectionStackAt(model, [7, 0]).some((s) => s.layerId === deposited.layerId));
  return { model, oxideLayerId: deposited.layerId };
}

function etch(model, isotropicLateralErrorUm) {
  return applyOperation(model, {
    type: 'etch',
    etchProfile: 'isotropic',
    etchTargetLayerIds: ['base'],
    thickness: 4,
    face: 'front',
    area: model.boundary,
    ...(isotropicLateralErrorUm === undefined ? {} : { isotropicLateralErrorUm }),
  });
}

test('experimental adaptive etch changes REAL selective material voids under a retained mask', () => {
  const { model, oxideLayerId } = maskedMicroReleaseFixture();
  const original = structuredClone(model);
  const result = etch(model, 0.25);
  assert.equal(result.changed, true, result.error || 'expected actual material removal');
  assert.ok(model.processRevision > original.processRevision);
  const center = sectionStackAt(model, [0, 0]);
  const far = sectionStackAt(model, [8, 0]);
  const undercut = sectionStackAt(model, [2.5, 0]);
  assert.ok(center.every((s) => s.layerId !== oxideLayerId));
  assert.ok(center.every((s) => s.z1 <= 1.000000001 || s.layerId !== 'base'));
  assert.ok(
    far.some((s) => s.layerId === oxideLayerId),
    'masked oxide must survive',
  );
  assert.ok(undercut.some((s) => s.layerId === 'base' && s.z1 < 5));
  assert.ok(model.regions.length > 1, 'physical material topology must be partitioned');
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
});

test('adaptive release differs from legacy eight bands without silently changing legacy replay', () => {
  const { model: source } = maskedMicroReleaseFixture();
  const legacy = structuredClone(source);
  const repeatedLegacy = structuredClone(source);
  const adaptive = structuredClone(source);
  assert.equal(etch(legacy).changed, true);
  assert.equal(etch(repeatedLegacy).changed, true);
  assert.deepEqual(legacy, repeatedLegacy, 'saved legacy operation must be deterministic');
  assert.equal(etch(adaptive, 0.125).changed, true);
  assert.notDeepEqual(
    adaptive.regions,
    legacy.regions,
    'opt-in finer-depth geometry must not be the unchanged eight-band result',
  );
  for (const [x, y] of [
    [0, 0],
    [7, 0],
    [10, 10],
  ]) {
    assert.equal(
      sectionStackAt(adaptive, [x, y]).some((s) => s.layerId !== 'base'),
      sectionStackAt(legacy, [x, y]).some((s) => s.layerId !== 'base'),
      'etch must not strip protected oxide',
    );
  }
});

test('bad opt-in accuracy, excessive 128-band budget and unsupported array roll back atomically', () => {
  const { model } = maskedMicroReleaseFixture();
  for (const input of [0, -1, NaN, Infinity, 0.00001]) {
    const target = structuredClone(model);
    const baseline = structuredClone(target);
    const result = etch(target, input);
    assert.equal(result.changed, false);
    assert.match(result.error, /isotropic|budget|geometry failed safely/i);
    assert.deepEqual(target, baseline, 'failed experimental etch must not modify any material');
  }
  const array = { ...structuredClone(model), array: { instances: [] } };
  const saved = structuredClone(array);
  const result = etch(array, 0.25);
  assert.equal(result.changed, false);
  assert.match(result.error, /does not yet support array/);
  assert.deepEqual(array, saved);
});
