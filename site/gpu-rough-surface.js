const GPU_ROUGH_PROGRAM_VERSION = 'wafercad-gpu-rough-v3';

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function gpuRoughAppearanceUniforms(
  appearance,
  { profileNormal = 1, normalStrength = 1 } = {},
) {
  const featureSize = finitePositive(appearance?.featureSize, 1),
    meanHeight = Math.max(
      0,
      Number(appearance?.meanHeight ?? appearance?.amplitude) || featureSize,
    ),
    etchDepth = finitePositive(appearance?.etchDepth, meanHeight),
    seed = Number(appearance?.seed) >>> 0,
    origin = Array.isArray(appearance?.sampleOrigin) ? appearance.sampleOrigin : [0, 0];

  return {
    waferCadRoughFeatureSize: { value: featureSize },
    waferCadRoughMeanHeight: { value: meanHeight },
    waferCadRoughFeatureCv: { value: clamp01(appearance?.featureCv) },
    waferCadRoughHeightCv: { value: clamp01(appearance?.heightCv) },
    waferCadRoughEtchDepth: { value: etchDepth },
    waferCadRoughSeedLow: { value: seed & 0xffff },
    waferCadRoughSeedHigh: { value: seed >>> 16 },
    waferCadRoughSampleOriginX: { value: Number(origin[0]) || 0 },
    waferCadRoughSampleOriginY: { value: Number(origin[1]) || 0 },
    waferCadRoughMorphology: { value: appearance?.morphology === 'pyramid' ? 1 : 0 },
    waferCadRoughPolarityNormal: { value: appearance?.polarity === 'normal' ? 1 : 0 },
    waferCadRoughProfileNormal: { value: Number(profileNormal) < 0 ? -1 : 1 },
    waferCadRoughNormalStrength: {
      value: Math.max(0, Math.min(2, Number(normalStrength) || 0)),
    },
  };
}

export function canUseGpuRoughPreview(appearance) {
  return Boolean(
    appearance?.kind === 'rough' &&
      finitePositive(appearance?.featureSize, 0) > 0 &&
      finitePositive(
        appearance?.etchDepth,
        Number(appearance?.meanHeight ?? appearance?.amplitude) || 0,
      ) > 0,
  );
}

export function canUseGpuRoughTask({
  appearance,
  buried = false,
  implant = false,
  zDisplay = null,
} = {}) {
  const frontScale = Number(zDisplay?.frontScale),
    backScale = Number(zDisplay?.backScale),
    scaleCompatible =
      (!Number.isFinite(frontScale) || Math.abs(frontScale - 1) <= 1e-12) &&
      (!Number.isFinite(backScale) || Math.abs(backScale - 1) <= 1e-12);
  return Boolean(
    !implant && !buried && scaleCompatible && canUseGpuRoughPreview(appearance)
  );
}

const ROUGH_PROFILE_GLSL = `
uniform float waferCadRoughFeatureSize;
uniform float waferCadRoughMeanHeight;
uniform float waferCadRoughFeatureCv;
uniform float waferCadRoughHeightCv;
uniform float waferCadRoughEtchDepth;
uniform float waferCadRoughSeedLow;
uniform float waferCadRoughSeedHigh;
uniform float waferCadRoughSampleOriginX;
uniform float waferCadRoughSampleOriginY;
uniform float waferCadRoughMorphology;
uniform float waferCadRoughPolarityNormal;
uniform float waferCadRoughProfileNormal;
uniform float waferCadRoughNormalStrength;

uint waferCadRoughSeed() {
  return uint(waferCadRoughSeedLow + 0.5) | (uint(waferCadRoughSeedHigh + 0.5) << 16u);
}

uint waferCadHashBits(uint seed, int index) {
  uint x = seed ^ (uint(index) * 0x9e3779b1u);
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float waferCadHashUnit(uint seed, int index) {
  return float(waferCadHashBits(seed, index)) / 4294967295.0;
}

float waferCadGaussianHash(uint seed, int x, int y, int channel) {
  uint seedA = seed ^ (uint(y + channel * 17) * 0x85ebca6bu);
  uint seedB = seed ^ (uint(y + channel * 29) * 0xc2b2ae35u);
  float a = max(1e-12, waferCadHashUnit(seedA, x));
  float b = waferCadHashUnit(seedB, x + channel * 13);
  return sqrt(-2.0 * log(a)) * cos(6.283185307179586 * b);
}

float waferCadGaussianNoise2D(vec2 point, float featureSize, uint seed, int channel) {
  float feature = max(1e-9, featureSize);
  vec2 grid = point / feature;
  ivec2 cell = ivec2(floor(grid));
  vec2 t = grid - vec2(cell);
  vec2 smoothT = t * t * (3.0 - 2.0 * t);
  float a0 = waferCadGaussianHash(seed, cell.x, cell.y, channel);
  float a1 = waferCadGaussianHash(seed, cell.x + 1, cell.y, channel);
  float b0 = waferCadGaussianHash(seed, cell.x, cell.y + 1, channel);
  float b1 = waferCadGaussianHash(seed, cell.x + 1, cell.y + 1, channel);
  float a = mix(a0, a1, smoothT.x);
  float b = mix(b0, b1, smoothT.x);
  return mix(a, b, smoothT.y) * 1.5;
}

float waferCadLognormalFactor(float cv, float z) {
  float value = clamp(cv, 0.0, 1.0);
  if (value <= 1e-12) return 1.0;
  float sigma = sqrt(log(1.0 + value * value));
  return exp(-0.5 * sigma * sigma + sigma * clamp(z, -3.5, 3.5));
}

float waferCadPyramidOffset(vec2 point, uint seed) {
  float feature = max(1e-9, waferCadRoughFeatureSize);
  float depth = waferCadRoughEtchDepth;
  float meanHeight = min(depth, max(0.0, waferCadRoughMeanHeight));

  if (waferCadRoughFeatureCv <= 1e-12 && waferCadRoughHeightCv <= 1e-12) {
    vec2 unit = point / feature;
    vec2 local = unit - floor(unit + 0.5);
    float tent = max(0.0, 1.0 - 2.0 * max(abs(local.x), abs(local.y)));
    float normalOffset = meanHeight * tent;
    return waferCadRoughPolarityNormal > 0.5 ? normalOffset : depth - normalOffset;
  }

  vec2 grid = point / feature;
  ivec2 centerCell = ivec2(floor(grid + 0.5));
  float jitterFraction = min(0.22, waferCadRoughFeatureCv * 0.28);
  float normalOffset = 0.0;

  for (int dy = -1; dy <= 1; ++dy) {
    for (int dx = -1; dx <= 1; ++dx) {
      int cellX = centerCell.x + dx;
      int cellY = centerCell.y + dy;
      float widthFactor = clamp(
        waferCadLognormalFactor(
          waferCadRoughFeatureCv,
          waferCadGaussianHash(seed ^ 0x51ed270bu, cellX, cellY, 1)
        ),
        0.45,
        1.8
      );
      float heightFactor = clamp(
        waferCadLognormalFactor(
          waferCadRoughHeightCv,
          waferCadGaussianHash(seed ^ 0x9e3779b9u, cellX, cellY, 2)
        ),
        0.35,
        1.9
      );
      float jitterX =
        (waferCadHashUnit(seed ^ (uint(cellY + 31) * 0x85ebca6bu), cellX + 17) * 2.0 - 1.0) *
        jitterFraction *
        feature;
      float jitterY =
        (waferCadHashUnit(seed ^ (uint(cellX + 47) * 0xc2b2ae35u), cellY + 23) * 2.0 - 1.0) *
        jitterFraction *
        feature;
      vec2 cellCenter = vec2(float(cellX) * feature + jitterX, float(cellY) * feature + jitterY);
      float halfWidth = max(feature * 0.12, feature * widthFactor * 0.5);
      vec2 normalized = abs(point - cellCenter) / halfWidth;
      float tent = max(0.0, 1.0 - max(normalized.x, normalized.y));
      float localHeight = min(depth, meanHeight * heightFactor);
      normalOffset = max(normalOffset, localHeight * tent);
    }
  }

  return waferCadRoughPolarityNormal > 0.5 ? normalOffset : depth - normalOffset;
}

float waferCadStochasticOffset(vec2 point, uint seed) {
  float meanFeature = max(1e-9, waferCadRoughFeatureSize);
  float meanHeight = max(0.0, waferCadRoughMeanHeight);
  float angle = (float(seed % 3600u) / 3600.0) * 6.283185307179586;
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotated = vec2(point.x * c + point.y * s, -point.x * s + point.y * c);
  float featureFactor = waferCadLognormalFactor(
    waferCadRoughFeatureCv,
    waferCadGaussianNoise2D(rotated, meanFeature * 4.0, seed ^ 0x51ed270bu, 1)
  );
  float localFeature = max(meanFeature * 0.2, meanFeature * featureFactor);
  float heightFactor = waferCadLognormalFactor(
    waferCadRoughHeightCv,
    waferCadGaussianNoise2D(rotated, localFeature, seed ^ 0x9e3779b9u, 2)
  );
  float relief = min(waferCadRoughEtchDepth, meanHeight * heightFactor);
  return waferCadRoughPolarityNormal > 0.5 ? waferCadRoughEtchDepth - relief : relief;
}

float waferCadRoughProfile(vec2 absolutePoint) {
  vec2 point =
    absolutePoint - vec2(waferCadRoughSampleOriginX, waferCadRoughSampleOriginY);
  uint seed = waferCadRoughSeed();
  return waferCadRoughMorphology > 0.5
    ? waferCadPyramidOffset(point, seed)
    : waferCadStochasticOffset(point, seed);
}
`;

function injectAfter(source, token, code) {
  return source.includes(token) ? source.replace(token, `${token}\n${code}`) : source;
}

export function decorateGpuRoughMaterial(
  material,
  appearance,
  { profileNormal = 1, normalStrength = 1 } = {},
) {
  if (!material || !canUseGpuRoughPreview(appearance)) return false;

  const uniforms = gpuRoughAppearanceUniforms(appearance, { profileNormal, normalStrength }),
    previousCompile = material.onBeforeCompile,
    previousProgramKey = material.customProgramCacheKey?.bind(material);

  material.userData ||= {};
  material.userData.waferCadGpuRough = {
    version: GPU_ROUGH_PROGRAM_VERSION,
    appearance: { ...appearance },
    normalStrengthBase: uniforms.waferCadRoughNormalStrength.value,
    uniforms,
  };

  material.customProgramCacheKey = () =>
    `${previousProgramKey ? previousProgramKey() : ''}|${GPU_ROUGH_PROGRAM_VERSION}`;

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <common>',
      `attribute float waferCadGpuDisplace;
varying vec2 vWaferCadRoughXY;
varying float vWaferCadGpuDisplace;
${ROUGH_PROFILE_GLSL}`,
    );
    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <begin_vertex>',
      `vWaferCadRoughXY = position.xy;
#ifdef USE_INSTANCING
  vWaferCadRoughXY += instanceMatrix[3].xy;
#endif
vWaferCadGpuDisplace = waferCadGpuDisplace;
if (waferCadGpuDisplace > 0.5) {
  transformed.z += waferCadRoughProfileNormal * waferCadRoughProfile(vWaferCadRoughXY);
}`,
    );

    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <common>',
      `varying vec2 vWaferCadRoughXY;
varying float vWaferCadGpuDisplace;
${ROUGH_PROFILE_GLSL}`,
    );
    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `if (vWaferCadGpuDisplace > 0.5 && waferCadRoughNormalStrength > 0.0) {
  float waferCadHeight = waferCadRoughProfile(vWaferCadRoughXY);
  float waferCadScreenDx = dFdx(waferCadHeight);
  float waferCadScreenDy = dFdy(waferCadHeight);
  vec3 waferCadSigmaX = dFdx(vViewPosition);
  vec3 waferCadSigmaY = dFdy(vViewPosition);
  vec2 waferCadStX = dFdx(vWaferCadRoughXY);
  vec2 waferCadStY = dFdy(vWaferCadRoughXY);
  float waferCadDet = waferCadStX.x * waferCadStY.y - waferCadStY.x * waferCadStX.y;
  if (abs(waferCadDet) > 1e-12) {
    vec2 waferCadGradient = vec2(
      (waferCadScreenDx * waferCadStY.y - waferCadScreenDy * waferCadStX.y) / waferCadDet,
      (-waferCadScreenDx * waferCadStY.x + waferCadScreenDy * waferCadStX.x) / waferCadDet
    );
    vec3 waferCadTangent =
      normalize((waferCadSigmaX * waferCadStY.y - waferCadSigmaY * waferCadStX.y) / waferCadDet);
    vec3 waferCadBitangent =
      normalize((-waferCadSigmaX * waferCadStY.x + waferCadSigmaY * waferCadStX.x) / waferCadDet);
    float waferCadSlope = waferCadRoughProfileNormal * waferCadRoughNormalStrength;
    normal = normalize(
      normal -
        waferCadSlope *
          (waferCadGradient.x * waferCadTangent + waferCadGradient.y * waferCadBitangent)
    );
  }
}`,
    );
  };

  material.needsUpdate = true;
  return true;
}
