import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUseGpuRoughPreview,
  canUseGpuRoughTask,
  decorateGpuRoughMaterial,
  gpuRoughAppearanceUniforms,
} from '../gpu-rough-surface.js';

const appearance = {
  kind: 'rough',
  morphology: 'pyramid',
  polarity: 'normal',
  featureSize: 0.8,
  meanHeight: 1.6,
  featureCv: 0.2,
  heightCv: 0.15,
  etchDepth: 2,
  seed: 0xfedcba98,
  sampleOrigin: [12.5, -7.25],
};

test('GPU rough uniforms preserve deterministic appearance identity', () => {
  const uniforms = gpuRoughAppearanceUniforms(appearance, {
    profileNormal: -1,
    normalStrength: 0.75,
  });

  assert.equal(uniforms.waferCadRoughFeatureSize.value, 0.8);
  assert.equal(uniforms.waferCadRoughMorphology.value, 1);
  assert.equal(uniforms.waferCadRoughPolarityNormal.value, 1);
  assert.equal(uniforms.waferCadRoughSeedLow.value, 0xba98);
  assert.equal(uniforms.waferCadRoughSeedHigh.value, 0xfedc);
  assert.equal(uniforms.waferCadRoughSampleOriginX.value, 12.5);
  assert.equal(uniforms.waferCadRoughSampleOriginY.value, -7.25);
  assert.equal(uniforms.waferCadRoughProfileNormal.value, -1);
  assert.equal(uniforms.waferCadRoughNormalStrength.value, 0.75);
});

test('GPU rough preview rejects non-rough or degenerate appearances', () => {
  assert.equal(canUseGpuRoughPreview(appearance), true);
  assert.equal(canUseGpuRoughPreview({ ...appearance, kind: 'smooth' }), false);
  assert.equal(canUseGpuRoughPreview({ ...appearance, featureSize: 0 }), false);
  assert.equal(
    canUseGpuRoughPreview({ ...appearance, etchDepth: 0, meanHeight: 0, amplitude: 0 }),
    false,
  );
});

test('GPU rough task eligibility falls back for buried, implant, and scaled-Z paths', () => {
  assert.equal(canUseGpuRoughTask({ appearance }), true);
  assert.equal(canUseGpuRoughTask({ appearance, buried: true }), false);
  assert.equal(canUseGpuRoughTask({ appearance, implant: true }), false);
  assert.equal(
    canUseGpuRoughTask({ appearance, zDisplay: { frontScale: 1.2, backScale: 1 } }),
    false,
  );
  assert.equal(
    canUseGpuRoughTask({ appearance, zDisplay: { frontScale: 1, backScale: 1 } }),
    true,
  );
});

test('GPU rough decorator chains existing material shader hooks', () => {
  let priorCompileCalls = 0;
  const material = {
    userData: {},
    onBeforeCompile(shader) {
      priorCompileCalls++;
      shader.fragmentShader += '\n// prior-hook';
    },
    customProgramCacheKey() {
      return 'existing';
    },
    needsUpdate: false,
  };
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader:
      '#include <common>\nvarying vec3 vViewPosition;\nvoid main() {\nvec3 normal = vec3(0.0,0.0,1.0);\n#include <normal_fragment_maps>\n}',
  };

  assert.equal(decorateGpuRoughMaterial(material, appearance), true);
  material.onBeforeCompile(shader, {});

  assert.equal(priorCompileCalls, 1);
  assert.equal(material.needsUpdate, true);
  assert.equal(material.userData.waferCadGpuRough.normalStrengthBase, 1);
  assert.match(material.customProgramCacheKey(), /wafercad-gpu-rough-v3/);
  assert.match(shader.vertexShader, /waferCadGpuDisplace/);
  assert.match(shader.vertexShader, /transformed\.z \+= waferCadRoughProfileNormal/);
  assert.match(shader.vertexShader, /vWaferCadRoughXY/);
  assert.match(shader.fragmentShader, /waferCadRoughProfile/);
  assert.match(shader.fragmentShader, /waferCadScreenDx/);
  assert.match(shader.fragmentShader, /waferCadHashBits/);
  assert.match(shader.fragmentShader, /prior-hook/);
  assert.equal(shader.uniforms.waferCadRoughFeatureSize.value, 0.8);
});
