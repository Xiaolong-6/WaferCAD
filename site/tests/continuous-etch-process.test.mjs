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
const { applyContinuousRelease } = await import('../continuous-etch-process.js');
const { continuousModelMaterialAt, validateContinuousEtchModel } =
  await import('../continuous-etch-model.js');
const { validateProcessModel } = await import('../project-schema.js');
const { rectMulti } = await import('../vector-geometry.js');

function parameters(shape = 'circular') {
  return {
    type: 'etch',
    etchProfile: 'continuous',
    etchTargetLayerIds: ['base'],
    face: 'front',
    thickness: 3,
    continuousLateralUm: shape === 'circular' ? 700 : 5,
    continuousShape: shape,
  };
}

test('Process worker adapter creates an exact circular release without mutating the original', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const before = JSON.stringify(model);
  const { model: next, result } = applyContinuousRelease(model, parameters(), rectMulti(2, 2));
  assert.equal(result.changed, true);
  validateProcessModel(next);
  assert.equal(JSON.stringify(model), before);
  assert.equal(next.processRevision, model.processRevision + 1);
  assert.equal(
    validateContinuousEtchModel(next).operation.lateralUm,
    3,
    'Circular front must use equal physical radius',
  );
  assert.equal(continuousModelMaterialAt(next, [0, 0, 4]), null);
  assert.equal(continuousModelMaterialAt(next, [0, 0, 0]), 'base');
});

test('Elliptical and vertical fronts preserve separate canonical lateral and vertical lengths', () => {
  for (const shape of ['elliptical', 'vertical']) {
    const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
    const { model: next } = applyContinuousRelease(model, parameters(shape), rectMulti(2, 2));
    const front = validateContinuousEtchModel(next).fronts[0];
    assert.equal(front.shape, shape);
    assert.equal(front.lateralUm, 5);
    assert.equal(front.verticalUm, 3);
    assert.equal(continuousModelMaterialAt(next, [0, 0, 4]), null);
    assert.equal(continuousModelMaterialAt(next, [0, 0, 0]), 'base');
  }
});

test('Invalid continuous release refuses Both, nonexistent material, array, and follow-on Process', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const original = JSON.stringify(model);
  const area = rectMulti(2, 2);
  for (const invalid of [
    { face: 'both' },
    { etchTargetLayerIds: ['does-not-exist'] },
    { etchTargetLayerIds: [] },
    { continuousShape: 'invalid' },
    { thickness: 0 },
    { continuousLateralUm: NaN, continuousShape: 'elliptical' },
    { surface: { kind: 'rough' } },
  ])
    assert.throws(() =>
      applyContinuousRelease(model, { ...parameters('elliptical'), ...invalid }, area),
    );
  const next = applyContinuousRelease(model, parameters(), area).model;
  assert.throws(() => applyContinuousRelease(next, parameters(), area), /predecessor/);
  assert.equal(JSON.stringify(model), original, 'A rejected Process must never change the source');
});
