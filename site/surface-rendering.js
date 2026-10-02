function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function smoothstep(edge0, edge1, value) {
  if (!(edge1 > edge0)) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function roughLod(featurePixels) {
  const px = Math.max(0, Number(featurePixels) || 0);
  return {
    detail: smoothstep(0.75, 6, px),
    micro: smoothstep(1.5, 10, px),
  };
}

function hashUnit(seed, index) {
  let x = (Number(seed) >>> 0) ^ Math.imul(index | 0, 0x9e3779b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

export function roughNoise1D(distance, appearance) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    x = Number(distance) / feature,
    i0 = Math.floor(x),
    t = x - i0,
    eased = t * t * (3 - 2 * t),
    a = hashUnit(appearance?.seed || 0, i0) * 2 - 1,
    b = hashUnit(appearance?.seed || 0, i0 + 1) * 2 - 1;
  return a + (b - a) * eased;
}

export function roughProfileOffsetAtPoint(x, y, appearance, featurePixels = Infinity) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    amplitude = Math.max(0, Number(appearance?.amplitude) || 0),
    seed = Number(appearance?.seed) >>> 0,
    angle = ((seed % 3600) / 3600) * Math.PI * 2,
    coordinate = Number(x) * Math.cos(angle) + Number(y) * Math.sin(angle),
    primary = roughNoise1D(coordinate, appearance),
    fine = roughNoise1D(coordinate, {
      ...appearance,
      featureSize: feature * 0.48,
      seed: (seed ^ 0x9e3779b9) >>> 0,
    }),
    noise = Math.max(-1, Math.min(1, primary * 0.78 + fine * 0.22)),
    lod = roughLod(featurePixels),
    mediumStrength = lod.detail * (1 - lod.micro) * 0.35,
    strength = lod.micro + mediumStrength,
    offset = noise * amplitude * 0.5 * strength;
  return Object.is(offset, -0) ? 0 : offset;
}

export function roughTextureValue(seed, x, y) {
  const rowSeed = ((Number(seed) >>> 0) ^ Math.imul(y | 0, 0x85ebca6b)) >>> 0;
  return hashUnit(rowSeed, x | 0);
}
