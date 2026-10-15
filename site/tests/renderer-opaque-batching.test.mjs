import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { batchOpaqueExteriorMeshes } from '../renderer-opaque-batching.js';

function addMesh(
  group,
  material,
  z0,
  z1,
  {
    kind = 'material-exterior',
    translate = 0,
    mapped = false,
    indexed = false,
    rough = false,
  } = {},
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, z0, 1, 0, z0, 0, 1, z1], 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  if (indexed) geometry.setIndex([0, 1, 2]);
  if (rough) geometry.userData.roughGpuDisplacement = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = translate;
  mesh.userData.waferCadPresentation = { kind, sortBias: 0 };
  mesh.userData.waferCadZDisplay = {
    minZ: z0,
    maxZ: z1,
    mode: mapped ? 'mapped' : 'translated',
    canonicalZ: mapped ? new Float32Array([z0, z0, z1]) : null,
  };
  group.add(mesh);
  return mesh;
}

test('opaque batches retain exact triangle data and retire only source geometries', async () => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const prior = [0, 1, 2, 3, 4].map(() => addMesh(group, material, 1, 2, { translate: 0.5 }));
  const originalPositions = prior.flatMap((mesh) =>
    Array.from(mesh.geometry.getAttribute('position').array),
  );
  let disposed = 0;
  for (const mesh of prior) mesh.geometry.addEventListener('dispose', () => disposed++);
  const removed = new Set();
  const added = new Set();
  const result = await batchOpaqueExteriorMeshes(THREE, group, {
    onReplace: (oldMesh, newMesh) => {
      if (oldMesh) removed.add(oldMesh);
      if (newMesh) added.add(newMesh);
    },
  });
  assert.equal(result.removed, 4);
  assert.equal(result.batches, 1);
  assert.equal(disposed, 5);
  assert.equal(removed.size, 5);
  assert.equal(added.size, 1);
  assert.equal(group.children.length, 1);
  const mesh = group.children[0];
  assert.equal(mesh.position.z, 0.5);
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), originalPositions);
  assert.strictEqual(mesh.material, material);
  assert.equal(mesh.userData.waferCadZDisplay.minZ, 1);
  assert.equal(mesh.userData.waferCadZDisplay.maxZ, 2);
});

test('mapped Z backups concatenate for deterministic subsequent Z Break remapping', async () => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const left = addMesh(group, material, 1, 2, { mapped: true });
  const right = addMesh(group, material, 1, 2, { mapped: true });
  left.geometry.getAttribute('position').setZ(1, 55);
  right.geometry.getAttribute('position').setZ(2, 77);
  await batchOpaqueExteriorMeshes(THREE, group);
  assert.equal(group.children.length, 1);
  assert.deepEqual(
    Array.from(group.children[0].userData.waferCadZDisplay.canonicalZ),
    [1, 1, 2, 1, 1, 2],
  );
  assert.deepEqual(
    Array.from(group.children[0].geometry.getAttribute('position').array),
    [0, 0, 1, 1, 0, 55, 0, 1, 2, 0, 0, 1, 1, 0, 1, 0, 1, 77],
  );
});

test('transparent, rough, indexed and cross-depth meshes are never mixed', async () => {
  const group = new THREE.Group();
  const solid = new THREE.MeshStandardMaterial();
  const transparent = new THREE.MeshStandardMaterial({ transparent: true });
  const original = [
    addMesh(group, solid, 0, 1),
    addMesh(group, transparent, 0, 1),
    addMesh(group, solid, 0, 1, { rough: true }),
    addMesh(group, solid, 0, 1, { indexed: true }),
    addMesh(group, solid, 0, 2),
    addMesh(group, solid, 0, 1),
    addMesh(group, solid, 0, 1, { kind: 'material-interface' }),
  ];
  const result = await batchOpaqueExteriorMeshes(THREE, group);
  assert.equal(result.removed, 0);
  assert.deepEqual(group.children, original);
});

test('max vertex budget and neighboring material ordering remain bounded', async () => {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#ff0000' });
  const blue = new THREE.MeshStandardMaterial({ color: '#0000ff' });
  for (let i = 0; i < 6; i++) addMesh(group, red, 0, 1);
  const midpoint = addMesh(group, blue, 0, 1);
  for (let i = 0; i < 6; i++) addMesh(group, red, 0, 1);
  const result = await batchOpaqueExteriorMeshes(THREE, group, { maxVertices: 9 });
  assert.equal(result.batches, 4);
  assert.equal(result.removed, 8);
  assert.equal(group.children[2], midpoint);
  assert.ok(group.children.every((obj) => obj.geometry.getAttribute('position').count <= 9));
});
