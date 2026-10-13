// Offline-only spatial census for already captured PNGs.
// Local color variation is observational; it cannot prove an MSAA root cause.
const GRADIENT_THRESHOLDS = [0, 1, 3, 10, 20, 50];

export function summarizeRendererR9SpatialDrift(reference, candidate) {
  if (
    !reference ||
    !candidate ||
    !Number.isSafeInteger(reference.width) ||
    !Number.isSafeInteger(reference.height) ||
    reference.width < 1 ||
    reference.height < 1 ||
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  ) {
    throw new Error('Spatial drift requires matching positive PNG dimensions');
  }
  const { width, height } = reference;
  const bytes = width * height * 4;
  if (
    !reference.rgba ||
    !candidate.rgba ||
    reference.rgba.length !== bytes ||
    candidate.rgba.length !== bytes
  ) {
    throw new Error('Spatial drift requires complete matching RGBA buffers');
  }
  const thresholds = Object.fromEntries(GRADIENT_THRESHOLDS.map((level) => [level, 0]));
  let differentPixels = 0;
  let changedAlphaPixels = 0;
  let maxChannelDelta = 0;
  let highestLocalRgbVariation = 0;
  let changedWithNoNeighborVariation = 0;
  const before = reference.rgba;
  const after = candidate.rgba;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(before[offset + channel] - after[offset + channel]);
      if (delta) changed = true;
      if (channel === 3 && delta) changedAlphaPixels++;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    if (!changed) continue;
    differentPixels++;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [];
    if (x > 0) neighbors.push(pixel - 1);
    if (x + 1 < width) neighbors.push(pixel + 1);
    if (y > 0) neighbors.push(pixel - width);
    if (y + 1 < height) neighbors.push(pixel + width);
    let localVariation = 0;
    for (const adjacent of neighbors) {
      for (let channel = 0; channel < 3; channel++) {
        const neighborOffset = adjacent * 4 + channel;
        localVariation = Math.max(
          localVariation,
          Math.abs(before[offset + channel] - before[neighborOffset]),
        );
      }
    }
    if (localVariation === 0) changedWithNoNeighborVariation++;
    highestLocalRgbVariation = Math.max(highestLocalRgbVariation, localVariation);
    for (const level of GRADIENT_THRESHOLDS) {
      if (localVariation > level) thresholds[level]++;
    }
  }
  return {
    width,
    height,
    differentPixels,
    maxChannelDelta,
    changedAlphaPixels,
    changedWithNoNeighborVariation,
    highestLocalRgbVariation,
    changedPixelsWithLocalRgbVariationAbove: thresholds,
    gradientDefinition: 'maximum absolute 8-bit RGB difference to 4-connected neighbors in the reference PNG',
    interpretation: 'observational-locality-only-not-proof-of-MSAA-or-edge-causation',
  };
}
