import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDepthAwareOutlines } from '../three-outline-pass.js';
import * as THREE from 'three';
import { decorateGpuRoughMaterial } from '../gpu-rough-surface.js';

function fixture(failAt = -1) {
  const material = {
    colorWrite: true,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    polygonOffset: false,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    onBeforeCompile: () => 'same displaced shader',
  };
  const mesh = { isMesh: true, visible: true, material },
    annotation = { isMesh: true, visible: true, material: { ...material } },
    hiddenMesh = { isMesh: true, visible: false, material: { ...material } },
    solid = { isLine: true, visible: true, material: { depthTest: true, depthFunc: 3 } },
    dashed = { isLine: true, visible: true, material: { depthTest: true, depthFunc: 6 } },
    objects = [mesh, annotation, hiddenMesh, solid, dashed],
    scene = { background: 'background', traverse: (visit) => objects.forEach(visit) },
    frames = [],
    events = [],
    renderer = {
      autoClear: true,
      info: {
        autoReset: true,
        reset() {
          events.push('reset');
        },
      },
      clearDepth() {
        events.push('depth');
      },
      render() {
        frames.push({
          visible: objects.map((o) => o.visible),
          colorWrite: material.colorWrite,
          depthWrite: material.depthWrite,
          background: scene.background,
          autoClear: this.autoClear,
        });
        if (frames.length === failAt) throw new Error('render failed');
      },
    };
  return { material, mesh, annotation, hiddenMesh, solid, dashed, scene, renderer, frames, events };
}

test('depth aware outlines classify against structural depth after intact transparent colors', () => {
  const f = fixture(),
    before = { ...f.material };
  assert.equal(
    renderDepthAwareOutlines(
      f.renderer,
      f.scene,
      {},
      {
        occluders: [f.mesh, f.hiddenMesh],
        outlines: [f.solid, f.dashed],
      },
    ),
    true,
  );
  assert.deepEqual(f.frames, [
    {
      visible: [true, true, false, false, false],
      colorWrite: true,
      depthWrite: false,
      background: 'background',
      autoClear: true,
    },
    {
      visible: [true, false, false, false, false],
      colorWrite: false,
      depthWrite: true,
      background: null,
      autoClear: false,
    },
    {
      visible: [false, false, false, true, true],
      colorWrite: true,
      depthWrite: false,
      background: null,
      autoClear: false,
    },
  ]);
  assert.deepEqual(f.events, ['reset', 'depth']);
  assert.deepEqual(f.material, before);
  assert.equal(f.renderer.autoClear, true);
  assert.equal(f.renderer.info.autoReset, true);
  assert.equal(f.scene.background, 'background');
  assert.equal(f.annotation.visible, true);
  assert.equal(f.hiddenMesh.visible, false);
});

test('depth pass restores scene and material state if WebGL render throws', () => {
  for (const failAt of [1, 2, 3]) {
    const f = fixture(failAt),
      before = { ...f.material };
    assert.throws(
      () =>
        renderDepthAwareOutlines(
          f.renderer,
          f.scene,
          {},
          {
            occluders: [f.mesh],
            outlines: [f.solid, f.dashed],
          },
        ),
      /render failed/,
    );
    assert.deepEqual(f.material, before);
    assert.equal(f.mesh.visible, true);
    assert.equal(f.solid.visible, true);
    assert.equal(f.renderer.autoClear, true);
    assert.equal(f.scene.background, 'background');
  }
});

test('disabled outlines retain the single scene pass', () => {
  const f = fixture();
  f.solid.visible = false;
  assert.equal(
    renderDepthAwareOutlines(
      f.renderer,
      f.scene,
      {},
      {
        occluders: [f.mesh],
        outlines: [f.solid],
      },
    ),
    false,
  );
  assert.equal(f.frames.length, 1);
  assert.deepEqual(f.events, []);
});

test('depth rebuild retains the actual GPU rough material and instanced mesh', () => {
  const scene = new THREE.Scene(),
    material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.15 }),
    mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2),
    lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
    appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      featureSize: 1,
      meanHeight: 0.2,
      etchDepth: 0.2,
      seed: 3,
    };
  decorateGpuRoughMaterial(material, appearance);
  const compile = material.onBeforeCompile,
    key = material.customProgramCacheKey(),
    version = material.version;
  scene.add(mesh, lines);
  let draws = 0;
  const renderer = {
    autoClear: true,
    clearDepth() {},
    render() {
      draws++;
      assert.equal(mesh.material, material);
      assert.equal(material.onBeforeCompile, compile);
      assert.equal(material.customProgramCacheKey(), key);
      assert.equal(
        material.version,
        version,
        'depth rebuild does not recompile morphology shaders',
      );
      assert.equal(mesh.count, 2);
      if (draws === 2) {
        assert.equal(material.colorWrite, false);
        assert.equal(material.depthWrite, true);
      }
    },
  };
  renderDepthAwareOutlines(renderer, scene, new THREE.PerspectiveCamera(), {
    occluders: [mesh],
    outlines: [lines],
  });
  assert.equal(draws, 3);
  assert.equal(material.opacity, 0.15);
  assert.equal(material.transparent, true);
  assert.equal(material.colorWrite, true);
  mesh.geometry.dispose();
  material.dispose();
  lines.geometry.dispose();
  lines.material.dispose();
});
