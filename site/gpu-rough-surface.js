import { roughDisplayProfileOffsetAtPoint } from './surface-rendering.js';

const GPU_ROUGH_PROGRAM_VERSION = 'wafercad-gpu-rough-v8';
const gpuHeightParityCache = new WeakMap();

// The existing physical vertex-height contract, in micrometres. Renderer-name
// detection alone cannot qualify a shader at arbitrary wafer coordinates.
const GPU_HEIGHT_TOLERANCE_UM = 2e-5;

export function gpuRoughParitySamples(zones) {
  const groups = (zones || []).filter((zone) => zone.baseTriangles?.length);
  const total = groups.reduce((sum, zone) => sum + zone.baseTriangles.length, 0);
  if (!total) return [];
  const points = new Map();
  const count = Math.min(16, total);
  let groupIndex = 0,
    first = 0;
  for (let index = 0; index < count; index++) {
    const ordinal = Math.floor((index * (total - 1)) / Math.max(1, count - 1));
    while (ordinal >= first + groups[groupIndex].baseTriangles.length) {
      first += groups[groupIndex++].baseTriangles.length;
    }
    const triangle = groups[groupIndex].baseTriangles[ordinal - first];
    // Include corners pinned by the CPU and nonvertex interior points. The
    // shader receives Float32 XY, exactly as the production vertex buffer does.
    for (const weights of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.23, 0.31, 0.46],
    ]) {
      const point = [0, 1].map((axis) =>
        Math.fround(triangle.reduce((sum, vertex, i) => sum + vertex[axis] * weights[i], 0)),
      );
      points.set(point.join(','), point);
    }
  }
  return [...points.values()];
}

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
    waferCadRoughVisualBlend: {
      value: Number.isFinite(Number(appearance?.displayRoughBlend))
        ? clamp01(appearance.displayRoughBlend)
        : 1,
    },
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
    waferCadRoughFarFieldContrast: { value: 0 },
    waferCadRoughFarFieldFeatureSize: { value: featureSize },
    waferCadRoughFarFieldSeed: { value: seed & 0xffff },
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

// WebGL2 highp float does not guarantee the same transcendental accuracy
// across hardware and software backends. SwiftShader has exceeded the
// 2e-5 um physical-height parity contract on this profile. Use the existing
// deterministic CPU mesh on known software rasterizers instead of relying on
// approximate per-vertex GLSL displacement. Do not disable WebGL itself.
export function supportsPreciseGpuRoughDisplacement(renderer) {
  const gl = renderer?.getContext?.();
  if (!gl) return true;
  const debug = gl.getExtension?.('WEBGL_debug_renderer_info');
  const name = String(
    (debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '',
  );
  return !/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name);
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
      !zDisplay?.reliefActive &&
      (!Number.isFinite(frontScale) || Math.abs(frontScale - 1) <= 1e-12) &&
      (!Number.isFinite(backScale) || Math.abs(backScale - 1) <= 1e-12);
  return Boolean(!implant && !buried && scaleCompatible && canUseGpuRoughPreview(appearance));
}

const ROUGH_PROFILE_GLSL = `
uniform float waferCadRoughFeatureSize;
uniform float waferCadRoughMeanHeight;
uniform float waferCadRoughVisualBlend;
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
  float raw = waferCadRoughMorphology > 0.5
    ? waferCadPyramidOffset(point, seed)
    : waferCadStochasticOffset(point, seed);
  float mean = min(waferCadRoughEtchDepth, max(0.0, waferCadRoughMeanHeight));
  float center =
    waferCadRoughPolarityNormal > 0.5 ? waferCadRoughEtchDepth - mean : mean;
  return mix(center, raw, waferCadRoughVisualBlend);
}
`;

// Execute the production height shader at the task's own physical coordinates.
// This is a bounded qualification probe, not a proof of unsampled mesh-interior
// accuracy. A failed/unavailable probe selects the deterministic CPU mesh.
export function checkGpuRoughHeightParity(THREE, renderer, appearance, points) {
  if (!canUseGpuRoughPreview(appearance) || !points?.length) {
    return { eligible: false, reason: 'missing-profile-samples', samples: 0 };
  }
  let cache = gpuHeightParityCache.get(renderer);
  if (!cache) {
    cache = new Map();
    gpuHeightParityCache.set(renderer, cache);
  }
  const key = JSON.stringify([appearance, points]);
  if (cache.has(key)) return cache.get(key);

  let result = { eligible: false, reason: 'float-readback-unavailable', samples: points.length };
  if (renderer.extensions.has('EXT_color_buffer_float')) {
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousLevel = renderer.getActiveMipmapLevel();
    let target, geometry, material;
    try {
      target = new THREE.WebGLRenderTarget(points.length, 1, {
        type: THREE.FloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
      });
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          points.flatMap(([x, y]) => [x, y, 0]),
          3,
        ),
      );
      material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          ...gpuRoughAppearanceUniforms(appearance),
          sampleCount: { value: points.length },
        },
        vertexShader: `precision highp float;
precision highp int;
in vec3 position;
uniform float sampleCount;
flat out float sampleHeight;
${ROUGH_PROFILE_GLSL}
void main() {
  sampleHeight = waferCadRoughProfile(position.xy);
  gl_Position = vec4((float(gl_VertexID) + 0.5) * 2.0 / sampleCount - 1.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`,
        fragmentShader: `precision highp float;
precision highp int;
flat in float sampleHeight;
out vec4 outColor;
void main() { outColor = vec4(sampleHeight, 0.0, 0.0, 1.0); }`,
      });
      const mesh = new THREE.Points(geometry, material);
      mesh.frustumCulled = false;
      const scene = new THREE.Scene();
      scene.add(mesh);
      renderer.setRenderTarget(target);
      renderer.render(scene, new THREE.Camera());
      const pixels = new Float32Array(points.length * 4);
      renderer.readRenderTargetPixels(target, 0, 0, points.length, 1, pixels);
      let maximumErrorUm = 0;
      let squared = 0;
      let complete = true;
      points.forEach(([x, y], index) => {
        const actual = pixels[index * 4];
        const expected = roughDisplayProfileOffsetAtPoint(
          Math.fround(x),
          Math.fround(y),
          appearance,
        );
        complete &&= pixels[index * 4 + 3] === 1 && Number.isFinite(actual);
        const error = Math.abs(actual - expected);
        maximumErrorUm = Math.max(maximumErrorUm, error);
        squared += error * error;
      });
      const eligible = complete && maximumErrorUm < GPU_HEIGHT_TOLERANCE_UM;
      result = {
        eligible,
        reason: eligible ? 'sampled-height-parity' : 'height-parity-failed',
        samples: points.length,
        maximumErrorUm,
        rmsErrorUm: Math.sqrt(squared / points.length),
      };
    } catch {
      result = { eligible: false, reason: 'height-probe-failed', samples: points.length };
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      target?.dispose();
      geometry?.dispose();
      material?.dispose();
    }
  }
  // Camera/ROI changes may produce new keys. Bound retained diagnostics; no
  // probe textures, programs or canonical model objects are retained here.
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

// The display texture is derived from spatially coherent noise at a scale
// selected from the pixel footprint. It never displaces physical geometry.
const ROUGH_FAR_FIELD_GLSL = `
uniform float waferCadRoughFarFieldContrast;
uniform float waferCadRoughFarFieldFeatureSize;
uniform float waferCadRoughFarFieldSeed;

float waferCadFarHash(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * 0.1031 + waferCadRoughFarFieldSeed * 0.00017);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float waferCadFarValueNoise(vec2 location) {
  vec2 cell = floor(location);
  vec2 blend = fract(location);
  blend = blend * blend * (3.0 - 2.0 * blend);
  float lower = mix(
    waferCadFarHash(cell),
    waferCadFarHash(cell + vec2(1.0, 0.0)),
    blend.x
  );
  float upper = mix(
    waferCadFarHash(cell + vec2(0.0, 1.0)),
    waferCadFarHash(cell + vec2(1.0, 1.0)),
    blend.x
  );
  return mix(lower, upper, blend.y);
}

float waferCadFarFieldShade(vec2 xy) {
  if (waferCadRoughFarFieldContrast <= 0.0) return 1.0;
  // A grazing view compresses one world axis much more than the other.
  // Isotropic max(length(dFdx), length(dFdy)) erases detail along BOTH axes.
  // Filter independently to keep resolved horizontal texture without shimmer.
  vec2 footprint = max(abs(dFdx(xy)), abs(dFdy(xy)));
  float featurePixels = waferCadRoughFarFieldFeatureSize /
    max(1e-9, max(footprint.x, footprint.y));
  float unresolved = 1.0 - smoothstep(0.75, 8.0, featurePixels);
  if (unresolved <= 0.0) return 1.0;
  vec2 displayCell = max(
    vec2(max(1e-6, waferCadRoughFarFieldFeatureSize) * 8.0),
    footprint * 5.0
  );
  float visual = waferCadFarValueNoise(xy / displayCell);
  // Balanced highlights and shadows preserve the underlying material tint.
  // This is display-only shading: no mesh, Z or canonical roughness changes.
  float shade = 1.0 + 2.5 * waferCadRoughFarFieldContrast *
    unresolved * (2.0 * visual - 1.0);
  return clamp(shade, 0.65, 1.35);
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
  material.userData.waferCadRoughFarField = { uniforms };

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
varying float vWaferCadRoughSurface;
${ROUGH_PROFILE_GLSL}`,
    );
    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <begin_vertex>',
      `// Compact arrays define rough morphology in the template-local physical frame.
vWaferCadRoughXY = position.xy;
// Cap vertices use 0 (CPU-pinned) or 1 (GPU); closures use -1.
// This shading domain stays constant within every triangle.
vWaferCadRoughSurface = step(0.0, waferCadGpuDisplace);
if (waferCadGpuDisplace > 0.5) {
  transformed.z += waferCadRoughProfileNormal * waferCadRoughProfile(vWaferCadRoughXY);
}`,
    );

    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <common>',
      `varying vec2 vWaferCadRoughXY;
varying float vWaferCadRoughSurface;
${ROUGH_PROFILE_GLSL}
${ROUGH_FAR_FIELD_GLSL}`,
    );
    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <color_fragment>',
      'diffuseColor.rgb *= mix(1.0, waferCadFarFieldShade(vWaferCadRoughXY), step(0.5, vWaferCadRoughSurface));',
    );
    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `if (vWaferCadRoughSurface > 0.5 && waferCadRoughNormalStrength > 0.0) {
  // Unresolved subpixel profile gradients must not fake mesh-height cracks.
  // Leave the vertex displacement and section geometry untouched.
  float waferCadFootprint = max(
    length(dFdx(vWaferCadRoughXY)), length(dFdy(vWaferCadRoughXY))
  );
  float waferCadFeaturePixels = waferCadRoughFeatureSize / max(1e-9, waferCadFootprint);
  float waferCadMicroNormalWeight = smoothstep(1.5, 3.0, waferCadFeaturePixels);
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
    float waferCadSlope =
      waferCadRoughProfileNormal * waferCadRoughNormalStrength * waferCadMicroNormalWeight;
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

// Software-WebGL and Z-scaled CPU meshes can use the same constant-time
// subpixel visibility response without requiring GPU vertex displacement.
export function decorateRoughFarFieldMaterial(material, appearance) {
  if (!material || !canUseGpuRoughPreview(appearance)) return false;
  const uniforms = {
      waferCadRoughFarFieldContrast: { value: 0 },
      waferCadRoughFarFieldFeatureSize: { value: finitePositive(appearance?.featureSize, 1) },
      waferCadRoughFarFieldSeed: { value: (Number(appearance?.seed) >>> 0) & 0xffff },
    },
    previousCompile = material.onBeforeCompile,
    previousProgramKey = material.customProgramCacheKey?.bind(material);
  material.userData ||= {};
  material.userData.waferCadRoughFarField = { uniforms };
  material.customProgramCacheKey = () =>
    `${previousProgramKey ? previousProgramKey() : ''}|wafercad-rough-farfield-v2`;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <common>',
      'varying vec2 vWaferCadFarXY;\nvarying float vWaferCadFarTop;',
    );
    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <begin_vertex>',
      'vWaferCadFarXY = position.xy;\nvWaferCadFarTop = smoothstep(0.25, 0.85, abs(normal.z));',
    );
    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <common>',
      `varying vec2 vWaferCadFarXY;\nvarying float vWaferCadFarTop;\n${ROUGH_FAR_FIELD_GLSL}`,
    );
    shader.fragmentShader = injectAfter(
      shader.fragmentShader,
      '#include <color_fragment>',
      'diffuseColor.rgb *= mix(1.0, waferCadFarFieldShade(vWaferCadFarXY), vWaferCadFarTop);',
    );
  };
  material.needsUpdate = true;
  return true;
}

// Wire/outline variant: the same vertex displacement as the rough cap, without
// the fragment-normal shader (LineBasicMaterial has no normal_fragment_maps).
export function decorateGpuRoughLineMaterial(material, appearance, { profileNormal = 1 } = {}) {
  if (!material || !canUseGpuRoughPreview(appearance)) return false;
  const uniforms = gpuRoughAppearanceUniforms(appearance, { profileNormal }),
    previousCompile = material.onBeforeCompile,
    previousProgramKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () =>
    `${previousProgramKey ? previousProgramKey() : ''}|wafercad-gpu-rough-line-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(shader.vertexShader, '#include <common>', ROUGH_PROFILE_GLSL);
    shader.vertexShader = injectAfter(
      shader.vertexShader,
      '#include <begin_vertex>',
      'transformed.z += waferCadRoughProfileNormal * waferCadRoughProfile(position.xy);',
    );
  };
  material.needsUpdate = true;
  return true;
}
