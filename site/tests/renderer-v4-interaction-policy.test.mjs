import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDisableV4HeavyCameraDamping } from '../renderer-v4-interaction-policy.js';

test('V4 disables inertia only for explicitly opted-in heavy transparent arrays', () => {
  const heavy = {
    enabled: true,
    sceneVariant: 'transparent',
    arrayInstances: '1885',
    drawTriangles: '16906262',
  };
  assert.equal(shouldDisableV4HeavyCameraDamping(heavy), true);
  for (const override of [
    { enabled: false },
    { enabled: undefined },
    { sceneVariant: 'opaque' },
    { arrayInstances: 63 },
    { drawTriangles: 4_999_999 },
    { arrayInstances: NaN },
    { drawTriangles: Infinity },
    { drawTriangles: -1 },
  ]) {
    assert.equal(shouldDisableV4HeavyCameraDamping({ ...heavy, ...override }), false);
  }
});

test('invalid or missing diagnostics preserve default camera damping', () => {
  assert.equal(shouldDisableV4HeavyCameraDamping(), false);
  assert.equal(shouldDisableV4HeavyCameraDamping({ enabled: true }), false);
  assert.equal(
    shouldDisableV4HeavyCameraDamping({
      enabled: true,
      sceneVariant: 'transparent',
      arrayInstances: 'invalid',
      drawTriangles: '16906262',
    }),
    false,
  );
});
