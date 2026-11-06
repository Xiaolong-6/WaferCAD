import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  projectThreeMeshesToSvg,
  normalizeSvgExportOptions,
  SVG_TRIANGLE_BUDGETS,
} from '../three-svg-export.js';

function camera() {
  const view = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  view.position.set(3, -4, 10);
  view.lookAt(0, 0, 0);
  view.updateProjectionMatrix();
  view.updateMatrixWorld(true);
  return view;
}

function triangle(z = [0, 0, 0], name = 'Si') {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -1, -1, z[0], 1, -1, z[1], 0, 1, z[2],
    ], 3),
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#b86e39' }));
  mesh.userData.wafercadLayerId = name;
  return mesh;
}

function exportSvg(root, options = {}) {
  return projectThreeMeshesToSvg(THREE, root, camera(), {
    width: 900,
    height: 900,
    ...options,
  });
}

test('3D SVG exports editable geometric paths, not bitmap wrappers', () => {
  const root = new THREE.Group();
  root.add(triangle([0, 0, 0], 'Si'));
  const svg = exportSvg(root);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /data-wafercad-layer="Si"/);
  assert.doesNotMatch(svg, /<image|data:image|base64/i);
  assert.equal((svg.match(/<path /g) || []).length, 1);
});

test('Rough CPU vertex heights affect actual projected vector geometry', () => {
  const flat = new THREE.Group();
  flat.add(triangle([0, 0, 0]));
  const rough = new THREE.Group();
  rough.add(triangle([0, 0.65, 0.11]));
  assert.notEqual(exportSvg(flat), exportSvg(rough));
  assert.notEqual(exportSvg(rough, { mode: 'view', mapZ: (z) => z * 3 }), exportSvg(rough, {
    mode: 'physical',
    mapZ: (z) => z * 3,
  }));
});

test('parallel layer surfaces are painted back-to-front', () => {
  const root = new THREE.Group();
  root.add(triangle([-1, -1, -1], 'behind'));
  root.add(triangle([1, 1, 1], 'front'));
  const svg = exportSvg(root);
  assert.ok(svg.indexOf('data-wafercad-layer="behind"') < svg.indexOf('data-wafercad-layer="front"'));
});

test('instanced material templates are projected at all translations', () => {
  const base = triangle();
  const root = new THREE.Group();
  const mesh = new THREE.InstancedMesh(base.geometry, base.material, 2);
  const matrix = new THREE.Matrix4();
  mesh.setMatrixAt(0, matrix.identity());
  mesh.setMatrixAt(1, matrix.makeTranslation(2, 0, 0));
  root.add(mesh);
  const svg = exportSvg(root);
  assert.equal((svg.match(/<path /g) || []).length, 2);
});

test('SVG quality budget fails closed rather than silently dropping facets', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array((SVG_TRIANGLE_BUDGETS.standard + 1) * 9), 3),
  );
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  assert.throws(() => exportSvg(root, { detail: 'standard' }), /smaller 3D ROI/);
});

test('SVG options normalize to stable defaults and abort before work', () => {
  assert.deepEqual(normalizeSvgExportOptions({ detail: 'invalid', mode: 'invalid' }), {
    detail: 'high',
    mode: 'view',
  });
  const root = new THREE.Group();
  root.add(triangle());
  const aborter = new AbortController();
  aborter.abort();
  assert.throws(() => exportSvg(root, { signal: aborter.signal }), /cancelled/i);
});
