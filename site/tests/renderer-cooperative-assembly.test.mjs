import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldYieldDuringSceneAssembly } from '../renderer-cooperative-assembly.js';

test('large non-array M3D scenes use cooperative assembly', () => {
  assert.equal(
    shouldYieldDuringSceneAssembly({ capCount: 180, sidewallCount: 220, arrayInstances: 0 }),
    true,
  );
  assert.equal(shouldYieldDuringSceneAssembly({ annotationCount: 32 }), true);
  assert.equal(shouldYieldDuringSceneAssembly({ capCount: 95 }), false);
  assert.equal(shouldYieldDuringSceneAssembly({ capCount: 96 }), true);
});

test('array scenes retain the established threshold and small scenes stay synchronous', () => {
  assert.equal(shouldYieldDuringSceneAssembly({ arrayInstances: 64 }), true);
  assert.equal(shouldYieldDuringSceneAssembly({ arrayInstances: 63 }), false);
  assert.equal(shouldYieldDuringSceneAssembly({ capCount: 2, sidewallCount: 1 }), false);
  assert.equal(shouldYieldDuringSceneAssembly(), false);
});
