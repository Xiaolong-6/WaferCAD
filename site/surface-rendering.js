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

// Statistical subpixel visibility is presentation-only. It avoids synthesizing
// unresolved peaks or increasing the physical rough-mesh triangle budget.
export function roughFarFieldContrast(featurePixels, appearance) {
  const feature = Number(appearance?.featureSize),
    height = Math.max(0, Number(appearance?.meanHeight ?? appearance?.amplitude) || 0),
    heightCv = clamp01(appearance?.heightCv);
  // A uniform stochastic heightfield and deterministic pyramid facets are
  // not stochastic texture: never add synthetic mottling to either.
  if (
    appearance?.kind !== 'rough' ||
    appearance?.morphology === 'pyramid' ||
    !(feature > 0) ||
    !(height > 0) ||
    !(heightCv > 0)
  )
    return 0;
  const slopeVariation = (height * heightCv) / feature,
    unresolved = 1 - smoothstep(0.75, 8, Math.max(0, Number(featurePixels) || 0));
  return 0.28 * (slopeVariation / (0.3 + slopeVariation)) * unresolved;
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

  return normalized.sort((a, b) => a.index - b.index).map((item) => item.allocated);
}

// A thin conformal film may share the exact seeded heightfield and XY
// triangulation of its substrate. Independent per-layer triangle budgets can
// otherwise create crossed *display* surfaces despite a valid physical film.
// Couple only identical XY meshes with identical morphology, never unrelated
// material caps; keep the aggregate allocation bounded by the input budget.
export function synchronizeConformalRoughLods(requests, allocations) {
  const groups = new Map();
  const sameZoneXY = (a, b) => {
    const left = a?.baseTriangles;
    const right = b?.baseTriangles;
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 2; k++) {
          if (left[i]?.[j]?.[k] !== right[i]?.[j]?.[k]) return false;
        }
      }
    }
    return true;
  };
  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];
    const cap = request?.cap;
    const appearance = cap?.appearance;
    if (appearance?.kind !== 'rough' || !request?.zone?.baseTriangles?.length) continue;
    const entries = Object.entries(appearance)
      .filter(([key]) => key !== 'displayRoughBlend')
      .sort(([a], [b]) => a.localeCompare(b));
    const profile = JSON.stringify(Object.fromEntries(entries));
    const zone = request.zone;
    const bounds = zone.bounds || {};
    const key = JSON.stringify([
      profile,
      cap.profileNormal ?? cap.normal,
      zone.baseTriangles.length,
      bounds.minX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
    ]);
    if (!groups.has(key)) groups.set(key, []);
    const alternatives = groups.get(key);
    const match = (candidate) => sameZoneXY(requests[candidate[0]].zone, zone);
    let group = alternatives.find(match);
    if (!group) {
      group = [];
      alternatives.push(group);
    }
    group.push(index);
  }
  let pairedZones = 0;
  for (const alternatives of groups.values()) {
    for (const group of alternatives) {
      if (group.length < 2) continue;
      // One cap appearing twice at the same physical plane is not a film.
      if (new Set(group.map((index) => requests[index].cap.z)).size < 2) continue;
      const totalBudget = group.reduce((sum, index) => sum + allocations[index], 0);
      const budget = Math.floor(totalBudget / group.length);
      const contexts = group.map((index) => requests[index].zone.lodContext || {});
      const context = {
        ...contexts[0],
        distance: Math.min(...contexts.map((item) => item.distance ?? Infinity)),
        roughnessDetail: Math.max(...contexts.map((item) => item.roughnessDetail ?? 1)),
        screenPriority: Math.max(...contexts.map((item) => item.screenPriority ?? 1)),
        visibleFraction: Math.max(...contexts.map((item) => item.visibleFraction ?? 1)),
        maxDepth: Math.max(...contexts.map((item) => item.maxDepth ?? 0)),
      };
      for (const index of group) {
        const zone = requests[index].zone;
        zone.triangleBudget = Math.max(zone.baseTriangles.length, budget);
        zone.lodContext = { ...context };
      }
      pairedZones += group.length;
    }
  }
  return pairedZones;
}

export function adaptiveRoughMeshLod({
  triangleCount = 1,
  maxEdge = 0,
  featureSize = 1,
  morphology = 'stochastic',
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
  roughnessDetail = 1,
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
    renderingDetail = Math.max(0.01, Math.min(1, Number(roughnessDetail) || 0.01)),
    // The stable field can converge at resolved scales. Request finer samples
    // there while retaining the same screen-space and scene-budget bounds.
    resolvedSamples = morphology === 'stochastic-v2' ? 16 : 4,
    samplesPerFeature = 1 + (resolvedSamples - 1) * detail.detail * renderingDetail,
    targetEdge = Math.max(
      feature / samplesPerFeature,
      1.75 / Math.max(1e-12, pxPerUnit * Math.sqrt(priority * renderingDetail)),
    ),
    desiredDepth = edge > targetEdge ? Math.max(0, Math.ceil(Math.log2(edge / targetEdge))) : 0,
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

function pyramidProfileOffsetAtPoint(x, y, appearance) {
  const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
    depth = roughMaxRelief(appearance),
    meanHeight = Math.min(
      depth,
      Math.max(0, Number(appearance?.meanHeight ?? appearance?.amplitude) || feature),
    ),
    featureCv = Math.max(0, Math.min(1, Number(appearance?.featureCv) || 0)),
    heightCv = Math.max(0, Math.min(1, Number(appearance?.heightCv) || 0));

  // Preserve the original perfectly periodic profile for legacy projects and
  // for users who explicitly choose zero variation.
  if (featureCv <= 1e-12 && heightCv <= 1e-12) {
    const wrap = (value) => {
        const unit = Number(value) / feature;
        return unit - Math.floor(unit + 0.5);
      },
      localX = wrap(x),
      localY = wrap(y),
      tent = Math.max(0, 1 - 2 * Math.max(Math.abs(localX), Math.abs(localY))),
      normalOffset = meanHeight * tent,
      offset = appearance?.polarity === 'normal' ? normalOffset : depth - normalOffset;
    return Object.is(offset, -0) ? 0 : offset;
  }

  // Random KOH-style reconstruction: keep a stable mean cell pitch so the
  // height field remains deterministic, then vary each pyramid's center, base
  // width and height from hashed cell coordinates. Taking the upper envelope
  // of nearby square pyramids avoids discontinuities at nominal cell borders.
  const seed = Number(appearance?.seed) >>> 0,
    gx = Number(x) / feature,
    gy = Number(y) / feature,
    ix = Math.round(gx),
    iy = Math.round(gy),
    jitterFraction = Math.min(0.22, featureCv * 0.28);
  let normalOffset = 0;

  // With widthFactor <= 1.8 and center jitter <= 0.22 pitch, a pyramid
  // cannot reach across more than one neighboring mean cell. A 3×3 search is
  // therefore complete and avoids multiplying every height sample by 25.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cxIndex = ix + dx,
        cyIndex = iy + dy,
        widthFactor = Math.max(
          0.45,
          Math.min(
            1.8,
            lognormalFactor(
              featureCv,
              gaussianHash((seed ^ 0x51ed270b) >>> 0, cxIndex, cyIndex, 1),
            ),
          ),
        ),
        heightFactor = Math.max(
          0.35,
          Math.min(
            1.9,
            lognormalFactor(heightCv, gaussianHash((seed ^ 0x9e3779b9) >>> 0, cxIndex, cyIndex, 2)),
          ),
        ),
        jitterX =
          (hashUnit((seed ^ Math.imul(cyIndex + 31, 0x85ebca6b)) >>> 0, cxIndex + 17) * 2 - 1) *
          jitterFraction *
          feature,
        jitterY =
          (hashUnit((seed ^ Math.imul(cxIndex + 47, 0xc2b2ae35)) >>> 0, cyIndex + 23) * 2 - 1) *
          jitterFraction *
          feature,
        centerX = cxIndex * feature + jitterX,
        centerY = cyIndex * feature + jitterY,
        halfWidth = Math.max(feature * 0.12, (feature * widthFactor) / 2),
        nx = Math.abs(Number(x) - centerX) / halfWidth,
        ny = Math.abs(Number(y) - centerY) / halfWidth,
        tent = Math.max(0, 1 - Math.max(nx, ny)),
        localHeight = Math.min(depth, meanHeight * heightFactor);
      normalOffset = Math.max(normalOffset, localHeight * tent);
    }
  }

  const offset = appearance?.polarity === 'normal' ? normalOffset : depth - normalOffset;
  return Object.is(offset, -0) ? 0 : offset;
}

export function roughProfileOffsetAtPoint(x, y, appearance) {
  x -= appearance?.sampleOrigin?.[0] || 0;
  y -= appearance?.sampleOrigin?.[1] || 0;
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
    stableScale = appearance?.morphology === 'stochastic-v2';
  // The legacy field divides absolute coordinates by a varying local pitch.
  // Its derivative grows with distance from the origin. The explicit v2 field
  // instead warps a fixed-pitch lattice by at most 1/4 pitch per axis. Feature
  // CV controls this bounded, coarse displacement; it is not an exact measured
  // correlation-length distribution. Never substitute this field for saved v1.
  let heightNoise;
  if (stableScale) {
    const warp = (channel) =>
      meanFeature *
      0.25 *
      featureCv *
      Math.max(
        -1,
        Math.min(1, gaussianNoise2D(rx, ry, meanFeature * 4, (seed ^ 0x51ed270b) >>> 0, channel)),
      );
    heightNoise = gaussianNoise2D(
      rx + warp(1),
      ry + warp(3),
      meanFeature,
      (seed ^ 0x9e3779b9) >>> 0,
      2,
    );
  } else {
    const featureFactor = lognormalFactor(
        featureCv,
        gaussianNoise2D(rx, ry, meanFeature * 4, (seed ^ 0x51ed270b) >>> 0, 1),
      ),
      localFeature = Math.max(meanFeature * 0.2, meanFeature * featureFactor);
    heightNoise = gaussianNoise2D(rx, ry, localFeature, (seed ^ 0x9e3779b9) >>> 0, 2);
  }
  const heightFactor = lognormalFactor(heightCv, heightNoise),
    relief = Math.min(roughMaxRelief(appearance), meanHeight * heightFactor),
    polarity = appearance?.polarity === 'normal' ? 'normal' : 'inverted',
    offset = polarity === 'normal' ? roughMaxRelief(appearance) - relief : relief;
  return Object.is(offset, -0) ? 0 : offset;
}

// Sample the *physical* seeded heightfield on the Section screen lattice.
// This is deliberately independent of the 3D mesh-LOD display attenuation:
// a Section pixel and a 3D triangle do not generally resolve the same area.
// Expose the common operator so cross-view audits can compare matched physical
// points and measure the aliasing, instead of mistaking it for a Z-scale error.
export function roughProfileOffsetAtPixelFootprint(
  x,
  y,
  appearance,
  { pixelsPerUm = 1, unitX = 1, unitY = 0 } = {},
) {
  const density = Number(pixelsPerUm),
    feature = Number(appearance?.featureSize);
  if (!(density > 0) || !Number.isFinite(density) || !(feature > 0) || feature * density >= 2) {
    return roughProfileOffsetAtPoint(x, y, appearance);
  }
  const halfPixelPhysical = 0.5 / Math.max(density, 1e-12);
  let sum = 0;
  for (const offset of [-1, -0.5, 0, 0.5, 1]) {
    sum += roughProfileOffsetAtPoint(
      x + unitX * halfPixelPhysical * offset,
      y + unitY * halfPixelPhysical * offset,
      appearance,
    );
  }
  return sum / 5;
}

// These overrides affect displayed geometry only, never the canonical profile.
export function roughDisplayHeightBlend(featureSize, samplePitch) {
  const feature = Number(featureSize),
    pitch = Number(samplePitch);
  if (!(feature > 0) || !(pitch > 0) || !Number.isFinite(feature + pitch)) return 1;
  return 0.12 + 0.88 * smoothstep(0.25, 1, feature / pitch);
}

// Estimate XY resolution per cap, not from the ROI area or a sum of triangles
// across material layers. Repeated conformal caps do not add spatial samples.
// A shared seeded field uses its coarsest cap pitch so thin interfaces and
// their borders retain the same display displacement, including CPU fallback.
export function roughTaskDisplaySampling(tasks) {
  const fields = new Map();
  const sampling = tasks.map((task) => {
    const appearance = task.cap.appearance;
    const key = JSON.stringify(
      Object.fromEntries(
        Object.entries(appearance || {})
          .filter(([name]) => name !== 'displayRoughBlend')
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    let area = 0;
    let triangles = 0;
    for (const zone of task.zones || []) {
      for (const [a, b, c] of zone.baseTriangles || []) {
        area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      }
      triangles += adaptiveRoughMeshLod({
        triangleCount: zone.baseTriangles.length,
        maxEdge: zone.maxEdge,
        featureSize: appearance?.featureSize,
        morphology: appearance?.morphology,
        ...zone.lodContext,
        triangleBudget: zone.triangleBudget,
      }).estimatedTriangles;
    }
    const pitch = area > 0 && triangles > 0 ? Math.sqrt((2 * area) / triangles) : 0;
    fields.set(key, Math.max(fields.get(key) || 0, pitch));
    return key;
  });
  return sampling.map((key) => ({ pitch: fields.get(key) }));
}

// A whole seeded-field cohort may surrender one Quality subdivision level
// only when all its CPU rough caps (including coating and implant overlays)
// have reached the minimum display-height blend. Strictly presentation-only:
// keep stored morphology, Section geometry, GPU and array paths unchanged.
export function trimSaturatedRoughLodBudgets(tasks) {
  if (!tasks?.length) return false;
  const before = roughTaskDisplaySampling(tasks);
  const localBefore = tasks.map((task) => roughTaskDisplaySampling([task])[0]);
  const blend = (task, sample) => {
    const profile = task.cap?.appearance;
    return profile?.kind === 'rough' && ['stochastic', 'stochastic-v2'].includes(profile.morphology)
      ? roughDisplayHeightBlend(profile.featureSize, sample.pitch)
      : 1;
  };
  // Co-registered caps (including implant overlays and conformal coatings)
  // must not be re-tessellated at different rates. Only optimize a *whole*
  // seeded heightfield cohort if every cap is unresolved and CPU-based.
  const cohorts = new Map();
  tasks.forEach((task, i) => {
    const appearance = task.cap?.appearance;
    const key = JSON.stringify(
      Object.fromEntries(
        Object.entries(appearance || {})
          .filter(([name]) => name !== 'displayRoughBlend')
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(i);
  });
  const eligible = new Set();
  for (const indices of cohorts.values()) {
    if (
      indices.every((i) => {
        const task = tasks[i];
        return (
          !task.gpuDisplacement &&
          !task.cap?.instanceTranslations?.length &&
          !task.implant?.instanceTranslations?.length &&
          Math.abs(blend(task, before[i]) - 0.12) <= 1e-12 &&
          Math.abs(blend(task, localBefore[i]) - 0.12) <= 1e-12
        );
      })
    )
      indices.forEach((i) => eligible.add(i));
  }
  const old = tasks.map((task) => (task.zones || []).map((zone) => zone.triangleBudget));
  let changed = false;
  tasks.forEach((task, i) => {
    if (!eligible.has(i)) return;
    for (const zone of task.zones || []) {
      const budget = Number(zone.triangleBudget);
      if (!(budget > zone.baseTriangles.length)) continue;
      zone.triangleBudget = Math.max(zone.baseTriangles.length, Math.floor(budget / 4));
      changed ||= zone.triangleBudget !== budget;
    }
  });
  if (!changed) return false;
  const after = roughTaskDisplaySampling(tasks);
  const localAfter = tasks.map((task) => roughTaskDisplaySampling([task])[0]);
  if (
    tasks.some(
      (task, i) =>
        Math.abs(blend(task, after[i]) - blend(task, before[i])) > 1e-12 ||
        Math.abs(blend(task, localAfter[i]) - blend(task, localBefore[i])) > 1e-12,
    )
  ) {
    tasks.forEach((task, i) =>
      (task.zones || []).forEach((zone, j) => {
        zone.triangleBudget = old[i][j];
      }),
    );
    return false;
  }
  return true;
}

// Display-only, area-integrated reconstruction for legacy high-frequency Rough.
// Physical profile, GLB, Seed and process geometry are never changed.
export function roughInspectionLatticePitch(appearance, pixelsPerUm) {
  if (
    appearance?.morphology !== 'stochastic' ||
    !(Number(appearance.featureCv) > 0) ||
    !(Number(appearance.featureSize) > 0) ||
    !(Number(pixelsPerUm) > 0)
  )
    return 0;
  const feature = Number(appearance.featureSize);
  const dx = Number(appearance.sampleOrigin?.[0]) || 0;
  const dy = Number(appearance.sampleOrigin?.[1]) || 0;
  const centre = appearance.displayInspectionCentre || [0, 0];
  const radial = Math.hypot(centre[0] - dx, centre[1] - dy);
  if ((radial * Number(appearance.featureCv)) / feature < 256) return 0;
  const minimumPitch = feature * 8;
  const resolutionPitch = 27.5 / Number(pixelsPerUm);
  const octaves = Math.max(0, Math.ceil(Math.log2(Math.max(1, resolutionPitch / minimumPitch))));
  return minimumPitch * 2 ** Math.min(16, octaves);
}

const roughInspectionNodeCaches = new Map();
function roughInspectionNode(appearance, pitch, xi, yi) {
  const key = JSON.stringify([
    appearance.profileId,
    appearance.seed,
    appearance.polarity,
    appearance.featureSize,
    appearance.featureCv,
    appearance.meanHeight,
    appearance.amplitude,
    appearance.heightCv,
    appearance.etchDepth,
    appearance.sampleOrigin,
    pitch,
  ]);
  let nodes = roughInspectionNodeCaches.get(key);
  if (!nodes) {
    if (roughInspectionNodeCaches.size >= 8)
      roughInspectionNodeCaches.delete(roughInspectionNodeCaches.keys().next().value);
    nodes = new Map();
    roughInspectionNodeCaches.set(key, nodes);
  }
  const cell = String(xi) + ',' + String(yi);
  if (nodes.has(cell)) return nodes.get(cell);
  const x = (Number(appearance.sampleOrigin?.[0]) || 0) + xi * pitch;
  const y = (Number(appearance.sampleOrigin?.[1]) || 0) + yi * pitch;
  // Integrate physical heights over area; do not promote isolated noise spikes
  // into artificially wide peaks by sampling a single high-frequency point.
  let sum = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      sum += roughProfileOffsetAtPoint(
        x + ((i + 0.5) / 4 - 0.5) * pitch,
        y + ((j + 0.5) / 4 - 0.5) * pitch,
        appearance,
      );
    }
  }
  const value = sum / 16;
  if (nodes.size >= 16384) nodes.clear();
  nodes.set(cell, value);
  return value;
}

export function roughInspectionBandlimitedOffsetAtPoint(x, y, appearance, pitch) {
  if (!(pitch > 0) || !Number.isFinite(pitch)) return roughProfileOffsetAtPoint(x, y, appearance);
  const gx = (x - (Number(appearance?.sampleOrigin?.[0]) || 0)) / pitch;
  const gy = (y - (Number(appearance?.sampleOrigin?.[1]) || 0)) / pitch;
  const ix = Math.floor(gx),
    iy = Math.floor(gy);
  const smooth = (t) => t * t * (3 - 2 * t);
  const tx = smooth(gx - ix),
    ty = smooth(gy - iy);
  const a = roughInspectionNode(appearance, pitch, ix, iy);
  const b = roughInspectionNode(appearance, pitch, ix + 1, iy);
  const c = roughInspectionNode(appearance, pitch, ix, iy + 1);
  const d = roughInspectionNode(appearance, pitch, ix + 1, iy + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function roughDisplayProfileOffsetAtPoint(x, y, appearance) {
  const pitch = Number(appearance?.displayLatticePitchUm);
  const original =
      pitch > 0 && appearance?.morphology === 'stochastic'
        ? roughInspectionBandlimitedOffsetAtPoint(x, y, appearance, pitch)
        : roughProfileOffsetAtPoint(x, y, appearance),
    weight = Number(appearance?.displayRoughBlend);
  if (!Number.isFinite(weight) || weight >= 1) return original;
  const fraction = Math.max(0, Math.min(1, weight)),
    depth = roughMaxRelief(appearance),
    mean = Math.min(depth, Math.max(0, Number(appearance?.meanHeight) || 0)),
    center = appearance?.polarity === 'normal' ? depth - mean : mean;
  return center + fraction * (original - center);
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
