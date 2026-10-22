import test from 'node:test';
import assert from 'node:assert/strict';
import {
  internalRevealFraction,
  buriedInterfaceOpacity,
  annotationSurfaceOpacity,
} from '../three-internal-visibility.js';

test('opaque material cannot reveal internal interfaces or buried annotations', () => {
  assert.equal(internalRevealFraction(1), 0);
  assert.equal(buriedInterfaceOpacity(1), 0);
  for (const peak of [0.14, 0.18, 0.2, 0.24, 0.3]) {
    assert.equal(annotationSurfaceOpacity(1, peak), 0);
  }
});

test('near-opaque mode does not turn buried material or electrical regions into visible projections', () => {
  const opacity = 0.96;
  assert.ok(buriedInterfaceOpacity(opacity) < 0.015);
  assert.ok(annotationSurfaceOpacity(opacity, 0.14) < 0.006);
  assert.ok(annotationSurfaceOpacity(opacity, 0.2) < 0.009);
  assert.ok(annotationSurfaceOpacity(opacity, 0.24) < 0.01);
});

test('buried structure visibility increases smoothly as physical material opacity drops', () => {
  let last = -1;
  for (const opacity of [1, 0.999, 0.96, 0.8, 0.5, 0.1]) {
    const current = buriedInterfaceOpacity(opacity);
    assert.ok(current >= last, `interface alpha is nondecreasing: ${opacity}`);
    last = current;
    assert.ok(current >= 0 && current <= 0.34);
  }
  assert.ok(buriedInterfaceOpacity(0.5) > buriedInterfaceOpacity(0.96));
  assert.ok(annotationSurfaceOpacity(0.5, 0.2) > annotationSurfaceOpacity(0.96, 0.2));
});

test('intentionally exposed annotation surfaces remain visible in opaque mode', () => {
  assert.equal(annotationSurfaceOpacity(1, 0.24, true), 0.24);
  assert.equal(annotationSurfaceOpacity(1, 0.3, true), 0.3);
  assert.ok(annotationSurfaceOpacity(0.96, 0.24, true) > 0.2);
});

test('invalid opacity falls back to fully opaque rather than exposing hidden contents', () => {
  for (const invalid of [NaN, undefined, 'not-a-number']) {
    assert.equal(internalRevealFraction(invalid), 0);
    assert.equal(buriedInterfaceOpacity(invalid), 0);
  }
});
