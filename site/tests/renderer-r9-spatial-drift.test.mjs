import assert from 'node:assert/strict';
import test from 'node:test';
import * as spatial from '../../scripts/test-helpers/renderer-r9-spatial-drift.mjs';

const summarize = spatial.summarizeRendererR9SpatialDrift;
const png = (...pixels) => ({
  width: pixels.length,
  height: 1,
  rgba: Uint8Array.from(pixels.flatMap((rgb) => [...rgb, 255])),
});

test('one-LSB spatial census retains input bytes', () => {
  const baseline = png([10, 10, 10], [20, 20, 20], [20, 20, 20]);
  const altered = png([10, 10, 10], [21, 20, 20], [20, 20, 20]);
  const original = Uint8Array.from(baseline.rgba);
  const result = summarize(baseline, altered);
  assert.equal(result.differentPixels, 1);
  assert.equal(result.maxChannelDelta, 1);
  assert.equal(result.changedAlphaPixels, 0);
  assert.equal(result.changedWithNoNeighborVariation, 0);
  assert.equal(result.highestLocalRgbVariation, 10);
  assert.equal(result.changedPixelsWithLocalRgbVariationAbove[3], 1);
  assert.equal(result.changedPixelsWithLocalRgbVariationAbove[10], 0);
  assert.deepEqual(baseline.rgba, original);
});

test('one-LSB changes in flat reference regions stay distinguishable', () => {
  const baseline = png([10, 10, 10], [10, 10, 10], [10, 10, 10]);
  const altered = png([10, 10, 10], [11, 10, 10], [10, 10, 10]);
  const result = summarize(baseline, altered);
  assert.equal(result.changedWithNoNeighborVariation, 1);
  assert.equal(result.changedPixelsWithLocalRgbVariationAbove[0], 0);
  assert.equal(result.highestLocalRgbVariation, 0);
});

test('identical pixels and malformed RGBA inputs are recognized', () => {
  const baseline = png([1, 2, 3], [4, 5, 6]);
  assert.equal(summarize(baseline, baseline).differentPixels, 0);
  const withAlpha = { ...baseline, rgba: Uint8Array.from(baseline.rgba) };
  withAlpha.rgba[3] = 254;
  const alpha = summarize(baseline, withAlpha);
  assert.equal(alpha.changedAlphaPixels, 1);
  assert.equal(alpha.maxChannelDelta, 1);
  assert.throws(
    () => summarize(baseline, { ...baseline, width: 3 }),
    /matching positive PNG dimensions/,
  );
  assert.throws(
    () => summarize(baseline, { ...baseline, rgba: [] }),
    /complete matching RGBA buffers/,
  );
});
