import assert from 'node:assert/strict';
import test from 'node:test';
import {
  roughDisplayHeightBlend,
  roughFarFieldContrast,
  roughDisplayProfileOffsetAtPoint,
  roughProfileOffsetAtPoint,
} from '../surface-rendering.js';

const appearance = {
  kind: 'rough',
  morphology: 'stochastic',
  polarity: 'normal',
  featureSize: 0.3,
  meanHeight: 0.5,
  etchDepth: 0.9,
  featureCv: 0.25,
  heightCv: 0.3,
  seed: 20261015,
};

test('coarse macro features are display-filtered but resolved microfeatures are exact', () => {
  assert.equal(roughDisplayHeightBlend(0.3, 2), 0.12);
  assert.equal(roughDisplayHeightBlend(0.3, 0.04), 1);
  assert.equal(roughDisplayHeightBlend(0.3, 0), 1);
  assert.ok(roughDisplayHeightBlend(0.3, 0.6) > 0.12);
  const x = 2.135,
    y = -1.843;
  const raw = roughProfileOffsetAtPoint(x, y, appearance),
    blend = 0.12,
    center = appearance.etchDepth - appearance.meanHeight;
  assert.equal(roughDisplayProfileOffsetAtPoint(x, y, appearance), raw);
  assert.equal(
    roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: 1 }),
    raw,
  );
  const low = roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: blend });
  assert.ok(Math.abs(low - (center + blend * (raw - center))) < 1e-12);
  assert.equal(
    roughDisplayProfileOffsetAtPoint(x, y, { ...appearance, displayRoughBlend: 0 }),
    center,
  );
});

test('display height is deterministic and preserves front/back physical profile bounds', () => {
  const before = JSON.stringify(appearance);
  for (const seed of [1, 123, 20261015]) {
    for (const polarity of ['normal', 'inverted']) {
      const profile = { ...appearance, seed, polarity, displayRoughBlend: 0.15 },
        center =
          polarity === 'normal'
            ? appearance.etchDepth - appearance.meanHeight
            : appearance.meanHeight;
      for (const [x, y] of [
        [0, 0],
        [0.125, -0.76],
        [2495, 3],
      ]) {
        const actual = roughDisplayProfileOffsetAtPoint(x, y, profile),
          raw = roughProfileOffsetAtPoint(x, y, profile);
        assert.ok(Math.abs(actual - (center + 0.15 * (raw - center))) < 1e-12);
        assert.ok(actual >= 0 && actual <= appearance.etchDepth);
      }
    }
  }
  assert.equal(JSON.stringify(appearance), before);
});

test('subpixel relief stays visible without exaggerating the physical heightfield', () => {
  const original = JSON.stringify(appearance);
  const far = roughFarFieldContrast(0.02, appearance);
  assert.ok(far > 0.1 && far < 0.22);
  assert.ok(roughFarFieldContrast(1.5, appearance) < far);
  assert.equal(roughFarFieldContrast(10, appearance), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, kind: 'smooth' }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, meanHeight: 0 }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, heightCv: 0 }), 0);
  assert.equal(roughFarFieldContrast(0.01, { ...appearance, morphology: 'pyramid' }), 0);
  assert.ok(
    roughFarFieldContrast(0.02, { ...appearance, meanHeight: 0.01 }) < far,
  );
  assert.equal(JSON.stringify(appearance), original);
});

test('Photodetector stochastic morphology is visible at overview without changing geometry', () => {
  const profiles = [
    { ...appearance, featureSize: 0.3, meanHeight: 0.5, heightCv: 0.25, seed: 3668339987 },
    { ...appearance, featureSize: 0.2, meanHeight: 0.7, heightCv: 0.25, seed: 3668339987 },
  ];
  const original = profiles.map((profile) => JSON.stringify(profile));
  const far = profiles.map((profile) => roughFarFieldContrast(0.03, profile));
  assert.ok(far[0] > 0.1 && far[0] < 0.28);
  assert.ok(far[1] > far[0] && far[1] < 0.28);
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const z = roughProfileOffsetAtPoint(0.125, -0.65, profile);
    assert.equal(roughFarFieldContrast(12, profile), 0);
    assert.equal(roughProfileOffsetAtPoint(0.125, -0.65, profile), z);
    assert.equal(JSON.stringify(profile), original[i]);
  }
});
