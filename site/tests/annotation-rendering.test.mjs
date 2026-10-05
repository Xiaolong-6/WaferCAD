import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMPLANT_DEPTH_GRADIENT,
  implantDepthAlphaScale,
} from '../annotation-rendering.js';

test('Implant depth-gradient contract is shared and normalized', () => {
  assert.deepEqual(IMPLANT_DEPTH_GRADIENT, {
    outerDepth: 0,
    midDepth: 0.48,
    innerDepth: 1,
    outerAlpha: 0.72,
    midAlpha: 0.4,
    innerAlpha: 0.04,
  });
  assert.equal(implantDepthAlphaScale(IMPLANT_DEPTH_GRADIENT.outerDepth), 1);
  assert.ok(
    Math.abs(
      implantDepthAlphaScale(IMPLANT_DEPTH_GRADIENT.midDepth) -
        IMPLANT_DEPTH_GRADIENT.midAlpha / IMPLANT_DEPTH_GRADIENT.outerAlpha,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      implantDepthAlphaScale(IMPLANT_DEPTH_GRADIENT.innerDepth) -
        IMPLANT_DEPTH_GRADIENT.innerAlpha / IMPLANT_DEPTH_GRADIENT.outerAlpha,
    ) < 1e-12,
  );
});
