import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const {
  geometryFromRoughCap,
  geometryFromRoughMeshData,
  roughBoundaryEdgesFromTriangles,
  roughMeshDataFromPreparedCap,
  subdivideRoughBaseTriangles,
} = await import('../rough-mesh-geometry.js');

const a = [0, 0, 0];
const b = [1, 0, 0];
const c = [1, 1, 0];
const d = [0, 1, 0];
const squareTriangles = [
  [a, b, c],
  [a, c, d],
];

test('triangle-derived rough boundaries remove internal triangulation edges', () => {
  const edges = roughBoundaryEdgesFromTriangles(squareTriangles);
  assert.equal(edges.length, 4);
  assert.equal(
    edges.some(
      (edge) =>
        (edge.p[0] === 0 && edge.p[1] === 0 && edge.q[0] === 1 && edge.q[1] === 1) ||
        (edge.q[0] === 0 && edge.q[1] === 0 && edge.p[0] === 1 && edge.p[1] === 1),
    ),
    false,
  );

  const subdivided = subdivideRoughBaseTriangles(squareTriangles, 1);
  assert.equal(subdivided.length, 8);
  assert.equal(roughBoundaryEdgesFromTriangles(subdivided).length, 8);
});

test('triangle-partitioned LOD zones treat shared edges as seams rather than physical skirts', () => {
  class BufferGeometry {
    constructor() {
      this.userData = {};
      this.attributes = {};
    }

    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
    }
  }

  class Float32BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  const THREE = { BufferGeometry, Float32BufferAttribute },
    appearance = {
      kind: 'rough',
      morphology: 'stochastic',
      polarity: 'inverted',
      featureSize: 1,
      meanHeight: 0.2,
      etchDepth: 0.2,
      featureCv: 0,
      heightCv: 0,
      seed: 1,
      geometryMode: 'ideal',
    },
    zones = squareTriangles.map((triangle) => ({
      polys: null,
      baseTriangles: [triangle],
      maxEdge: Math.SQRT2,
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      triangleBudget: 1,
      lodContext: {
        distance: 1000,
        viewportWidth: 100,
        viewportHeight: 100,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 0.5,
        roiFraction: 1,
        screenPriority: 0.1,
        maxDepth: 0,
      },
    })),
    geometry = geometryFromRoughCap(THREE, {
      z: 0,
      normal: 1,
      polys: null,
      appearance,
      lodZones: zones,
      closeToIdeal: true,
    });

  assert.equal(geometry.userData.roughLodZoneCount, 2);
  assert.equal(geometry.userData.roughLodStitchCount, 1);
  assert.equal(geometry.userData.roughBorderPositions.length, 24);
});

test('buried rough interfaces do not generate ideal-plane closure skirts', () => {
  const appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 0.5,
      meanHeight: 0.1,
      etchDepth: 0.1,
      featureCv: 0,
      heightCv: 0,
      seed: 9,
      geometryMode: 'ideal',
    },
    zones = squareTriangles.map((triangle) => ({
      baseTriangles: [triangle],
      maxEdge: Math.SQRT2,
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      triangleBudget: 1,
      lodContext: {
        distance: 1000,
        viewportWidth: 100,
        viewportHeight: 100,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 0.5,
        roiFraction: 1,
        screenPriority: 0.1,
        maxDepth: 0,
      },
    })),
    exposed = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      lodZones: zones,
      closeToIdeal: true,
    }),
    buried = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      lodZones: zones,
      closeToIdeal: false,
    });

  assert.ok(exposed.roughBorderPositions.length > 0);
  assert.equal(buried.roughBorderPositions.length, 0);
  assert.ok(exposed.positions.length > buried.positions.length);
});

test('worker-ready rough mesh data is transferable and reconstructs geometry metadata', () => {
  class BufferGeometry {
    constructor() {
      this.userData = {};
      this.attributes = {};
    }

    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
    }
  }

  class Float32BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  const THREE = { BufferGeometry, Float32BufferAttribute },
    appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 0.5,
      meanHeight: 0.1,
      etchDepth: 0.1,
      featureCv: 0,
      heightCv: 0,
      seed: 4,
      geometryMode: 'ideal',
    },
    zones = squareTriangles.map((triangle) => ({
      baseTriangles: [triangle],
      maxEdge: Math.SQRT2,
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      triangleBudget: 4,
      lodContext: {
        distance: 20,
        viewportWidth: 640,
        viewportHeight: 480,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 0.5,
        roiFraction: 1,
        screenPriority: 0.5,
        maxDepth: 1,
      },
    })),
    data = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      lodZones: zones,
      closeToIdeal: true,
    });

  assert.ok(data.positions instanceof Float32Array);
  assert.ok(data.normals instanceof Float32Array);
  assert.ok(data.gpuDisplace instanceof Float32Array);
  assert.ok(data.roughBorderPositions instanceof Float32Array);
  assert.ok(data.positions.length > 0);
  assert.equal(data.positions.length, data.normals.length);
  assert.equal(data.gpuDisplace.length, 0);
  assert.equal(data.metadata.roughLodZoneCount, 2);
  assert.equal(data.metadata.roughLodStitchCount, 1);

  const geometry = geometryFromRoughMeshData(THREE, data);
  assert.equal(geometry.attributes.position.array, data.positions);
  assert.equal(geometry.attributes.normal.array, data.normals);
  assert.equal(geometry.attributes.waferCadGpuDisplace, undefined);
  assert.equal(geometry.userData.roughGpuDisplacement, false);
  assert.equal(geometry.userData.roughLodZoneCount, data.metadata.roughLodZoneCount);
  assert.equal(
    geometry.userData.roughSubdivisionTriangleCount,
    data.metadata.roughSubdivisionTriangleCount,
  );
});

test('GPU rough mode keeps cap vertices ideal and marks only shader-displaced triangles', () => {
  const appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 0.5,
      meanHeight: 0.1,
      etchDepth: 0.1,
      featureCv: 0,
      heightCv: 0,
      seed: 11,
      geometryMode: 'ideal',
    },
    zone = {
      baseTriangles: squareTriangles,
      maxEdge: Math.SQRT2,
      edges: roughBoundaryEdgesFromTriangles(squareTriangles),
      triangleBudget: 8,
      lodContext: {
        distance: 20,
        viewportWidth: 640,
        viewportHeight: 480,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 1,
        maxDepth: 1,
      },
    },
    data = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      lodZones: [zone],
      closeToIdeal: true,
      gpuDisplacement: true,
    });

  assert.equal(data.metadata.roughGpuDisplacement, true);
  assert.equal(data.gpuDisplace.length, data.positions.length / 3);
  assert.ok(data.gpuDisplace.some((value) => value === 1));
  assert.ok(data.gpuDisplace.some((value) => value === 0));

  for (let index = 0; index < data.gpuDisplace.length; index++) {
    if (data.gpuDisplace[index] !== 1) continue;
    assert.equal(data.positions[index * 3 + 2], 0);
    assert.deepEqual(Array.from(data.normals.slice(index * 3, index * 3 + 3)), [0, 0, 1]);
  }
});

test('GPU rough cap interior does not sample the CPU morphology field', () => {
  const appearance = new Proxy(
      { kind: 'rough', featureSize: 0.5 },
      {
        get(target, property) {
          if (property === 'featureSize' || property === 'kind') return target[property];
          throw new Error(`CPU morphology field was sampled through ${String(property)}`);
        },
      },
    ),
    zone = {
      baseTriangles: squareTriangles,
      maxEdge: Math.SQRT2,
      edges: roughBoundaryEdgesFromTriangles(squareTriangles),
      triangleBudget: 2,
      lodContext: {
        distance: 1000,
        viewportWidth: 100,
        viewportHeight: 100,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 0.1,
        maxDepth: 0,
      },
    };

  const data = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    lodZones: [zone],
    closeToIdeal: false,
    gpuDisplacement: true,
  });

  assert.equal(data.metadata.roughGpuDisplacement, true);
  assert.ok(data.gpuDisplace.every((value) => value === 1));
  assert.ok(data.positions.every((value, index) => index % 3 !== 2 || value === 0));
});
