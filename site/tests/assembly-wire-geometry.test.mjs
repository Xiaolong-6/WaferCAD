import assert from 'node:assert/strict';
import test from 'node:test';
import { inferredAuWireBond, validateAssemblyWires } from '../assembly-wire-geometry.js';
import { assemblyWireCurve, createAssemblyWireMeshes } from '../assembly-wire-mesh.js';

const wire = inferredAuWireBond({
  id: 'metal-pad-to-gsg',
  from: [-225, 0, 707.075],
  to: [-1250, 0, 707.2],
  fromLayerId: 'layer-26',
  toLayerId: 'layer-28',
  riseUm: 190,
  diameterUm: 12,
});

// A lightweight geometry-constructor double checks canonical positioning and
// metadata without launching WebGL or executing costly process reconstruction.
const THREE = {
  Vector3: class {
    constructor(x, y, z) {
      Object.assign(this, { x, y, z });
    }
    clone() {
      return new THREE.Vector3(this.x, this.y, this.z);
    }
    negate() {
      this.x *= -1;
      this.y *= -1;
      this.z *= -1;
      return this;
    }
  },
  CubicBezierCurve3: class {
    constructor(...points) {
      this.points = points;
    }
    getTangent(end) {
      const a = this.points[end ? 2 : 0];
      const b = this.points[end ? 3 : 1];
      return new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    }
  },
  Quaternion: class {
    setFromUnitVectors(from, to) {
      this.from = from;
      this.to = to;
      return this;
    }
  },
  TubeGeometry: class {
    constructor(curve, segments, radius, radialSegments, closed) {
      Object.assign(this, { curve, segments, radius, radialSegments, closed });
    }
  },
  CircleGeometry: class {
    constructor(radius, segments) {
      Object.assign(this, { radius, segments });
    }
    applyQuaternion(quaternion) {
      this.quaternion = quaternion;
      return this;
    }
    translate(x, y, z) {
      this.translation = [x, y, z];
      return this;
    }
  },
  MeshStandardMaterial: class {
    constructor(options) {
      Object.assign(this, options);
    }
  },
  Mesh: class {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.userData = {};
      this.position = { x: 0, y: 0, z: 0 };
    }
  },
};

test('wire-bond meshes include a tube and two tangent-aligned end disks', () => {
  assert.equal(validateAssemblyWires([wire]).length, 1);
  const curve = assemblyWireCurve(THREE, wire);
  const meshes = createAssemblyWireMeshes(THREE, wire, curve);
  assert.equal(meshes.length, 3);
  assert.equal(meshes[0].geometry.radius, 6);
  assert.equal(meshes[0].geometry.segments, 64);
  assert.equal(meshes[0].geometry.radialSegments, 10);
  assert.equal(meshes[0].geometry.closed, false);
  assert.deepEqual(
    meshes.slice(1).map((mesh) => mesh.geometry.translation),
    [wire.points[0], wire.points[3]],
    'Contact feet must use baked canonical XYZ rather than mutable object.position',
  );
  assert.ok(meshes.slice(1).every((mesh) => mesh.geometry.radius === 6));
  assert.ok(meshes.slice(1).every((mesh) => mesh.geometry.segments === 10));
  assert.ok(meshes[1].geometry.quaternion.to.z < 0);
  assert.ok(meshes[2].geometry.quaternion.to.z < 0);
  assert.ok(meshes.every((mesh) => mesh.userData.wafercadAssemblyWireId === wire.id));
  assert.deepEqual(
    meshes.map((mesh) => mesh.userData.wafercadAssemblyPart),
    ['tube', 'contact-0', 'contact-1'],
  );
  assert.ok(meshes.every((mesh) => mesh.position.z === 0));
  assert.deepEqual(
    meshes.map((mesh) => mesh.userData.wafercadContactLayerIds),
    [wire.contactLayerIds, wire.contactLayerIds, wire.contactLayerIds],
  );
});

test('Au wire control points climb clear of both saved metal-pad tops', () => {
  const [a, b, c, d] = wire.points;
  assert.equal(a[2], 707.075);
  assert.equal(d[2], 707.2);
  assert.equal(b[2], 897.2);
  assert.equal(c[2], 897.2);
  assert.ok(b[2] > a[2] + wire.diameterUm);
  assert.ok(c[2] > d[2] + wire.diameterUm);
});
