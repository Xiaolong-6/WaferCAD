import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeRendererR9SpatialDrift,
} from '../../scripts/test-helpers/renderer-r9-spatial-drift.mjs';

const png = (width, height, pixels) => ({
  width,
  height,
  rgba: Uint8Array.from(pixels.flatMap((rgb) => [...rgb, 255])),
});

test('spatial census records one-LSB RGB changes without mutation', () => {
  const reference = png(3, 1, [
    [10, 10, 10],
    [20, 20, 20],
    [20, 20, 20],
  ]);
  const candidate = png(3, 1, [
    [10, 10, 10],
    [21, 20, 20],
    [20, 20, 20],
  ]);
  const original = Uint8Array.from(reference.rgba);
  const census = summarizeRendererR9SpatialDrift(reference, candidate);
  assert.equal(census.differentPixels, 1);
  assert.equal(census.maxChannelDelta, 1);
  assert.equal(census.changedAlphaPixels, 0);
  assert.equal(census.changedWithNoNeighborVariation, 0);
  assert.equal(census.highestLocalRgbVariation, 10);
  assert.deepEqual(census.changedPixelsWithLocalRgbVariationAbove, {
    0: 1,
    1: 1,
    3: 1,
    10: 0,
    20: 0,
    50: 0,
  });
  assert.deepEqual(reference.rgba, original, 'source remains unchanged');
});

test('flat drift is distinct from a reference gradient', () => {
  const reference = png(3, 1, [[10, 10, 10], [10, 10, 10], [10, 10, 10]]);
  const candidate = png(3, 1, [[10, 10, 10], [11, 10, 10], [10, 10, 10]]);
  const census = summarizeRendererR9SpatialDrift(reference, candidate);
  assert.equal(census.changedWithNoNeighborVariation, 1);
  assert.equal(census.changedPixelsWithLocalRgbVariationAbove[0], 0);
  assert.equal(census.highestLocalRgbVariation, 0);
});

test('identical pixels, alpha drift and invalid PNG buffers fail closed', () => {
  const reference = png(2, 2, [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
  assert.equal(summarizeRendererR9SpatialDrift(reference, reference).differentPixels, 0);
  const withAlpha = { ...reference, rgba: Uint8Array.from(reference.rgba) };
  withAlpha.rgba[3] = 254;
  const alphaCensus = summarizeRendererR9SpatialDrift(reference, withAlpha);
  assert.equal(alphaCensus.changedAlphaPixels, 1);
  assert.equal(alphaCensus.maxChannelDelta, 1);
  assert.throws(
    () => summarizeRendererR9SpatialDrift(reference, { ...reference, width: 3 }),
    /matching positive PNG dimensions/,
  );
  assert.throws(
    () => summarizeRendererR9SpatialDrift(reference, { ...reference, rgba: [] }),
    /complete matching RGBA buffers/,
  );
});
