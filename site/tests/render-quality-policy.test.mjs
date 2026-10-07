import assert from 'node:assert/strict';
import test from 'node:test';
import { threeRenderPolicy } from '../render-quality-policy.js';
import { adaptiveRoughMeshLod, roughSceneTriangleBudget } from '../surface-rendering.js';
import { roughMeshDataFromPreparedCap } from '../rough-mesh-geometry.js';

test('Fast is the default; Interactive overrides both preferences with progressively smaller budgets', () => {
  assert.equal(threeRenderPolicy().mode, 'fast');
  const quality = threeRenderPolicy({ fast: false }),
    fast = threeRenderPolicy(),
    interactive = threeRenderPolicy({ fast: false, interactive: true });
  assert.equal(interactive.mode, 'interactive');
  assert.equal(threeRenderPolicy({ interactive: true }), interactive);
  for (const key of [
    'triangleBudget',
    'roughnessDetail',
    'interfaceDetail',
    'maxDepth',
    'sidewallSegments',
    'maxPixelRatio',
  ]) {
    assert.ok(interactive[key] < fast[key] && fast[key] < quality[key], key);
  }
  const input = {
    triangleCount: 2,
    maxEdge: 40,
    featureSize: 0.2,
    distance: 50,
    viewportWidth: 1000,
    viewportHeight: 800,
    visibleFraction: 1,
  };
  const baseBudget = roughSceneTriangleBudget(input);
  const levels = [quality, fast, interactive].map((policy) =>
    adaptiveRoughMeshLod({
      ...input,
      roughnessDetail: policy.roughnessDetail,
      maxDepth: policy.maxDepth,
      triangleBudget: Math.floor(baseBudget * policy.triangleBudget),
    }),
  );
  assert.ok(levels[1].estimatedTriangles < levels[0].estimatedTriangles);
  assert.ok(levels[2].estimatedTriangles < levels[1].estimatedTriangles);
});

test('cheap normals retain the exact sampled profile, boundaries and mesh ownership', () => {
  const appearance = {
    kind: 'rough',
    morphology: 'pyramid',
    featureSize: 0.35,
    meanHeight: 0.4,
    etchDepth: 0.6,
    polarity: 'normal',
    seed: 42,
    featureCv: 0.2,
    heightCv: 0.2,
  };
  const input = {
    z: 3,
    normal: 1,
    appearance,
    closeToIdeal: true,
    lodZones: [
      {
        baseTriangles: [
          [
            [0, 0, 3],
            [2, 0, 3],
            [2, 2, 3],
          ],
          [
            [0, 0, 3],
            [2, 2, 3],
            [0, 2, 3],
          ],
        ],
        maxEdge: 3,
        lodContext: { distance: 10, viewportWidth: 600, viewportHeight: 600, maxDepth: 3 },
        triangleBudget: 128,
      },
    ],
  };
  const quality = roughMeshDataFromPreparedCap(input),
    fast = roughMeshDataFromPreparedCap({ ...input, analyticNormals: false });
  assert.deepEqual(fast.positions, quality.positions);
  assert.deepEqual(fast.metadata, quality.metadata);
  assert.deepEqual(fast.roughBorderPositions, quality.roughBorderPositions);
  assert.equal(fast.normals.length, fast.positions.length);
  assert.ok([...fast.normals].every(Number.isFinite));
});
