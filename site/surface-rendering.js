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

export function projectedPixelsPerUnit({
  distance = 1,
  viewportHeight = 1,
  fovDegrees = 34,
  pixelRatio = 1,
} = {}) {
  const safeDistance = Math.max(1e-9, Number(distance) || 1),
    height = Math.max(2, Number(viewportHeight) || 2),
    ratio = Math.max(0.25, Number(pixelRatio) || 1),
    fov = Math.max(1, Math.min(179, Number(fovDegrees) || 34)),
    halfFov = (fov * Math.PI) / 360;
  return (height * ratio) / (2 * safeDistance * Math.tan(halfFov));
}

export function roughSceneTriangleBudget({
  viewportWidth = 1,
  viewportHeight = 1,
  pixelRatio = 1,
  roiFraction = 1,
  hardCap = 900000,
} = {}) {
  const width = Math.max(2, Number(viewportWidth) || 2),
    height = Math.max(2, Number(viewportHeight) || 2),
    ratio = Math.max(0.25, Number(pixelRatio) || 1),
    pixels = width * height * ratio * ratio,
    roiBoost = 1 + 0.35 * (1 - Math.sqrt(clamp01(roiFraction))),
    cap = Math.max(24000, Math.floor(Number(hardCap) || 900000));
  return Math.min(cap, Math.max(24000, Math.floor(pixels * 0.22 * roiBoost)));
}

export function allocateRoughTriangleBudgets(requests, { totalBudget = 900000 } = {}) {
  const normalized = (requests || []).map((request, index) => {
      const base = Math.max(1, Math.floor(Number(request?.baseTriangles) || 1)),
        desired = Math.max(base, Math.floor(Number(request?.desiredTriangles) || base)),
        priority = Math.max(0.02, Math.min(1, Number(request?.priority) || 0.02));
      return { index, base, desired, priority, allocated: base };
    }),
    minimum = normalized.reduce((sum, item) => sum + item.base, 0),
    budget = Math.max(minimum, Math.floor(Number(totalBudget) || minimum));
  let remaining = Math.max(0, budget - minimum),
    active = normalized.filter((item) => item.desired > item.allocated);

  while (remaining > 0 && active.length) {
    const totalWeight = active.reduce(
        (sum, item) => sum + item.priority * Math.sqrt(item.desired - item.allocated),
        0,
      ),
      before = remaining;
    for (const item of active) {
      if (remaining <= 0) break;
      const need = item.desired - item.allocated,
        weight = item.priority * Math.sqrt(Math.max(1, need)),
        share =
          totalWeight > 0
            ? Math.max(1, Math.floor((before * weight) / totalWeight))
            : Math.max(1, Math.floor(before / active.length)),
        grant = Math.min(need, share, remaining);
      item.allocated += grant;
      remaining -= grant;
    }
    active = active.filter((item) => item.desired > item.allocated);
    if (remaining === before) break;
  }

  return normalized
    .sort((a, b) => a.index - b.index)
    .map((item) => item.allocated);
}

export function adaptiveRoughMeshLod({
  triangleCount = 1,
  maxEdge = 0,
  featureSize = 1,
  distance = 1,
  viewportWidth = 1,
  viewportHeight = 1,
  fovDegrees = 34,
  pixelRatio = 1,
  visibleFraction = 1,
  roiFraction = 1,
  screenPriority = 1,
  maxDepth = 10,
  triangleBudget = null,
} = {}) {
  const triangles = Math.max(1, Math.floor(Number(triangleCount) || 1)),
    edge = Math.max(0, Number(maxEdge) || 0),
    feature = Math.max(1e-9, Number(featureSize) || 1),
    width = Math.max(2, Number(viewportWidth) || 2),
    height = Math.max(2, Number(viewportHeight) || 2),
    ratio = Math.max(0.25, Number(pixelRatio) || 1),
    pxPerUnit = projectedPixelsPerUnit({
      distance,
      viewportHeight: height,
      fovDegrees,
      pixelRatio: ratio,
    }),
    featurePixels = feature * pxPerUnit,
    detail = roughLod(featurePixels),
    priority = Math.max(0.02, Math.min(1, Number(screenPriority) || 0)),
    samplesPerFeature = 1 + 3 * detail.detail,
    targetEdge = Math.max(
      feature / samplesPerFeature,
      1.75 / Math.max(1e-12, pxPerUnit * Math.sqrt(priority)),
    ),
    desiredDepth =
      edge > targetEdge ? Math.max(0, Math.ceil(Math.log2(edge / targetEdge))) : 0,
    occupancy = Math.sqrt(clamp01(visibleFraction)),
    roiFocus = 1 + 0.45 * (1 - Math.sqrt(clamp01(roiFraction))),
    viewportPixels = width * height * ratio * ratio,
    localMaxTriangles = Math.max(
      triangles,
      Math.min(
        900000,
        Math.max(
          12000,
          Math.floor(viewportPixels * (0.08 + 0.32 * occupancy) * roiFocus * priority),
        ),
      ),
    ),
    maxTriangles =
      triangleBudget == null
        ? localMaxTriangles
        : Math.max(triangles, Math.floor(Number(triangleBudget) || triangles)),
    budgetDepth = Math.max(
      0,
      Math.floor(Math.log(Math.max(1, maxTriangles / triangles)) / Math.log(4)),
    ),
    depthLimit = Math.max(0, Math.floor(Number(maxDepth) || 0)),
    cappedDesiredDepth = Math.min(desiredDepth, depthLimit),
    desiredTriangles = triangles * 4 ** cappedDesiredDepth,
    depth = Math.min(cappedDesiredDepth, budgetDepth);

  return {
    depth,
    detail: detail.detail,
    micro: detail.micro,
    featurePixels,
    pxPerUnit,
    targetEdge,
    maxTriangles,
    localMaxTriangles,
    desiredDepth: cappedDesiredDepth,
    desiredTriangles,
    estimatedTriangles: triangles * 4 ** depth,
    screenPriority: priority,
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
