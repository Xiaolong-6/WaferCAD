import assert from 'node:assert/strict';
import test from 'node:test';
import {
  facetNormalFilmVerticalSeparation,
  squarePyramidReliefVolume,
  squarePyramidSample,
} from '../physical-facet-math.js';

const args = { pitch: 6.4, height: 4.5, planeZ: 125.5, originX: 0, originY: 0 };

test('physical pyramid preserves apex, valley and front/back reflection', () => {
  const front = squarePyramidSample(0, 0, args);
  const back = squarePyramidSample(0, 0, { ...args, face: 'back' });
  assert.equal(front.z, 130);
  assert.equal(back.z, 121);
  assert.equal(front.normal, null, 'A pyramid apex has no unique face normal');
  assert.equal(front.crease, true);
  for (const point of [
    [3.2, 0],
    [0, 3.2],
    [3.2, 3.2],
    [6.4, 3.2],
  ]) {
    const top = squarePyramidSample(...point, args);
    const bottom = squarePyramidSample(...point, { ...args, face: 'back' });
    assert.ok(Math.abs(top.z + bottom.z - 251) < 1e-12);
    assert.ok(Math.abs(top.relief - bottom.relief) < 1e-12);
  }
});

test('facet normal is unit length, consistent with analytic tangent slopes', () => {
  for (const [x, y] of [
    [1.2, 0.4],
    [-1.2, 0.4],
    [0.4, 1.2],
    [0.4, -1.2],
  ]) {
    const sample = squarePyramidSample(x, y, args);
    assert.ok(sample.normal);
    const [nx, ny, nz] = sample.normal;
    const [gx, gy] = sample.gradient;
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-12);
    assert.ok(Math.abs(nx + gx * nz) < 1e-12);
    assert.ok(Math.abs(ny + gy * nz) < 1e-12);
  }
});

test('normal film thickness is not confused with vertical thickness', () => {
  const face = squarePyramidSample(1.2, 0.4, args);
  const t = 0.001;
  const dz = facetNormalFilmVerticalSeparation(face, t);
  const normalDistance = dz / Math.hypot(...face.gradient, 1);
  assert.ok(dz > t, 'A sloped surface has a larger fixed-XY vertical gap');
  assert.ok(Math.abs(normalDistance - t) < 1e-12);
  assert.throws(
    () => facetNormalFilmVerticalSeparation(squarePyramidSample(0, 0, args), t),
    /undefined/,
  );
});

test('one analytic pyramid volume and repeated surface are deterministic', () => {
  assert.ok(Math.abs(squarePyramidReliefVolume(6.4, 4.5) - 61.44) < 1e-12);
  const left = squarePyramidSample(1.2, 0.4, args);
  const repeated = squarePyramidSample(1.2 + 3 * 6.4, 0.4 - 2 * 6.4, args);
  assert.ok(Math.abs(left.z - repeated.z) < 1e-12);
  assert.deepEqual(left.gradient, repeated.gradient);
});

test('invalid parameters fail closed', () => {
  assert.throws(() => squarePyramidSample(0, 0, { ...args, height: 0 }), RangeError);
  assert.throws(() => squarePyramidSample(0, 0, { ...args, pitch: NaN }), RangeError);
  assert.throws(() => squarePyramidSample(0, 0, { ...args, face: 'both' }), RangeError);
  assert.throws(() => facetNormalFilmVerticalSeparation({ gradient: [0, 0] }, 0.01), RangeError);
});
