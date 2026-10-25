import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { isFixedDirectGridSeam } = await import('../direct-grid-seam.js');
const { rectMulti } = await import('../vector-geometry.js');
const ringArea = (ring) =>
  Math.abs(ring.slice(1).reduce((a, p, i) => a + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2);
const area = (multi) =>
  multi.reduce(
    (a, poly) =>
      a + ringArea(poly[0]) - poly.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0),
    0,
  );
const grid = 1e-4;
const thinTailWithWidePocket = [
  [
    [
      [0, 0],
      [100, 0],
      [100, 0.0001],
      [0.01, 0.0001],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ],
];

test('accepts a genuine 0.1 nm-wide 100 µm-long Boolean seam', () => {
  assert.equal(isFixedDirectGridSeam(rectMulti(100, grid), grid, area), true);
});

test('a long grid seam cannot conceal a locally 10 nm-wide real pocket', () => {
  const poly = thinTailWithWidePocket[0];
  const p = poly[0];
  const perimeter = p
    .slice(1)
    .reduce((s, v, i) => s + Math.hypot(v[0] - p[i][0], v[1] - p[i][1]), 0);
  assert.ok((2 * area([poly])) / perimeter < 2 * grid, 'old rule incorrectly accepts this');
  assert.equal(isFixedDirectGridSeam([poly], grid, area), false);
});

test('rejects finite-area 0.4 nm and 10 nm circularly bounded features', () => {
  assert.equal(isFixedDirectGridSeam(rectMulti(100, 4 * grid), grid, area), false);
  assert.equal(isFixedDirectGridSeam(rectMulti(0.01, 0.01), grid, area), false);
});

test('each disconnected island must be a seam in its own right', () => {
  const thin = rectMulti(50, grid, -26)[0];
  const wide = rectMulti(0.01, 0.01, 26)[0];
  assert.equal(isFixedDirectGridSeam([thin, wide], grid, area), false);
  assert.equal(isFixedDirectGridSeam([thin], grid, area), true);
});

test('malformed geometry and invalid grid or area callbacks fail closed', () => {
  assert.equal(isFixedDirectGridSeam([], grid, area), false);
  assert.equal(isFixedDirectGridSeam([[[[0, 0]]]], grid, area), false);
  assert.throws(() => isFixedDirectGridSeam(rectMulti(1, 1), 0, area), /grid/);
  assert.throws(() => isFixedDirectGridSeam(rectMulti(1, 1), grid, null), /Area/);
});

test('rotated thin segments obey a local width, not axis-aligned bounding boxes', async () => {
  const { transformMulti } = await import('../vector-geometry.js');
  const rotate = (multi) =>
    transformMulti(multi, ([x, y]) => [(x - y) / Math.SQRT2, (x + y) / Math.SQRT2]);
  assert.equal(isFixedDirectGridSeam(rotate(rectMulti(10, grid * 2)), grid, area), true);
  assert.equal(isFixedDirectGridSeam(rotate(rectMulti(10, grid * 2.5)), grid, area), false);
});

test('a true thin polygon ring is measured relative to both its outer and hole edges', async () => {
  const { difference } = await import('../vector-geometry.js');
  const annulus = difference(rectMulti(1, 1), rectMulti(1 - 2 * grid, 1 - 2 * grid));
  assert.equal(annulus.length, 1);
  assert.equal(annulus[0].length, 2);
  assert.equal(isFixedDirectGridSeam(annulus, grid, area), true);
});
