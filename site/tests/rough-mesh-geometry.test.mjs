import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const {
  geometryFromRoughCap,
  geometryFromRoughMeshData,
  roughBoundaryEdgesFromTriangles,
  roughEdgeSamplesInInterval,
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

test('software CPU rough mesh preserves physical height at Float32 vertices within 2e-5 um', async () => {
  const { roughProfileOffsetAtPoint } = await import('../surface-rendering.js');
  const appearance = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'normal',
    featureSize: 0.7,
    meanHeight: 0.35,
    etchDepth: 0.9,
    featureCv: 0.25,
    heightCv: 0.3,
    seed: 20261015,
    sampleOrigin: [0.37, -0.19],
  };
  const mesh = roughMeshDataFromPreparedCap({
    z: 0,
    normal: 1,
    appearance,
    gpuDisplacement: false,
    closeToIdeal: false,
    lodZones: [
      {
        baseTriangles: squareTriangles,
        maxEdge: Math.SQRT2,
        edges: roughBoundaryEdgesFromTriangles(squareTriangles),
        triangleBudget: 256,
        lodContext: { distance: 2, viewportWidth: 1100, viewportHeight: 800, maxDepth: 3 },
      },
    ],
  });
  assert.ok(mesh.positions.length > 0);
  assert.equal(mesh.gpuDisplace.length, 0);
  let maxError = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i],
      y = mesh.positions[i + 1],
      z = mesh.positions[i + 2];
    maxError = Math.max(maxError, Math.abs(z - roughProfileOffsetAtPoint(x, y, appearance)));
  }
  assert.ok(maxError < 2e-5, `Float32 CPU displacement parity exceeded: ${maxError} um`);
});

test('coarse display filtering keeps CPU/GPU rough boundaries and sidewall ownership identical', async () => {
  const { roughDisplayProfileOffsetAtPoint } = await import('../surface-rendering.js');
  const appearance = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'normal',
    featureSize: 0.3,
    meanHeight: 0.5,
    etchDepth: 0.9,
    featureCv: 0.25,
    heightCv: 0.3,
    seed: 20261015,
    displayRoughBlend: 0.12,
  };
  const task = {
    z: 2,
    normal: 1,
    profileNormal: 1,
    appearance,
    closeToIdeal: true,
    lodZones: [
      {
        baseTriangles: squareTriangles,
        edges: roughBoundaryEdgesFromTriangles(squareTriangles),
        maxEdge: Math.SQRT2,
        triangleBudget: 256,
        lodContext: { distance: 2, viewportWidth: 1100, viewportHeight: 800, maxDepth: 3 },
      },
    ],
  };
  const cpu = roughMeshDataFromPreparedCap({
    ...task,
    gpuDisplacement: false,
    analyticNormals: true,
  });
  const gpu = roughMeshDataFromPreparedCap({
    ...task,
    gpuDisplacement: true,
    analyticNormals: false,
  });
  assert.deepEqual(cpu.roughBoundaryPositions, gpu.roughBoundaryPositions);
  assert.deepEqual(cpu.roughBorderPositions, gpu.roughBorderPositions);
  for (let i = 0; i < cpu.roughBoundaryPositions.length; i += 3) {
    const x = cpu.roughBoundaryPositions[i],
      y = cpu.roughBoundaryPositions[i + 1],
      z = cpu.roughBoundaryPositions[i + 2],
      expected = Math.fround(task.z + roughDisplayProfileOffsetAtPoint(x, y, appearance));
    assert.ok(Math.abs(z - expected) < 1e-6);
  }
  assert.deepEqual(
    roughMeshDataFromPreparedCap({ ...task, gpuDisplacement: false }).positions,
    cpu.positions,
  );
});

test('sorted rough-edge interval lookup exactly preserves inclusive and strict LOD sampling', () => {
  const samples = Array.from({ length: 65 }, (_, i) => [(i - 32) / 16, ['point', i]]);
  samples.splice(33, 0, [1 / 16, ['duplicate', 33]]);
  const queryValues = [-3, -2, -1, -0.5, -1e-10, 0, 1e-10, 1 / 16, 0.5, 1.375, 2, 3];
  for (const t0 of queryValues) {
    for (const t1 of queryValues) {
      for (const interior of [false, true]) {
        const epsilon = 1e-10;
        const expected = samples.filter(([t]) =>
          interior
            ? t > Math.min(t0, t1) + epsilon && t < Math.max(t0, t1) - epsilon
            : t >= Math.min(t0, t1) - epsilon && t <= Math.max(t0, t1) + epsilon,
        );
        assert.deepEqual(
          roughEdgeSamplesInInterval(samples, t0, t1, { interior }),
          expected,
          `different LOD boundary samples for ${t0}..${t1}, interior=${interior}`,
        );
      }
    }
  }
  assert.deepEqual(roughEdgeSamplesInInterval([], 0, 1), []);
  assert.deepEqual(roughEdgeSamplesInInterval(undefined, 0, 1), []);
});

test('repeated rough cap vertices retain height, mesh-smoothed normals, and cap-local determinism', async () => {
  const { roughProfileOffsetAtPoint } = await import('../surface-rendering.js');
  for (const morphology of ['stochastic', 'pyramid']) {
    for (const normal of [-1, 1]) {
      const appearance = {
        kind: 'rough',
        morphology,
        polarity: 'normal',
        featureSize: 0.2,
        meanHeight: 0.15,
        etchDepth: 0.3,
        featureCv: 0.1,
        heightCv: 0.1,
        seed: 42,
      };
      const task = {
        z: 0,
        normal,
        profileNormal: normal,
        appearance,
        gpuDisplacement: false,
        closeToIdeal: false,
        lodZones: [
          {
            baseTriangles: squareTriangles,
            edges: roughBoundaryEdgesFromTriangles(squareTriangles),
            maxEdge: Math.SQRT2,
            triangleBudget: 256,
            lodContext: { distance: 1, viewportWidth: 1000, viewportHeight: 600, maxDepth: 3 },
          },
        ],
      };
      const result = roughMeshDataFromPreparedCap(task);
      const repeatedVertices = new Map();
      let repeatedCount = 0;
      for (let i = 0; i < result.positions.length; i += 3) {
        const x = result.positions[i],
          y = result.positions[i + 1],
          height = result.positions[i + 2],
          key = `${x},${y}`,
          sample = [...result.positions.slice(i, i + 3), ...result.normals.slice(i, i + 3)];
        assert.ok(
          Math.abs(height - Math.fround(normal * roughProfileOffsetAtPoint(x, y, appearance))) <
            2e-5,
        );
        if (repeatedVertices.has(key)) {
          repeatedCount++;
          assert.deepEqual(sample, repeatedVertices.get(key));
        } else {
          repeatedVertices.set(key, sample);
        }
        assert.ok(Math.abs(Math.hypot(...result.normals.slice(i, i + 3)) - 1) < 1e-6);
      }
      assert.ok(repeatedCount > 0, 'fixture must have adjacent triangles sharing samples');
      const repeat = roughMeshDataFromPreparedCap(task);
      assert.deepEqual(repeat.positions, result.positions);
      assert.deepEqual(repeat.normals, result.normals);
      const differentSeed = roughMeshDataFromPreparedCap({
        ...task,
        appearance: { ...appearance, seed: appearance.seed + 1 },
      });
      assert.notDeepEqual(differentSeed.positions, result.positions);
    }
  }
});

test('photodetector rough shading normals agree with rendered Float32 cap faces', async () => {
  const { readFile } = await import('node:fs/promises');
  const stored = JSON.parse(
    await readFile(
      new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url),
      'utf8',
    ),
  );
  const model = stored.model;
  const appearance = model.regions
    .flatMap((region) => region.stack.flatMap((layer) => [layer.frontSurface, layer.backSurface]))
    .find((surface) => surface?.kind === 'rough');
  assert.equal(appearance.featureSize, 0.3);
  const z = 174.3,
    width = 100,
    base = [
      [
        [0, 0, z],
        [width, 0, z],
        [width, width, z],
      ],
      [
        [0, 0, z],
        [width, width, z],
        [0, width, z],
      ],
    ],
    options = {
      z,
      normal: 1,
      appearance,
      gpuDisplacement: false,
      closeToIdeal: false,
      lodZones: [
        {
          baseTriangles: base,
          edges: roughBoundaryEdgesFromTriangles(base),
          maxEdge: Math.SQRT2 * width,
          triangleBudget: 20000,
          lodContext: {
            distance: width,
            viewportWidth: 1300,
            viewportHeight: 800,
            roughnessDetail: 1,
            maxDepth: 10,
          },
        },
      ],
    },
    smooth = roughMeshDataFromPreparedCap({ ...options, analyticNormals: true }),
    flat = roughMeshDataFromPreparedCap({ ...options, analyticNormals: false });
  assert.deepEqual(smooth.positions, flat.positions);
  assert.deepEqual(smooth.roughBoundaryPositions, flat.roughBoundaryPositions);
  assert.deepEqual(smooth.metadata, flat.metadata);
  let reversed = 0;
  for (let i = 0; i < smooth.positions.length; i += 9) {
    const p = smooth.positions.slice(i, i + 3),
      q = smooth.positions.slice(i + 3, i + 6),
      r = smooth.positions.slice(i + 6, i + 9),
      u = q.map((value, index) => value - p[index]),
      v = r.map((value, index) => value - p[index]),
      cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      faceLength = Math.hypot(...cross);
    assert.ok(faceLength > 0);
    for (let vertex = 0; vertex < 3; vertex++) {
      const n = smooth.normals.slice(i + 3 * vertex, i + 3 * vertex + 3);
      assert.ok(n.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6);
      if (cross.reduce((sum, value, index) => sum + value * n[index], 0) < 0) reversed++;
    }
  }
  assert.equal(reversed, 0, 'LOD normals may not face behind their displayed cap triangles');
});

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
  assert.equal(geometry.userData.roughBorderPositions.length, 0);
  assert.equal(geometry.userData.roughBoundaryPositions.length, 24);
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

  assert.equal(
    exposed.roughBorderPositions.length,
    0,
    'a cosmetic rough patch has no structural border',
  );
  assert.ok(exposed.roughBoundaryPositions.length > 0, 'mesh boundary profiles remain available');
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
  assert.equal(baseline.roughBorderPositions.length, 0);
  assert.ok(physical.roughBorderPositions.length > 0, 'a true sidewall must retain its outline');
  assert.ok(
    physical.roughBorderPositions.length < physical.roughBoundaryPositions.length,
    'an unrelated rough patch perimeter must remain unoutlined',
  );
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

test('separated metal mesas do not acquire a false rough-cap bridge across their gap', () => {
  // This presentation proxy matches two metal rectangles separated by a rough
  // substrate. The uncovered gap is an artificial rough spatial zone, not a
  // material sidewall; reducing the ROI cannot turn it into a physical edge.
  const appearance = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 0.37,
    meanHeight: 0.2,
    etchDepth: 0.2,
    featureCv: 0,
    heightCv: 0,
    seed: 21,
  };
  const zone = (left, right) => {
    const lowLeft = [left, -1, 0],
      lowRight = [right, -1, 0],
      highRight = [right, 1, 0],
      highLeft = [left, 1, 0],
      baseTriangles = [
        [lowLeft, lowRight, highRight],
        [lowLeft, highRight, highLeft],
      ];
    return {
      baseTriangles,
      edges: roughBoundaryEdgesFromTriangles(baseTriangles),
      maxEdge: Math.hypot(right - left, 2),
      triangleBudget: 2,
      lodContext: { distance: 1000, viewportWidth: 320, viewportHeight: 240, maxDepth: 0 },
    };
  };
  const render = (zoneInput, physical = false, gpuDisplacement = false) =>
    roughMeshDataFromPreparedCap({
      z: 0,
      normal: 1,
      appearance,
      lodZones: [zoneInput],
      closeToIdeal: true,
      gpuDisplacement,
      sidewallBoundaryIntervals: physical
        ? zoneInput.edges.map((edge) => ({
            key: edge.key,
            t0: edge.line.t0,
            t1: edge.line.t1,
          }))
        : [],
    });
  const leftMetal = render(zone(-3, -1), true),
    rightMetal = render(zone(1, 3), true),
    gapFull = render(zone(-1, 1)),
    gapRoi = render(zone(-1, 0));
  assert.ok(leftMetal.roughBorderPositions.length > 0);
  assert.ok(rightMetal.roughBorderPositions.length > 0);
  assert.equal(gapFull.roughBorderPositions.length, 0);
  assert.equal(gapRoi.roughBorderPositions.length, 0);
  assert.ok(gapFull.roughBoundaryPositions.length > 0);
  assert.ok(gapRoi.roughBoundaryPositions.length > 0);
  const visible = [...leftMetal.roughBorderPositions, ...rightMetal.roughBorderPositions];
  for (let index = 0; index < visible.length; index += 3) {
    assert.ok(
      visible[index] <= -1 || visible[index] >= 1,
      `false rough outline entered the gap at x=${visible[index]}`,
    );
  }
  const gpuGap = render(zone(-1, 1), false, true);
  assert.deepEqual(gpuGap.roughBorderPositions, gapFull.roughBorderPositions);
  assert.deepEqual(gpuGap.roughBoundaryPositions, gapFull.roughBoundaryPositions);
});
