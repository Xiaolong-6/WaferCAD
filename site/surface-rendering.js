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

export function roughMeshTriangleBudget({ triangleCount = 1, clipped = false } = {}) {
  const triangles = Math.max(1, Math.floor(Number(triangleCount) || 1)),
    floor = clipped ? 36000 : 72000,
    ceiling = clipped ? 72000 : 180000;
  return Math.min(ceiling, Math.max(floor, triangles * 16));
}

export function roughMeshSubdivisionDepth({
  triangleCount = 1,
  maxEdge = 0,
  featureSize = 1,
  maxTriangles = 36000,
  maxDepth = 6,
} = {}) {
  const triangles = Math.max(1, Math.floor(Number(triangleCount) || 1)),
    edge = Math.max(0, Number(maxEdge) || 0),
    feature = Math.max(1e-9, Number(featureSize) || 1),
    targetEdge = feature * 0.75,
    desiredDepth =
      edge > targetEdge ? Math.max(0, Math.ceil(Math.log2(edge / targetEdge))) : 0,
    budget = Math.max(triangles, Math.floor(Number(maxTriangles) || triangles)),
    budgetDepth = Math.max(
      0,
      Math.floor(Math.log(Math.max(1, budget / triangles)) / Math.log(4)),
    ),
    depthLimit = Math.max(0, Math.floor(Number(maxDepth) || 0));
  return Math.min(desiredDepth, budgetDepth, depthLimit);
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

function gaussianHash(seed, x, y, channel = 0) {
  const a = Math.max(
      1e-12,
      hashUnit((Number(seed) >>> 0) ^ Math.imul((y | 0) + channel * 17, 0x85ebca6b), x | 0),
    ),
    b = hashUnit(
      (Number(seed) >>> 0) ^ Math.imul((y | 0) + channel * 29, 0xc2b2ae35),
      (x | 0) + channel * 13,
    );
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(Math.PI * 2 * b);
}

function gaussianNoise2D(x, y, featureSize, seed, channel = 0) {
  const feature = Math.max(1e-9, Number(featureSize) || 1),
    gx = Number(x) / feature,
    gy = Number(y) / feature,
    ix = Math.floor(gx),
    iy = Math.floor(gy),
    tx = gx - ix,
    ty = gy - iy,
    sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty),
    sample = (dx, dy) => gaussianHash(seed, ix + dx, iy + dy, channel),
    a = sample(0, 0) + (sample(1, 0) - sample(0, 0)) * sx,
    b = sample(0, 1) + (sample(1, 1) - sample(0, 1)) * sx;
  // Smooth interpolation lowers the variance; this factor keeps CV controls
  // close to their statistical meaning without introducing discontinuities.
  return (a + (b - a) * sy) * 1.5;
}

function lognormalFactor(cv, z) {
  const value = Math.max(0, Math.min(1, Number(cv) || 0));
  if (value <= 1e-12) return 1;
  const sigma = Math.sqrt(Math.log1p(value * value));
  return Math.exp(-0.5 * sigma * sigma + sigma * Math.max(-3.5, Math.min(3.5, z)));
}

export function roughMaxRelief(appearance) {
  const depth = Number(appearance?.etchDepth),
    meanHeight = Math.max(0, Number(appearance?.meanHeight ?? appearance?.amplitude) || 0);
  return Number.isFinite(depth) && depth > 0 ? depth : meanHeight;
}

export function roughVisualBoundsZ(model, baseBounds = [0, 0]) {
  let lo = Number(baseBounds?.[0]),
    hi = Number(baseBounds?.[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 0];

  for (const region of model?.regions || []) {
    for (const segment of region.stack || []) {
      const front = segment.frontSurface,
        back = segment.backSurface;
      if (front?.kind === 'rough') hi = Math.max(hi, segment.z1 + roughMaxRelief(front));
      if (back?.kind === 'rough') lo = Math.min(lo, segment.z0 - roughMaxRelief(back));
    }
  }
  return [lo, hi];
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

function roughNoise2D(x, y, featureSize, seed) {
  const feature = Math.max(1e-9, Number(featureSize) || 1),
    gx = Number(x) / feature,
    gy = Number(y) / feature,
    ix = Math.floor(gx),
    iy = Math.floor(gy),
    tx = gx - ix,
    ty = gy - iy,
    sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty),
    sample = (dx, dy) =>
      hashUnit((Number(seed) >>> 0) ^ Math.imul((iy + dy) | 0, 0x85ebca6b), (ix + dx) | 0) *
        2 -
      1,
    a = sample(0, 0) + (sample(1, 0) - sample(0, 0)) * sx,
    b = sample(0, 1) + (sample(1, 1) - sample(0, 1)) * sx;
  return a + (b - a) * sy;
}

function pyramidProfileOffsetAtPoint(x, y, appearance) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    depth = roughMaxRelief(appearance),
    height = Math.min(
      depth,
      Math.max(0, Number(appearance?.meanHeight ?? appearance?.amplitude) || feature),
    ),
    wrap = (value) => {
      const unit = Number(value) / feature;
      return unit - Math.floor(unit + 0.5);
    },
    localX = wrap(x),
    localY = wrap(y),
    tent = Math.max(0, 1 - 2 * Math.max(Math.abs(localX), Math.abs(localY))),
    normalOffset = height * tent,
    offset = appearance?.polarity === 'normal' ? normalOffset : depth - normalOffset;
  return Object.is(offset, -0) ? 0 : offset;
}

export function roughProfileOffsetAtPoint(x, y, appearance) {
  if (appearance?.morphology === 'pyramid') {
    return pyramidProfileOffsetAtPoint(x, y, appearance);
  }

  const meanFeature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    meanHeight = Math.max(
      0,
      Number(appearance?.meanHeight ?? appearance?.amplitude) || meanFeature,
    ),
    featureCv = Math.max(0, Math.min(1, Number(appearance?.featureCv) || 0)),
    heightCv = Math.max(0, Math.min(1, Number(appearance?.heightCv) || 0)),
    seed = Number(appearance?.seed) >>> 0,
    angle = ((seed % 3600) / 3600) * Math.PI * 2,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    rx = Number(x) * cos + Number(y) * sin,
    ry = -Number(x) * sin + Number(y) * cos,
    featureFactor = lognormalFactor(
      featureCv,
      gaussianNoise2D(rx, ry, meanFeature * 4, (seed ^ 0x51ed270b) >>> 0, 1),
    ),
    localFeature = Math.max(meanFeature * 0.2, meanFeature * featureFactor),
    heightFactor = lognormalFactor(
      heightCv,
      gaussianNoise2D(rx, ry, localFeature, (seed ^ 0x9e3779b9) >>> 0, 2),
    ),
    relief = Math.min(roughMaxRelief(appearance), meanHeight * heightFactor),
    polarity = appearance?.polarity === 'normal' ? 'normal' : 'inverted',
    offset = polarity === 'normal' ? roughMaxRelief(appearance) - relief : relief;
  return Object.is(offset, -0) ? 0 : offset;
}

export function roughTextureValue(appearanceOrSeed, x, y, size = 64) {
  if (appearanceOrSeed && typeof appearanceOrSeed === 'object') {
    const appearance = appearanceOrSeed,
      feature = Math.max(1e-9, Number(appearance.featureSize) || 1),
      span = feature * 8,
      px = (Number(x) / Math.max(1, size - 1)) * span,
      py = (Number(y) / Math.max(1, size - 1)) * span,
      max = Math.max(1e-9, roughMaxRelief(appearance));
    return clamp01(roughProfileOffsetAtPoint(px, py, appearance) / max);
  }
  const seed = Number(appearanceOrSeed) >>> 0,
    rowSeed = (seed ^ Math.imul(y | 0, 0x85ebca6b)) >>> 0;
  return hashUnit(rowSeed, x | 0);
}
