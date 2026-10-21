import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { profileSpatialStatistics } from '../../scripts/rough-morphology-statistics.mjs';
import { roughProfileOffsetAtPoint } from '../surface-rendering.js';

await loadGeometryKernel();
const { expandProjectStorage } = await import('../project-io.js');
const { model } = expandProjectStorage(
  JSON.parse(
    await readFile(
      new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
    ),
  ),
);
const rough = model.regions
  .find((region) => region.id === 'region-113')
  .stack.find((segment) => segment.layerId === 'base').frontSurface;

test('Photodetector spatial statistics distinguish the saved legacy field from explicit stable-scale rough', () => {
  const snapshot = JSON.stringify(model);
  const config = { x: 2491.8, y: -3.2, samples: 128, pitch: 0.025, lags: [1, 4, 8] };
  const legacy = profileSpatialStatistics({ ...rough, morphology: 'stochastic' }, config);
  const stable = profileSpatialStatistics({ ...rough, morphology: 'stochastic-v2' }, config);
  // The legacy variable-frequency field becomes badly aliased far from origin;
  // this is its historical physical definition, not a property to silently edit.
  assert.ok(Math.abs(legacy.correlations[0].x) < 0.2);
  assert.ok(Math.abs(legacy.correlations[0].y) < 0.2);
  // The opt-in stable-scale profile retains a finite, local feature pitch.
  assert.ok(stable.correlations[0].x > 0.9);
  assert.ok(stable.correlations[0].y > 0.9);
  assert.ok(stable.correlations[1].x > 0.7);
  assert.ok(stable.correlations[1].y > 0.7);
  assert.ok(stable.correlations[2].x < stable.correlations[1].x);
  for (const result of [legacy, stable]) {
    assert.ok(result.height.meanUm > 0 && result.height.meanUm < rough.etchDepth);
    assert.ok(result.height.standardDeviationUm > 0);
    assert.ok(result.height.minUm >= 0 && result.height.maxUm <= rough.etchDepth);
  }
  assert.equal(JSON.stringify(model), snapshot, 'Read-only sampling cannot mutate project/History');
});

test('Feature CV zero preserves exact old physical rough heights; varying CV is not a presentation-only option', () => {
  const original = JSON.stringify(model);
  for (const seed of [0, 123, rough.seed, 0xffffffff]) {
    for (const [x, y] of [
      [0.0125, 0.07],
      [2495.12, 0.123],
      [-50000.03, 20000.07],
    ]) {
      const profile = { ...rough, seed, featureCv: 0 };
      assert.equal(
        roughProfileOffsetAtPoint(x, y, { ...profile, morphology: 'stochastic' }),
        roughProfileOffsetAtPoint(x, y, { ...profile, morphology: 'stochastic-v2' }),
      );
    }
  }
  const baseline = { ...rough, morphology: 'stochastic-v2', featureCv: 0 };
  const randomized = { ...baseline, featureCv: 1 };
  let changes = 0;
  for (let index = 0; index < 64; index++) {
    const x = 2491.8 + index * 0.051,
      y = -3.2 + (index % 11) * 0.031;
    if (roughProfileOffsetAtPoint(x, y, baseline) !== roughProfileOffsetAtPoint(x, y, randomized)) {
      changes++;
    }
  }
  assert.ok(
    changes > 40,
    'Changing Feature CV must change the physical field, not only visual shading',
  );
  assert.equal(JSON.stringify(model), original);
});

test('Spatial audit validates bounded grids and deterministic sampling', () => {
  for (const params of [
    { samples: 7 },
    { samples: 513 },
    { samples: 16, lags: [16] },
    { samples: 16, lags: [0] },
    { pitch: -1 },
  ])
    assert.throws(() => profileSpatialStatistics(rough, params));
  assert.throws(() => profileSpatialStatistics({ ...rough, kind: 'smooth' }));
  const options = { samples: 16, lags: [1, 4] };
  assert.deepEqual(
    profileSpatialStatistics(rough, options),
    profileSpatialStatistics(rough, options),
  );
});
