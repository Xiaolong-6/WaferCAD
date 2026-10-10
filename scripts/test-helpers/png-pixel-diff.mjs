// Diagnostic-only 8-bit RGB/RGBA PNG decoder for comparing existing
// Playwright canvas screenshots. Does not change any visual acceptance gate.
// Fail closed for unsupported PNG color formats or interlacing.
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft,
    leftDistance = Math.abs(estimate - left),
    aboveDistance = Math.abs(estimate - above),
    upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
}

export function decodeScreenshotPng(source) {
  const data = Buffer.isBuffer(source) ? source : Buffer.from(source);
  if (data.length < 33 || !data.subarray(0, 8).equals(SIGNATURE))
    throw new Error('Not a PNG screenshot');
  let width = 0,
    height = 0,
    channels = 0,
    seenHeader = false;
  const idat = [];
  let position = 8;
  while (position + 12 <= data.length) {
    const size = data.readUInt32BE(position),
      type = data.toString('ascii', position + 4, position + 8),
      begin = position + 8,
      end = begin + size;
    if (end + 4 > data.length) throw new Error('Truncated PNG chunk');
    if (type === 'IHDR') {
      if (seenHeader || size !== 13) throw new Error('Invalid PNG IHDR');
      seenHeader = true;
      width = data.readUInt32BE(begin);
      height = data.readUInt32BE(begin + 4);
      const bits = data[begin + 8],
        color = data[begin + 9];
      if (bits !== 8 || ![2, 6].includes(color) || data[begin + 12] !== 0)
        throw new Error('Only non-interlaced 8-bit RGB/RGBA screenshots are supported');
      channels = color === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      idat.push(data.subarray(begin, end));
    } else if (type === 'IEND') {
      break;
    }
    position = end + 4;
  }
  if (!seenHeader || width <= 0 || height <= 0 || width * height > 10000000 || !idat.length)
    throw new Error('Missing or excessive PNG image data');
  const raw = inflateSync(Buffer.concat(idat)),
    stride = width * channels,
    expected = height * (stride + 1);
  if (raw.length !== expected) throw new Error('Unexpected PNG raster size');
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride),
    inputOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[inputOffset++],
      row = Buffer.alloc(stride);
    if (filter > 4) throw new Error('Unsupported PNG row filter');
    for (let x = 0; x < stride; x++) {
      const left = x < channels ? 0 : row[x - channels],
        above = previous[x],
        upperLeft = x < channels ? 0 : previous[x - channels];
      const predictor =
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2)
        : paeth(left, above, upperLeft);
      row[x] = (raw[inputOffset + x] + predictor) & 255;
    }
    inputOffset += stride;
    for (let x = 0; x < width; x++) {
      const from = x * channels,
        to = (y * width + x) * 4;
      rgba[to] = row[from];
      rgba[to + 1] = row[from + 1];
      rgba[to + 2] = row[from + 2];
      rgba[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row;
  }
  return { width, height, rgba };
}

export function compareScreenshotPngPixels(reference, candidate) {
  const a = decodeScreenshotPng(reference),
    b = decodeScreenshotPng(candidate);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      sameDimensions: false,
      referenceDimensions: [a.width, a.height],
      candidateDimensions: [b.width, b.height],
      pixelIdentical: false,
    };
  }
  const totalPixels = a.width * a.height,
    channelChanged = [0, 0, 0, 0];
  let differentPixels = 0,
    maxChannelDelta = 0,
    totalAbsoluteDelta = 0,
    minX = a.width,
    minY = a.height,
    maxX = -1,
    maxY = -1;
  const firstDifferences = [];
  for (let pixel = 0; pixel < totalPixels; pixel++) {
    const offset = pixel * 4;
    let changed = false;
    const delta = [];
    for (let channel = 0; channel < 4; channel++) {
      const diff = b.rgba[offset + channel] - a.rgba[offset + channel];
      delta.push(diff);
      if (diff) {
        changed = true;
        channelChanged[channel]++;
        maxChannelDelta = Math.max(maxChannelDelta, Math.abs(diff));
        totalAbsoluteDelta += Math.abs(diff);
      }
    }
    if (!changed) continue;
    differentPixels++;
    const x = pixel % a.width,
      y = Math.floor(pixel / a.width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (firstDifferences.length < 16) firstDifferences.push({ x, y, rgbaDelta: delta });
  }
  return {
    sameDimensions: true,
    width: a.width,
    height: a.height,
    totalPixels,
    differentPixels,
    changedFraction: differentPixels / totalPixels,
    pixelIdentical: differentPixels === 0,
    maxChannelDelta,
    totalAbsoluteDelta,
    changedChannelsRGBA: channelChanged,
    boundingBox:
      differentPixels > 0 ? { minX, minY, maxX, maxY } : null,
    firstDifferences,
  };
}
