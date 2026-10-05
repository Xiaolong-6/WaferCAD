import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annotationDepthFraction,
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

test('host-layer clipping and Etch preserve the original Implant depth gradient on both faces', () => {
  for (const face of ['front', 'back']) {
    const direction = face === 'front' ? -1 : 1,
      original = { face, sourceZ: 5, thickness: 2 },
      clipped = { ...original, outerZ: 5 + direction * 0.5, innerZ: 5 + direction * 1.5 };
    assert.equal(annotationDepthFraction(clipped, clipped.outerZ), 0.25);
    assert.equal(annotationDepthFraction(clipped, clipped.innerZ), 0.75);
    for (const depth of [0.5, 1, 1.5]) {
      const z = 5 + direction * depth;
      assert.equal(annotationDepthFraction(clipped, z), annotationDepthFraction(original, z));
    }
  }
});
