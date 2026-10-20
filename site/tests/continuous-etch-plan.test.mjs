import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');
const { applyContinuousRelease } = await import('../continuous-etch-process.js');
const { createContinuousPlanSampler } = await import('../continuous-etch-plan.js');
const { continuousModelColumnAtXY } = await import('../continuous-etch-model.js');

function fixture(depth = 3, face = 'front') {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const source = JSON.stringify(model);
  const { model: released } = applyContinuousRelease(
    model,
    {
      type: 'etch',
      etchProfile: 'continuous',
      etchTargetLayerIds: ['base'],
      face,
      thickness: depth,
      continuousLateralUm: 5,
      continuousShape: 'elliptical',
    },
    rectMulti(2, 2),
  );
  assert.equal(JSON.stringify(model), source);
  return released;
}

test('Main projection uses exact physical top and back interval owners, not the source 2.5D top', () => {
  const released = fixture();
  const front = createContinuousPlanSampler(released, 'front');
  const back = createContinuousPlanSampler(released, 'back');
  assert.deepEqual(front([0, 0]), { layerId: 'base', z: 2 });
  assert.deepEqual(front([9, 0]), { layerId: 'base', z: 5 });
  assert.deepEqual(back([0, 0]), { layerId: 'base', z: -5 });
  assert.equal(front([13, 0]), null);
  assert.equal(continuousModelColumnAtXY(released, [0, 0]).at(-1).z1, 2);
});

test('Main projection correctly exposes physical vacuum when release passes through entire substrate', () => {
  const released = fixture(12);
  const front = createContinuousPlanSampler(released, 'front');
  const back = createContinuousPlanSampler(released, 'back');
  assert.equal(front([0, 0]), null);
  assert.equal(back([0, 0]), null);
  assert.deepEqual(front([9, 0]), { layerId: 'base', z: 5 });
});

test('Main projection is face-specific and refuses mutated persistent physical owners', () => {
  const released = fixture(3, 'back');
  const before = JSON.stringify(released);
  assert.deepEqual(createContinuousPlanSampler(released, 'back')([0, 0]), {
    layerId: 'base',
    z: -2,
  });
  released.layers[0].visible = false;
  assert.equal(createContinuousPlanSampler(released, 'front')([0, 0]), null);
  released.layers[0].visible = true;
  assert.equal(JSON.stringify(released), before);
  assert.throws(() => createContinuousPlanSampler(released, 'both'), /Invalid/);
});
