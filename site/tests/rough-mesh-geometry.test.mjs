import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const {
  geometryFromRoughCap,
  roughBoundaryEdgesFromTriangles,
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
