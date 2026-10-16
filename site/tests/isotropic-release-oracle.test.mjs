import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptiveReleaseDepthBands,
  planSelectiveIsotropicRelease,
  isotropicOracleReaches,
  isotropicReleaseDepth,
  isotropicReleaseFrontZ,
  uniformDepthMidpointLateralErrorBound,
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
  assert.ok(bounds[0] > 17, 'Eight radial staircase slices have a large edge-depth bound');
  for (const n of [8, 16, 32]) {
    const step = radius / n;
    const exactNearRim = isotropicReleaseDepth(radius, radius - step);
    assert.ok(Math.abs(exactNearRim - uniformRadialStairErrorBound(radius, n)) < 1e-12);
  }
});

test('production depth-band midpoint footprints have a separate lateral error bound', () => {
  const radius = 36;
  const slices = 8;
  const bound = uniformDepthMidpointLateralErrorBound(radius, slices);
  assert.ok(bound > 12 && bound < 13);
  assert.ok(bound < uniformRadialStairErrorBound(radius, slices));
  for (let i = 0; i < slices; i++) {
    const d0 = (radius * i) / slices;
    const d1 = (radius * (i + 1)) / slices;
    const mid = (d0 + d1) / 2;
    const footprint = isotropicReleaseDepth(radius, mid);
    for (const edge of [d0, d1]) {
      const exact = isotropicReleaseDepth(radius, edge);
      assert.ok(Math.abs(exact - footprint) <= bound + 1e-12);
    }
  }
  const sequence = [8, 16, 32, 64].map((n) => uniformDepthMidpointLateralErrorBound(radius, n));
  assert.ok(sequence.every((value, i) => i === 0 || value < sequence[i - 1]));
});

test('invalid inputs fail rather than creating an unphysical etch envelope', () => {
  assert.throws(() => isotropicReleaseDepth(-1, 0), RangeError);
  assert.throws(() => isotropicReleaseDepth(5, NaN), RangeError);
  assert.throws(
    () => isotropicReleaseFrontZ({ seedZ: 0, radius: 2, lateralDistance: 0, face: 'both' }),
    RangeError,
  );
  assert.throws(() => uniformRadialStairErrorBound(36, 0), RangeError);
});

test('adaptive depth bands guarantee lateral accuracy at every depth', () => {
  const radius = 36;
  const bands = adaptiveReleaseDepthBands({ radius, maxLateralErrorUm: 0.5 });
  assert.equal(bands.length, 36);
  assert.equal(bands[0].depth0, 0);
  assert.equal(bands.at(-1).depth1, radius);
  for (const [index, band] of bands.entries()) {
    if (index > 0) assert.ok(Math.abs(bands[index - 1].depth1 - band.depth0) < 1e-12);
    assert.ok(band.maxLateralErrorUm <= 0.5 + 1e-12);
    assert.ok(band.depth1 > band.depth0);
    for (let j = 0; j <= 8; j++) {
      const depth = band.depth0 + ((band.depth1 - band.depth0) * j) / 8;
      const exactLateral = isotropicReleaseDepth(radius, depth);
      assert.ok(Math.abs(exactLateral - band.lateralRadius) <= 0.5 + 1e-12);
    }
  }
});

test('adaptive front accuracy is monotone and fails closed on band budget', () => {
  const counts = [1, 0.5, 0.25].map(
    (error) => adaptiveReleaseDepthBands({ radius: 36, maxLateralErrorUm: error }).length,
  );
  assert.deepEqual(counts, [18, 36, 72]);
  assert.deepEqual(adaptiveReleaseDepthBands({ radius: 0, maxLateralErrorUm: 0.5 }), []);
  assert.throws(
    () => adaptiveReleaseDepthBands({ radius: 36, maxLateralErrorUm: 0.001 }),
    /budget/,
  );
  assert.throws(
    () => adaptiveReleaseDepthBands({ radius: 36, maxLateralErrorUm: NaN }),
    RangeError,
  );
  assert.throws(
    () => adaptiveReleaseDepthBands({ radius: 36, maxLateralErrorUm: 0.5, maxBands: 0 }),
    RangeError,
  );
});

test('selective exposed seed plans preserve Front/Back Z bands and material targets', () => {
  const params = {
    seedLayerId: 'base',
    seedZ: 10,
    targetLayerIds: ['base'],
    isExposed: true,
    radius: 36,
    maxLateralErrorUm: 0.5,
  };
  const front = planSelectiveIsotropicRelease({ ...params, face: 'front' });
  const back = planSelectiveIsotropicRelease({ ...params, face: 'back' });
  assert.equal(front.bands.length, 36);
  assert.equal(back.bands.length, 36);
  assert.deepEqual(front.targetLayerIds, ['base']);
  assert.equal(front.bands[0].z1, params.seedZ);
  assert.equal(front.bands.at(-1).z0, params.seedZ - params.radius);
  assert.equal(back.bands[0].z0, params.seedZ);
  assert.equal(back.bands.at(-1).z1, params.seedZ + params.radius);
  for (let i = 0; i < front.bands.length; i++) {
    const upper = front.bands[i];
    const lower = back.bands[i];
    assert.ok(upper.z1 > upper.z0);
    assert.ok(lower.z1 > lower.z0);
    assert.ok(Math.abs(upper.z0 + lower.z1 - 2 * params.seedZ) < 1e-12);
    assert.ok(Math.abs(upper.z1 + lower.z0 - 2 * params.seedZ) < 1e-12);
    if (i > 0) {
      assert.ok(Math.abs(front.bands[i - 1].z0 - upper.z1) < 1e-12);
      assert.ok(Math.abs(back.bands[i - 1].z1 - lower.z0) < 1e-12);
    }
  }
});

test('selective seed planning rejects hidden, unselected or excessive work', () => {
  const valid = {
    seedLayerId: 'base', seedZ: 0, face: 'front',
    targetLayerIds: ['base'], isExposed: true,
    radius: 36, maxLateralErrorUm: 0.5,
  };
  assert.throws(
    () => planSelectiveIsotropicRelease({ ...valid, isExposed: false }),
    /physically exposed/,
  );
  assert.throws(
    () => planSelectiveIsotropicRelease({ ...valid, targetLayerIds: ['oxide'] }),
    /selected target/,
  );
  assert.throws(
    () => planSelectiveIsotropicRelease({ ...valid, maxBands: 8 }),
    /band budget/,
  );
  assert.throws(
    () => planSelectiveIsotropicRelease({ ...valid, face: 'both' }),
    /Invalid physical/,
  );
  assert.deepEqual(planSelectiveIsotropicRelease({ ...valid, radius: 0 }).bands, []);
});
