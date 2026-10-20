import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  canUseGpuRoughPreview,
  canUseGpuRoughTask,
  checkGpuRoughHeightParity,
  decorateGpuRoughMaterial,
  decorateRoughFarFieldMaterial,
  decorateGpuRoughLineMaterial,
  gpuRoughAppearanceUniforms,
  gpuRoughParitySamples,
  supportsPreciseGpuRoughDisplacement,
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

test('GPU qualification samples physical cap corners and interiors across zones within a fixed budget', () => {
  const triangle = (x) => [
    [x, -1, 0],
    [x + 0.3, -1, 0],
    [x, 1, 0],
  ];
  const zones = [
    { baseTriangles: [] },
    { baseTriangles: Array.from({ length: 33 }, (_, i) => triangle(2492 + i / 10)) },
    { baseTriangles: [triangle(-3000)] },
  ];
  const before = JSON.stringify(zones);
  const points = gpuRoughParitySamples(zones);
  assert.ok(points.length > 16 && points.length <= 64);
  assert.ok(points.some(([x]) => x === 2492));
  assert.ok(points.some(([x]) => x === -3000));
  assert.ok(
    points.some(([, y]) => y !== -1 && y !== 1),
    'Test cap interiors, not just corners',
  );
  assert.ok(points.every((point) => point.every((value) => value === Math.fround(value))));
  assert.deepEqual(gpuRoughParitySamples(zones), points);
  assert.deepEqual(gpuRoughParitySamples([]), []);
  assert.equal(JSON.stringify(zones), before, 'Never modify physical mesh input');
});

test('GPU height qualification rejects inaccurate or missing readback and restores renderer state', async () => {
  const THREE = await import('three');
  const { roughDisplayProfileOffsetAtPoint } = await import('../surface-rendering.js');
  const points = [
    [2495.123, 0.125],
    [2494.7, -0.3],
  ].map((p) => p.map(Math.fround));
  for (const fault of ['none', 'height-error', 'empty-readback', 'throw', 'no-float-target']) {
    const previous = new THREE.WebGLRenderTarget(2, 2);
    let target = previous,
      reads = 0,
      draws = 0,
      disposed = 0;
    const renderer = {
      extensions: { has: () => fault !== 'no-float-target' },
      getRenderTarget: () => target,
      getActiveCubeFace: () => 2,
      getActiveMipmapLevel: () => 1,
      setRenderTarget(value, face, level) {
        target = value;
        if (value === previous) {
          assert.equal(face, 2);
          assert.equal(level, 1);
        } else value.addEventListener('dispose', () => disposed++);
      },
      render(scene) {
        draws++;
        const mesh = scene.children[0];
        mesh.geometry.addEventListener('dispose', () => disposed++);
        mesh.material.addEventListener('dispose', () => disposed++);
        assert.match(
          mesh.material.vertexShader,
          /sampleHeight = waferCadRoughProfile\(position.xy\)/,
        );
        assert.doesNotMatch(mesh.material.fragmentShader, /waferCadRoughProfile/);
      },
      readRenderTargetPixels(_target, _x, _y, _width, _height, data) {
        reads++;
        if (fault === 'throw') throw Error('Injected readback failure');
        if (fault === 'empty-readback') return;
        points.forEach(([x, y], i) => {
          data[i * 4] =
            roughDisplayProfileOffsetAtPoint(x, y, appearance) +
            (fault === 'height-error' ? 0.001 : 0);
          data[i * 4 + 3] = 1;
        });
      },
    };
    const result = checkGpuRoughHeightParity(THREE, renderer, appearance, points);
    assert.equal(result.eligible, fault === 'none', fault);
    assert.equal(target, previous, 'Never leave the qualification target bound');
    assert.equal(
      disposed,
      fault === 'no-float-target' ? 0 : 3,
      'Dispose all temporary GPU resources',
    );
    const oldReads = reads,
      oldDraws = draws;
    assert.equal(checkGpuRoughHeightParity(THREE, renderer, appearance, points), result);
    assert.equal(reads, oldReads, 'Camera-only repeats reuse qualification');
    assert.equal(draws, oldDraws, 'Cached qualification must not issue another GPU draw');
    previous.dispose();
  }
});

test('GPU rough uniforms preserve deterministic appearance identity', () => {
  const uniforms = gpuRoughAppearanceUniforms(appearance, {
    profileNormal: -1,
    normalStrength: 0.75,
  });

  assert.equal(uniforms.waferCadRoughFeatureSize.value, 0.8);
  assert.equal(uniforms.waferCadRoughMorphology.value, 1);
  assert.equal(uniforms.waferCadRoughStableScale.value, 0);
  assert.equal(
    gpuRoughAppearanceUniforms({ ...appearance, morphology: 'stochastic-v2' })
      .waferCadRoughStableScale.value,
    1,
  );
  assert.equal(uniforms.waferCadRoughPolarityNormal.value, 1);
  assert.equal(uniforms.waferCadRoughSeedLow.value, 0xba98);
  assert.equal(uniforms.waferCadRoughSeedHigh.value, 0xfedc);
  assert.equal(uniforms.waferCadRoughSampleOriginX.value, 12.5);
  assert.equal(uniforms.waferCadRoughSampleOriginY.value, -7.25);
  assert.equal(uniforms.waferCadRoughProfileNormal.value, -1);
  assert.equal(uniforms.waferCadRoughNormalStrength.value, 0.75);
  assert.equal(uniforms.waferCadRoughFarFieldContrast.value, 0);
  assert.equal(uniforms.waferCadRoughFarFieldFeatureSize.value, 0.8);
  assert.equal(uniforms.waferCadRoughFarFieldSeed.value, 0xba98);
  assert.equal(uniforms.waferCadRoughVisualBlend.value, 1);
  const filtered = gpuRoughAppearanceUniforms({ ...appearance, displayRoughBlend: 0.12 });
  assert.equal(filtered.waferCadRoughVisualBlend.value, 0.12);
});

test('Stable-scale shader frame preserves global lattice indices without changing the physical sampling origin', () => {
  const surface = {
    ...appearance,
    morphology: 'stochastic-v2',
    seed: 0xfedcba98,
    featureSize: 0.3,
    sampleOrigin: [35.25, -4.5],
  };
  const anchor = [2495.123456, -1.234567];
  const uniforms = gpuRoughAppearanceUniforms(surface, { precisionAnchor: anchor });
  const frame = anchor.map(Math.fround);
  const theta = ((surface.seed % 3600) / 3600) * Math.PI * 2;
  const x = frame[0] - surface.sampleOrigin[0],
    y = frame[1] - surface.sampleOrigin[1];
  const rotated = [
    x * Math.cos(theta) + y * Math.sin(theta),
    -x * Math.sin(theta) + y * Math.cos(theta),
  ];
  assert.deepEqual(uniforms.waferCadRoughFrameAnchor.value, frame);
  for (const [scale, name] of [
    [1, 'Fine'],
    [4, 'Coarse'],
  ]) {
    const expected = rotated.map((value) => value / (surface.featureSize * scale));
    const cell = uniforms[`waferCadRough${name}Cell`].value;
    const fraction = uniforms[`waferCadRough${name}Fraction`].value;
    assert.deepEqual(cell, expected.map(Math.floor));
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(cell[i] + fraction[i] - expected[i]) < 1e-10);
    }
  }
  assert.deepEqual(uniforms.waferCadRoughFrameCosSin.value, [Math.cos(theta), Math.sin(theta)]);
  assert.equal(uniforms.waferCadRoughSampleOriginX.value, surface.sampleOrigin[0]);
  assert.equal(uniforms.waferCadRoughSampleOriginY.value, surface.sampleOrigin[1]);
  assert.deepEqual(surface.sampleOrigin, [35.25, -4.5]);
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

test('software WebGL is excluded from the precision-sensitive shader displacement path', () => {
  const renderer = (name) => ({
    getContext: () => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 77 }),
      getParameter: () => name,
      RENDERER: 11,
    }),
  });
  assert.equal(supportsPreciseGpuRoughDisplacement(renderer('Google SwiftShader')), false);
  assert.equal(supportsPreciseGpuRoughDisplacement(renderer('Mesa llvmpipe')), false);
  assert.equal(supportsPreciseGpuRoughDisplacement(renderer('D3D11 Intel Iris Xe')), true);
  assert.equal(supportsPreciseGpuRoughDisplacement(renderer('NVIDIA GeForce RTX 3060')), true);
});

test('GPU rough task eligibility falls back for buried, implant, and scaled-Z paths', () => {
  assert.equal(canUseGpuRoughTask({ appearance }), true);
  assert.equal(canUseGpuRoughTask({ appearance, buried: true }), false);
  assert.equal(canUseGpuRoughTask({ appearance, implant: true }), false);
  assert.equal(
    canUseGpuRoughTask({ appearance, zDisplay: { frontScale: 1.2, backScale: 1 } }),
    false,
  );
  assert.equal(canUseGpuRoughTask({ appearance, zDisplay: { frontScale: 1, backScale: 1 } }), true);
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
      '#include <common>\nvarying vec3 vViewPosition;\nvoid main() {\nvec3 normal = vec3(0.0,0.0,1.0);\n#include <color_fragment>\n#include <normal_fragment_maps>\n}',
  };

  assert.equal(decorateGpuRoughMaterial(material, appearance), true);
  material.onBeforeCompile(shader, {});

  assert.equal(priorCompileCalls, 1);
  assert.equal(material.needsUpdate, true);
  assert.equal(material.userData.waferCadGpuRough.normalStrengthBase, 1);
  assert.match(material.customProgramCacheKey(), /wafercad-gpu-rough-v10/);
  assert.match(shader.vertexShader, /waferCadGpuDisplace/);
  assert.doesNotMatch(shader.vertexShader, /instanceMatrix\[3\]\.xy/);
  assert.match(shader.vertexShader, /transformed\.z \+= waferCadRoughProfileNormal/);
  assert.match(shader.vertexShader, /vWaferCadRoughXY/);
  assert.match(shader.fragmentShader, /waferCadRoughProfile/);
  assert.match(shader.vertexShader, /waferCadRoughVisualBlend/);
  assert.match(shader.vertexShader, /return mix\(center, raw, waferCadRoughVisualBlend\)/);
  assert.match(shader.fragmentShader, /waferCadScreenDx/);
  assert.match(shader.fragmentShader, /waferCadFarFieldShade\(vWaferCadRoughXY\)/);
  assert.match(shader.fragmentShader, /waferCadFarValueNoise/);
  assert.match(
    shader.fragmentShader,
    /vec2 footprint = max\(abs\(dFdx\(xy\)\), abs\(dFdy\(xy\)\)\)/,
  );
  assert.match(shader.fragmentShader, /vec2 displayCell = max\(/);
  assert.match(shader.fragmentShader, /footprint \* 5\.0/);
  assert.doesNotMatch(
    shader.fragmentShader,
    /float footprint = max\(length\(dFdx/,
    'Grazing-angle filtering must not collapse both UV axes into one footprint',
  );
  assert.match(shader.fragmentShader, /2\.0 \* visual - 1\.0/);
  assert.match(shader.fragmentShader, /return clamp\(shade, 0\.65, 1\.35\)/);

  assert.match(
    shader.fragmentShader,
    /unresolved = 1\.0 - smoothstep\(0\.75, 8\.0, featurePixels\)/,
  );
  assert.match(shader.fragmentShader, /waferCadMicroNormalWeight = smoothstep\(1\.5, 3\.0/);
  assert.match(shader.fragmentShader, /waferCadRoughNormalStrength \* waferCadMicroNormalWeight/);
  assert.match(shader.vertexShader, /vWaferCadRoughSurface = step\(0\.0, waferCadGpuDisplace\)/);
  assert.match(shader.fragmentShader, /if \(vWaferCadRoughSurface > 0\.5/);
  assert.doesNotMatch(
    shader.fragmentShader,
    /vWaferCadGpuDisplace/,
    'CPU-pinned vertices cannot switch normal shading partway through cap triangles',
  );
  assert.match(shader.fragmentShader, /waferCadHashBits/);
  assert.match(shader.fragmentShader, /prior-hook/);
  assert.equal(shader.uniforms.waferCadRoughFeatureSize.value, 0.8);
});

test('GPU rough outline shader shares cap vertex-height profile without normal-fragment hooks', () => {
  const material = {
    onBeforeCompile: null,
    customProgramCacheKey: () => 'line',
  };
  assert.equal(decorateGpuRoughLineMaterial(material, appearance, { profileNormal: -1 }), true);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {}',
  };
  material.onBeforeCompile(shader, {});
  assert.match(material.customProgramCacheKey(), /wafercad-gpu-rough-line-v1/);
  assert.match(shader.vertexShader, /waferCadRoughProfile\(position.xy\)/);
  assert.match(shader.vertexShader, /waferCadGaussianHash/);
  assert.doesNotMatch(shader.fragmentShader, /waferCadGaussianHash/);
  assert.equal(shader.uniforms.waferCadRoughProfileNormal.value, -1);
  assert.equal(shader.uniforms.waferCadRoughSampleOriginX.value, 12.5);
});

test('software roughness visibility shader changes only color, not displaced geometry', () => {
  const material = { userData: {}, customProgramCacheKey: () => 'base' };
  const sourceVertex = '#include <common>\\nvoid main() {\\n#include <begin_vertex>\\n}';
  const shader = {
    uniforms: {},
    vertexShader: sourceVertex,
    fragmentShader: '#include <common>\\nvoid main() {\\n#include <color_fragment>\\n}',
  };
  assert.equal(decorateRoughFarFieldMaterial(material, appearance), true);
  material.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /vWaferCadFarXY = position.xy/);
  assert.match(shader.vertexShader, /vWaferCadFarTop = smoothstep/);
  assert.doesNotMatch(shader.vertexShader, /transformed.z/);
  assert.match(shader.fragmentShader, /waferCadFarFieldShade\(vWaferCadFarXY\)/);
  assert.match(shader.fragmentShader, /waferCadFarValueNoise/);
  assert.match(
    shader.fragmentShader,
    /vec2 footprint = max\(abs\(dFdx\(xy\)\), abs\(dFdy\(xy\)\)\)/,
  );
  assert.match(shader.fragmentShader, /vec2 displayCell = max\(/);
  assert.match(shader.fragmentShader, /footprint \* 5\.0/);
  assert.doesNotMatch(
    shader.fragmentShader,
    /float footprint = max\(length\(dFdx/,
    'Grazing-angle filtering must not collapse both UV axes into one footprint',
  );
  assert.match(shader.fragmentShader, /2\.0 \* visual - 1\.0/);
  assert.match(shader.fragmentShader, /return clamp\(shade, 0\.65, 1\.35\)/);

  assert.match(
    shader.fragmentShader,
    /unresolved = 1\.0 - smoothstep\(0\.75, 8\.0, featurePixels\)/,
  );
  assert.match(material.customProgramCacheKey(), /wafercad-rough-farfield-v2/);
  assert.equal(shader.uniforms.waferCadRoughFarFieldContrast.value, 0);
  assert.equal(shader.uniforms.waferCadRoughFarFieldFeatureSize.value, 0.8);
  assert.equal(shader.uniforms.waferCadRoughFarFieldSeed.value, 0xba98);
  assert.equal(decorateRoughFarFieldMaterial({}, { ...appearance, kind: 'smooth' }), false);
});

test('native worker and synchronous rough-mesh paths both bind far-field material', () => {
  const source = readFileSync(new URL('../three-view.js', import.meta.url), 'utf8'),
    workerStart = source.indexOf('function applyRoughMeshResults('),
    syncStart = source.indexOf('function rebuildAdaptiveRoughGeometrySync('),
    workerPath = source.slice(
      workerStart,
      source.indexOf('function requestRoughGeometry(', workerStart),
    ),
    syncPath = source.slice(syncStart, source.indexOf('function init()', syncStart));

  assert.ok(workerStart >= 0 && syncStart >= 0, 'both native rough assembly paths must exist');
  for (const [name, code] of [
    ['worker', workerPath],
    ['synchronous', syncPath],
  ]) {
    assert.match(
      code,
      /decorateRoughFarFieldMaterial\(material,/,
      `${name} must decorate CPU rough surfaces`,
    );
    assert.match(
      code,
      /!cap\.buried && roughFarFieldContrast\(0, cap\.appearance\) > 0/,
      `${name} should only decorate exposed stochastic caps`,
    );
    assert.match(
      code,
      /geometry\.userData\.roughGpuDisplacement && !task\.implant/,
      `${name} must keep original GPU displacement eligibility`,
    );
  }
});
