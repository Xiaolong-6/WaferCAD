import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel } = await import('../model.js');
const { appearanceSurfaceGroups } = await import('../model-view-geometry.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');
const { STRUCTURE_PALETTES } = await import('../controllers/layer-legend-controller.js');
const {
  adaptiveRoughMeshLod,
  allocateRoughTriangleBudgets,
  projectedPixelsPerUnit,
  roughSceneTriangleBudget,
  roughLod,
  roughNoise1D,
  roughProfileOffsetAtPoint,
} = await import('../surface-rendering.js');
const {
  createSectionZTransform,
  defaultSectionCollapse,
  defaultSectionCollapseForModel,
  niceSectionTicks,
  normalizeSectionCollapse,
  resolveSectionCollapse,
  sectionCollapseSnapValues,
  translateSectionCollapse,
} = await import('../section-z-collapse.js');

test('Section collapse and surface rendering contracts', () => {
  for (const palette of Object.values(STRUCTURE_PALETTES)) assert.equal(palette.length, 20);

  const defaultCollapse = defaultSectionCollapse([-350, 30]);
  assert.ok(defaultCollapse.top > 0 && defaultCollapse.top < 30);
  assert.ok(defaultCollapse.bottom > -350 && defaultCollapse.bottom < -300);
  const normalizedCollapse = normalizeSectionCollapse({ top: 10, bottom: -330 }, [-350, 30]);
  assert.deepEqual(normalizedCollapse, { top: 10, bottom: -330 });
  const collapseWidth = normalizedCollapse.top - normalizedCollapse.bottom,
    translatedToTop = translateSectionCollapse(normalizedCollapse, 1000, [-350, 30]),
    translatedToBottom = translateSectionCollapse(normalizedCollapse, -1000, [-350, 30]);
  assert.ok(Math.abs(translatedToTop.top - 26.2) < 1e-9);
  assert.ok(Math.abs(translatedToBottom.bottom + 346.2) < 1e-9);
  assert.ok(Math.abs(translatedToTop.top - translatedToTop.bottom - collapseWidth) < 1e-9);
  assert.ok(Math.abs(translatedToBottom.top - translatedToBottom.bottom - collapseWidth) < 1e-9);
  const collapseTransform = createSectionZTransform({
    zMin: -380,
    zMax: 60,
    collapse: normalizedCollapse,
    plotTop: 10,
    plotHeight: 400,
    breakPixels: 8,
    upperFraction: 0.8,
  });
  assert.ok(collapseTransform.mapZ(30) < collapseTransform.mapZ(10));
  assert.ok(collapseTransform.mapZ(10) < collapseTransform.mapZ(-330));
  assert.ok(collapseTransform.mapZ(-330) < collapseTransform.mapZ(-350));
  assert.equal(Math.round(collapseTransform.lowerTop - collapseTransform.upperBottom), 8);
  assert.ok(niceSectionTicks(10, 30, 4).length >= 2);
  const collapseSnapModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  assert.ok(sectionCollapseSnapValues(collapseSnapModel, [-10, 0]).includes(-10));
  assert.ok(sectionCollapseSnapValues(collapseSnapModel, [-10, 0]).includes(0));
  const layeredCollapseModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(layeredCollapseModel, {
    type: 'add',
    name: 'Surface cap',
    thickness: 1,
    face: 'front',
    area: layeredCollapseModel.boundary,
    growth: 'direct',
  });
  const safeDefaultCollapse = defaultSectionCollapseForModel(layeredCollapseModel, [-5, 6]);
  assert.ok(safeDefaultCollapse.top < 5, 'default collapse must stay inside Base bulk');
  assert.ok(safeDefaultCollapse.bottom > -5, 'default collapse must preserve the Base bottom');
  assert.deepEqual(resolveSectionCollapse(null, layeredCollapseModel, [-5, 6]), {
    ...normalizeSectionCollapse(safeDefaultCollapse, [-5, 6]),
    enabled: true,
  });

  assert.equal(roughLod(0).detail, 0);
  assert.equal(roughLod(20).micro, 1);
  assert.ok(
    projectedPixelsPerUnit({
      distance: 50,
      viewportHeight: 600,
      fovDegrees: 34,
      pixelRatio: 2,
    }) >
      projectedPixelsPerUnit({
        distance: 500,
        viewportHeight: 600,
        fovDegrees: 34,
        pixelRatio: 2,
      }),
  );
  const adaptiveNear = adaptiveRoughMeshLod({
      triangleCount: 2,
      maxEdge: 100,
      featureSize: 0.5,
      distance: 50,
      viewportWidth: 640,
      viewportHeight: 480,
      fovDegrees: 34,
      pixelRatio: 1,
      visibleFraction: 1,
      roiFraction: 1,
    }),
    adaptiveFar = adaptiveRoughMeshLod({
      triangleCount: 2,
      maxEdge: 100,
      featureSize: 0.5,
      distance: 5000,
      viewportWidth: 640,
      viewportHeight: 480,
      fovDegrees: 34,
      pixelRatio: 1,
      visibleFraction: 1,
      roiFraction: 1,
    }),
    adaptiveBackground = adaptiveRoughMeshLod({
      triangleCount: 2,
      maxEdge: 100,
      featureSize: 0.5,
      distance: 50,
      viewportWidth: 640,
      viewportHeight: 480,
      fovDegrees: 34,
      pixelRatio: 1,
      visibleFraction: 0.04,
      roiFraction: 1,
      screenPriority: 0.06,
    }),
    adaptiveRoi = adaptiveRoughMeshLod({
      triangleCount: 2,
      maxEdge: 100,
      featureSize: 0.5,
      distance: 50,
      viewportWidth: 640,
      viewportHeight: 480,
      fovDegrees: 34,
      pixelRatio: 1,
      visibleFraction: 1,
      roiFraction: 0.05,
    });
  assert.ok(adaptiveNear.depth > adaptiveFar.depth);
  assert.ok(adaptiveBackground.maxTriangles < adaptiveNear.maxTriangles);
  assert.ok(adaptiveRoi.maxTriangles > adaptiveNear.maxTriangles);
  const sceneBudget = roughSceneTriangleBudget({
      viewportWidth: 1200,
      viewportHeight: 800,
      pixelRatio: 2,
      roiFraction: 1,
    }),
    allocatedBudgets = allocateRoughTriangleBudgets(
      [
        { baseTriangles: 100, desiredTriangles: 500000, priority: 1 },
        { baseTriangles: 100, desiredTriangles: 500000, priority: 0.06 },
        { baseTriangles: 100, desiredTriangles: 500000, priority: 0.3 },
      ],
      { totalBudget: sceneBudget },
    );
  assert.ok(sceneBudget <= 900000);
  assert.ok(allocatedBudgets.reduce((sum, value) => sum + value, 0) <= sceneBudget);
  assert.ok(allocatedBudgets[0] > allocatedBudgets[1]);
  assert.ok(allocatedBudgets.every((value) => value >= 100));

  const partialSidewallModel = {
    width: 2,
    height: 2,
    layers: [
      { id: 'left', name: 'Left', color: '#777777' },
      { id: 'right', name: 'Right', color: '#999999' },
    ],
    regions: [
      {
        id: 'left-region',
        geom: [
          [
            [
              [-1, -1],
              [0, -1],
              [0, 1],
              [-1, 1],
              [-1, -1],
            ],
          ],
        ],
        stack: [{ layerId: 'left', z0: 0, z1: 1 }],
      },
      {
        id: 'right-region',
        geom: [
          [
            [
              [0, -1],
              [1, -1],
              [1, 1],
              [0, 1],
              [0, 0],
              [0, -1],
            ],
          ],
        ],
        stack: [{ layerId: 'right', z0: 0, z1: 2 }],
      },
    ],
  };
  const partialSidewallPlan = buildRenderSurfacePlan(partialSidewallModel),
    sharedSidewallParts = partialSidewallPlan.sidewalls.filter(
      (part) => Math.abs(part.p[0]) < 1e-12 && Math.abs(part.q[0]) < 1e-12,
    ),
    sharedSidewallLengths = new Map();
  for (const part of sharedSidewallParts) {
    const key = `${part.z0}:${part.z1}:${part.ownership}`,
      length = Math.hypot(part.q[0] - part.p[0], part.q[1] - part.p[1]);
    sharedSidewallLengths.set(key, (sharedSidewallLengths.get(key) || 0) + length);
  }
  assert.deepEqual([...sharedSidewallLengths].sort(), [
    ['0:1:interface', 2],
    ['1:2:exterior', 2],
  ]);
  const sharedVerticalBorders = partialSidewallPlan.borderLines
    .filter(
      ([a, b]) =>
        Math.abs(a[0]) < 1e-12 &&
        Math.abs(b[0]) < 1e-12 &&
        Math.abs(Math.abs(a[1]) - 1) < 1e-12 &&
        Math.abs(a[1] - b[1]) < 1e-12,
    )
    .map(([a, b]) => [Math.min(a[2], b[2]), Math.max(a[2], b[2])])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(sharedVerticalBorders, [
    [1, 2],
    [1, 2],
  ]);
  const roughNoiseSample = roughNoise1D(1.25, { featureSize: 0.5, seed: 42 });
  assert.equal(roughNoiseSample, roughNoise1D(1.25, { featureSize: 0.5, seed: 42 }));
  assert.notEqual(roughNoiseSample, roughNoise1D(1.25, { featureSize: 0.5, seed: 43 }));

  const roughAppearance = {
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.5,
    meanHeight: 0.4,
    featureCv: 0.25,
    heightCv: 0.25,
    etchDepth: 0.8,
    seed: 42,
    profileId: 'rough-test',
  };

  const appearanceGroupModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 }),
    appearanceGroupRegion = appearanceGroupModel.regions[0],
    appearanceGroupSegment = appearanceGroupRegion.stack[0];
  appearanceGroupModel.regions = [
    {
      ...appearanceGroupRegion,
      stack: [
        {
          ...appearanceGroupSegment,
          frontSurface: { kind: 'rough', ...roughAppearance, polarity: 'inverted' },
        },
      ],
    },
    {
      ...appearanceGroupRegion,
      stack: [
        {
          ...appearanceGroupSegment,
          frontSurface: { kind: 'rough', ...roughAppearance, polarity: 'normal' },
        },
      ],
    },
    {
      ...appearanceGroupRegion,
      stack: [
        {
          ...appearanceGroupSegment,
          frontSurface: { kind: 'rough', ...roughAppearance, etchDepth: 0.6 },
        },
      ],
    },
  ];
  assert.equal(appearanceSurfaceGroups(appearanceGroupModel).length, 3);
  const roughProfileSample = roughProfileOffsetAtPoint(1.25, -0.75, roughAppearance);
  assert.equal(roughProfileSample, roughProfileOffsetAtPoint(1.25, -0.75, roughAppearance));
  assert.ok(roughProfileSample >= -1e-12);
  assert.ok(roughProfileSample <= roughAppearance.etchDepth + 1e-12);
  const normalProfileSample = roughProfileOffsetAtPoint(1.25, -0.75, {
    ...roughAppearance,
    polarity: 'normal',
  });
  assert.ok(Math.abs(normalProfileSample + roughProfileSample - roughAppearance.etchDepth) < 1e-12);
  const zeroCvAppearance = { ...roughAppearance, featureCv: 0, heightCv: 0 };
  assert.equal(
    roughProfileOffsetAtPoint(1.25, -0.75, zeroCvAppearance),
    zeroCvAppearance.meanHeight,
  );
  const pyramidAppearance = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 2,
    meanHeight: 0.8,
    featureCv: 0,
    heightCv: 0,
    etchDepth: 1,
    seed: 7,
    profileId: 'pyramid-test',
  };
  assert.equal(roughProfileOffsetAtPoint(0, 0, pyramidAppearance), 0.8);
  assert.equal(roughProfileOffsetAtPoint(1, 0, pyramidAppearance), 0);
  assert.ok(
    Math.abs(
      roughProfileOffsetAtPoint(0, 0, { ...pyramidAppearance, polarity: 'inverted' }) - 0.2,
    ) < 1e-12,
  );
  assert.equal(roughProfileOffsetAtPoint(1, 0, { ...pyramidAppearance, polarity: 'inverted' }), 1);
  for (const [x, y] of [
    [0, 0],
    [0.25, 0.4],
    [0.8, -0.3],
    [1, 1],
  ]) {
    const normal = roughProfileOffsetAtPoint(x, y, pyramidAppearance),
      inverted = roughProfileOffsetAtPoint(x, y, {
        ...pyramidAppearance,
        polarity: 'inverted',
      });
    assert.ok(Math.abs(normal + inverted - pyramidAppearance.etchDepth) < 1e-12);
  }

  const randomPyramidAppearance = {
    ...pyramidAppearance,
    featureCv: 0.3,
    heightCv: 0.25,
    seed: 2018,
  };
  const randomPyramidSamples = [
    [0.13, 0.21],
    [0.91, -0.42],
    [2.37, 1.14],
    [-1.55, 3.08],
  ].map(([x, y]) => roughProfileOffsetAtPoint(x, y, randomPyramidAppearance));
  assert.deepEqual(
    randomPyramidSamples,
    [
      [0.13, 0.21],
      [0.91, -0.42],
      [2.37, 1.14],
      [-1.55, 3.08],
    ].map(([x, y]) => roughProfileOffsetAtPoint(x, y, randomPyramidAppearance)),
    'Random pyramid morphology must be deterministic for a fixed seed',
  );
  assert.notDeepEqual(
    randomPyramidSamples,
    [
      [0.13, 0.21],
      [0.91, -0.42],
      [2.37, 1.14],
      [-1.55, 3.08],
    ].map(([x, y]) => roughProfileOffsetAtPoint(x, y, { ...randomPyramidAppearance, seed: 2019 })),
    'Changing the pyramid seed must change the reconstructed morphology',
  );
  for (const [x, y] of [
    [0.13, 0.21],
    [0.91, -0.42],
    [2.37, 1.14],
  ]) {
    const normal = roughProfileOffsetAtPoint(x, y, randomPyramidAppearance),
      inverted = roughProfileOffsetAtPoint(x, y, {
        ...randomPyramidAppearance,
        polarity: 'inverted',
      });
    assert.ok(Math.abs(normal + inverted - randomPyramidAppearance.etchDepth) < 1e-12);
  }
});
