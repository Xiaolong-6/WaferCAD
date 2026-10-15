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

test('GPU rough mode pins physical boundary vertices and keeps shader-displaced interior ideal', () => {
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
    const faceStart = index - (index % 3);
    const faceGpu = data.gpuDisplace.slice(faceStart, faceStart + 3).every((flag) => flag === 1);
    const vector = Array.from(data.normals.slice(index * 3, index * 3 + 3));
    if (faceGpu) {
      assert.deepEqual(vector, [0, 0, 1]);
    } else {
      assert.ok(vector.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-6);
    }
  }
  for (let index = 0; index < data.gpuDisplace.length; index += 3) {
    assert.ok(
      data.gpuDisplace
        .slice(index, index + 3)
        .every((value) => value >= 0 === data.gpuDisplace[index] >= 0),
      'normal shading domain is constant within each face, including pinned boundaries',
    );
  }
});

test('GPU rough cap interior without physical boundary does not sample the CPU morphology field', () => {
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
      edges: [],
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

test('GPU rough caps retain mixed displacement triangles at pinned adaptive boundaries', () => {
  const appearance = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.5,
    meanHeight: 0.3,
    etchDepth: 0.3,
    featureCv: 0.2,
    heightCv: 0.1,
    seed: 21,
  };
  const zoneFor = (triangle, triangleBudget) => ({
    baseTriangles: [triangle],
    edges: roughBoundaryEdgesFromTriangles([triangle]),
    maxEdge: Math.SQRT2,
    triangleBudget,
    lodContext: {
      distance: 10,
      viewportWidth: 800,
      viewportHeight: 600,
      pixelRatio: 1,
      fovDegrees: 34,
      visibleFraction: 1,
      roiFraction: 1,
      screenPriority: 1,
      maxDepth: 2,
    },
  });
  const data = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    gpuDisplacement: true,
    closeToIdeal: true,
    lodZones: [zoneFor(squareTriangles[0], 16), zoneFor(squareTriangles[1], 1)],
  });
  assert.ok(data.metadata.roughLodStitchCount > 0);
  assert.ok(data.gpuDisplace.some((value) => value === 1));
  assert.ok(data.gpuDisplace.some((value) => value === 0));
  let hasMixedTriangle = false;
  for (let i = 0; i < data.gpuDisplace.length; i += 3) {
    const flags = [...data.gpuDisplace.slice(i, i + 3)];
    if (flags.includes(0) && flags.includes(1)) hasMixedTriangle = true;
    flags.forEach((flag, localIndex) => {
      if (flag === 1) assert.equal(data.positions[(i + localIndex) * 3 + 2], 0);
    });
  }
  assert.ok(
    hasMixedTriangle,
    'cap triangles must join pinned boundary and shader-displaced interior vertices',
  );
});

test('rough physical sidewall borders are emitted without duplicated closure skirts', () => {
  const appearance = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 0.5,
    meanHeight: 0.2,
    etchDepth: 0.2,
    featureCv: 0,
    heightCv: 0,
    seed: 10,
  };
  const baseTriangles = squareTriangles;
  const edges = roughBoundaryEdgesFromTriangles(baseTriangles);
  const zone = {
    baseTriangles,
    edges,
    maxEdge: Math.SQRT2,
    triangleBudget: 2,
    lodContext: {
      distance: 1000,
      viewportWidth: 100,
      viewportHeight: 100,
      maxDepth: 0,
    },
  };
  const baseline = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    closeToIdeal: true,
    lodZones: [zone],
  });
  const physical = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    closeToIdeal: true,
    lodZones: [zone],
    sidewallBoundaryIntervals: [
      {
        key: edges[0].key,
        t0: edges[0].line.t0,
        t1: edges[0].line.t1,
      },
    ],
  });
  assert.equal(physical.roughBorderPositions.length, baseline.roughBorderPositions.length);
  assert.equal(baseline.positions.length - physical.positions.length, 18);
});

test('unequal LOD caps conform their common edge without vertical seam sheets', () => {
  const appearance = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.5,
    meanHeight: 0.3,
    etchDepth: 0.3,
    featureCv: 0.2,
    heightCv: 0.1,
    seed: 21,
  };
  const data = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    closeToIdeal: false,
    lodZones: squareTriangles.map((triangle, index) => ({
      baseTriangles: [triangle],
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      maxEdge: Math.SQRT2,
      triangleBudget: index ? 1 : 16,
      lodContext: {
        distance: 10,
        viewportWidth: 800,
        viewportHeight: 600,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 1,
        maxDepth: 2,
      },
    })),
  });
  let verticalSheets = 0,
    projectedArea = 0;
  for (let i = 0; i < data.positions.length; i += 9) {
    const p = data.positions.slice(i, i + 9);
    const area = ((p[3] - p[0]) * (p[7] - p[1]) - (p[4] - p[1]) * (p[6] - p[0])) / 2;
    if (Math.abs(area) < 1e-12) verticalSheets++;
    projectedArea += area;
  }
  assert.equal(
    verticalSheets,
    0,
    'LOD joins must refine boundary triangles instead of vertical curtains',
  );
  assert.ok(
    Math.abs(projectedArea - 1) < 1e-7,
    'conforming mesh preserves projected physical area',
  );
});

function assertCapBoundaryPaired(data) {
  const pointKey = (p, flag = 0) => [...p, flag].join(','),
    edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`),
    edges = new Map(),
    boundary = new Set();
  for (let index = 0; index < data.roughBoundaryPositions.length; index += 6) {
    boundary.add(
      edgeKey(
        pointKey(data.roughBoundaryPositions.slice(index, index + 3)),
        pointKey(data.roughBoundaryPositions.slice(index + 3, index + 6)),
      ),
    );
  }
  for (let index = 0; index < data.positions.length; index += 9) {
    const vertices = [0, 1, 2].map((vertex) =>
      pointKey(
        data.positions.slice(index + vertex * 3, index + vertex * 3 + 3),
        data.gpuDisplace[index / 3 + vertex] || 0,
      ),
    );
    for (let edge = 0; edge < 3; edge++) {
      const key = edgeKey(vertices[edge], vertices[(edge + 1) % 3]);
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const unmatched = [...edges].filter(
    ([key, count]) => count !== 2 && !(count === 1 && boundary.has(key)),
  );
  assert.deepEqual(unmatched, [], 'all nonphysical cap edges must have an identical paired edge');
  assert.equal([...edges].filter(([, count]) => count === 1).length, boundary.size);
}

test('partial unequal LOD seams have no unpaired edges in CPU and GPU meshes', () => {
  const appearance = {
      kind: 'rough',
      morphology: 'stochastic',
      polarity: 'inverted',
      featureSize: 0.37,
      meanHeight: 0.2,
      etchDepth: 0.3,
      featureCv: 0.2,
      heightCv: 0.1,
      seed: 21,
    },
    m = [0.5, 0.5, 0],
    triangles = [squareTriangles[0], [a, m, d], [m, c, d]],
    lodZones = triangles.map((triangle, index) => ({
      baseTriangles: [triangle],
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      maxEdge: Math.SQRT2,
      triangleBudget: [16, 1, 4][index],
      lodContext: {
        distance: 10,
        viewportWidth: 800,
        viewportHeight: 600,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 1,
        maxDepth: 2,
      },
    }));
  for (const gpuDisplacement of [false, true]) {
    const data = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      closeToIdeal: false,
      gpuDisplacement,
      lodZones,
    });
    assertCapBoundaryPaired(data);
    assert.ok(data.metadata.roughConformingExtraTriangles > 0);
    assert.ok(data.metadata.roughConformingExtraTriangles < 30);
  }
});

test('curved ring caps have matching actual boundary segments after adaptive subdivision', async () => {
  const THREE = await import('three'),
    appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 0.37,
      meanHeight: 0.2,
      etchDepth: 0.2,
      featureCv: 0.2,
      heightCv: 0.1,
      seed: 21,
    };
  const { roughCapBaseTriangles } = await import('../rough-mesh-geometry.js');
  const ring = (radius) =>
      Array.from({ length: 17 }, (_, i) => [
        0.123 + radius * Math.cos((i * Math.PI) / 8),
        -0.31 + radius * Math.sin((i * Math.PI) / 8),
      ]),
    polys = [[ring(2), ring(1).reverse()]],
    base = roughCapBaseTriangles(THREE, 0, 1, polys),
    lodZones = base.triangles.map((triangle, index) => ({
      baseTriangles: [triangle],
      edges: roughBoundaryEdgesFromTriangles([triangle]),
      maxEdge: base.maxEdge,
      triangleBudget: index % 2 ? 1 : 16,
      lodContext: {
        distance: 10,
        viewportWidth: 800,
        viewportHeight: 600,
        pixelRatio: 1,
        fovDegrees: 34,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 1,
        maxDepth: 2,
      },
    })),
    data = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      closeToIdeal: false,
      gpuDisplacement: true,
      lodZones,
    });
  assertCapBoundaryPaired(data);
});

test('zero-height rough skirts omit degenerate Float32 closure triangles', () => {
  const appearance = {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 1,
      meanHeight: 0.2,
      etchDepth: 0.2,
      featureCv: 0,
      heightCv: 0,
      seed: 1,
    },
    data = roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      closeToIdeal: true,
      lodZones: [
        {
          baseTriangles: squareTriangles,
          maxEdge: Math.SQRT2,
          edges: roughBoundaryEdgesFromTriangles(squareTriangles),
          triangleBudget: 8,
          lodContext: {
            maxDepth: 1,
            distance: 1,
            viewportWidth: 800,
            viewportHeight: 600,
            visibleFraction: 1,
            roiFraction: 1,
            screenPriority: 1,
          },
        },
      ],
    });
  assert.ok(data.metadata.roughSkippedDegenerateTriangles > 0);
  for (let index = 0; index < data.positions.length; index += 9) {
    const p = data.positions.slice(index, index + 9),
      ab = [p[3] - p[0], p[4] - p[1], p[5] - p[2]],
      ac = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    assert.ok(
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) > 0,
    );
  }
});
