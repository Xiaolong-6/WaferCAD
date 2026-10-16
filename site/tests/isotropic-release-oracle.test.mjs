import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isotropicOracleReaches,
  isotropicReleaseDepth,
  isotropicReleaseFrontZ,
  uniformRadialStairErrorBound,
} from '../isotropic-release-oracle.js';

test('continuous isotropic radius obeys Euclidean 3-4-5 cross-section', () => {
  assert.equal(isotropicReleaseDepth(5, 0), 5);
  assert.equal(isotropicReleaseDepth(5, 3), 4);
  assert.equal(isotropicReleaseDepth(5, 5), 0);
  assert.equal(isotropicReleaseDepth(5, 8), 0);
  assert.equal(isotropicReleaseFrontZ({ seedZ: 10, radius: 5, lateralDistance: 3 }), 6);
  assert.equal(
    isotropicReleaseFrontZ({ seedZ: 10, radius: 5, lateralDistance: 3, face: 'back' }),
    14,
  );
});

test('release reach is monotone with radius and lateral distance', () => {
  for (const d of [0, 0.1, 1, 2, 3, 4.5]) {
    let previous = 0;
    for (const r of [0.5, 1, 2, 3, 4, 5, 6, 8]) {
      const depth = isotropicReleaseDepth(r, d);
      assert.ok(depth >= previous);
      previous = depth;
    }
  }
  for (const r of [1, 4, 36]) {
    let previous = Infinity;
    for (let i = 0; i <= 100; i++) {
      const depth = isotropicReleaseDepth(r, (i * r) / 100);
      assert.ok(depth <= previous + 1e-12);
      previous = depth;
    }
  }
});

test('point oracle honors radius, direction and zero-volume tangency', () => {
  assert.equal(isotropicOracleReaches({ radius: 5, lateralDistance: 3, inwardDepth: 3 }), true);
  assert.equal(isotropicOracleReaches({ radius: 5, lateralDistance: 3, inwardDepth: 5 }), false);
  assert.equal(isotropicOracleReaches({ radius: 5, lateralDistance: 5, inwardDepth: 0 }), false);
  assert.equal(isotropicOracleReaches({ radius: 5, lateralDistance: 6, inwardDepth: 0 }), false);
});

test('uniform 8-step release has explicit conservative bound; refinement converges', () => {
  const radius = 36;
  const bounds = [8, 16, 32, 64].map((n) => uniformRadialStairErrorBound(radius, n));
  assert.ok(bounds.every(Number.isFinite));
  assert.ok(bounds[0] > bounds[1] && bounds[1] > bounds[2] && bounds[2] > bounds[3]);
  assert.ok(bounds[0] > 0, 'Eight-slice undercut is not a continuous silhouette');
  for (const n of [8, 16, 32]) {
    const step = radius / n;
    const exactNearRim = isotropicReleaseDepth(radius, radius - step);
    assert.ok(Math.abs(exactNearRim - uniformRadialStairErrorBound(radius, n)) < 1e-12);
  }
});

test('invalid inputs fail rather than creating an unphysical etch envelope', () => {
  assert.throws(() => isotropicReleaseDepth(-1, 0), RangeError);
  assert.throws(() => isotropicReleaseDepth(5, NaN), RangeError);
  assert.throws(() => isotropicReleaseFrontZ({ seedZ: 0, radius: 2, lateralDistance: 0, face: 'both' }), RangeError);
  assert.throws(() => uniformRadialStairErrorBound(36, 0), RangeError);
});
