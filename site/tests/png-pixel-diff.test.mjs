import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeScreenshotPng,
  compareScreenshotPngPixels,
} from '../../scripts/test-helpers/png-pixel-diff.mjs';

// Tiny real PNG RGB fixtures exercising zlib and row-filter reconstruction.
const SAME = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mPkEpGTk5NjsbGxkZOTAwAKVgGqA5YtDwAAAABJRU5ErkJggg==',
  'base64',
);
const CHANGED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mPkEpGTk5NnsbGxkZeTAwAKYQGsjyIfQwAAAABJRU5ErkJggg==',
  'base64',
);

test('Playwright RGB PNG bytes decode to exact RGBA pixel samples', () => {
  const image = decodeScreenshotPng(SAME);
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.deepEqual(
    [...image.rgba],
    [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255],
  );
});

test('pixel diagnostics distinguish byte parity from one-LSB RGB differences', () => {
  const same = compareScreenshotPngPixels(SAME, Buffer.from(SAME));
  assert.equal(same.pixelIdentical, true);
  assert.equal(same.differentPixels, 0);
  assert.equal(same.maxChannelDelta, 0);
  assert.deepEqual(same.changedChannelsRGBA, [0, 0, 0, 0]);
  assert.equal(same.boundingBox, null);

  const changed = compareScreenshotPngPixels(SAME, CHANGED);
  assert.equal(changed.sameDimensions, true);
  assert.equal(changed.totalPixels, 4);
  assert.equal(changed.differentPixels, 2);
  assert.equal(changed.changedFraction, 0.5);
  assert.equal(changed.maxChannelDelta, 1);
  assert.equal(changed.totalAbsoluteDelta, 2);
  assert.deepEqual(changed.changedChannelsRGBA, [1, 0, 1, 0]);
  assert.deepEqual(changed.boundingBox, { minX: 1, minY: 0, maxX: 1, maxY: 1 });
});

test('malformed and unsupported PNG inputs fail closed', () => {
  assert.throws(() => decodeScreenshotPng(Buffer.from('not a png')), /Not a PNG/);
  assert.throws(() => decodeScreenshotPng(SAME.subarray(0, 45)), /Truncated/);
  const unsupported = Buffer.from(SAME);
  unsupported[25] = 3; // Indexed-color screenshots cannot be silently interpreted as RGB.
  assert.throws(() => decodeScreenshotPng(unsupported), /Only non-interlaced/);
});
