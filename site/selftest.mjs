import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vendorSource = readFileSync(
  new URL('./vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const vg = await import('./vector-geometry.js');
const modelApi = await import('./model.js');
const { appearanceSurfaceGroups, implantSectionBands, implantSolids } =
  await import('./model-view-geometry.js');
const { buildRenderSurfacePlan } = await import('./renderer-geometry.js');
const { parseGDS, flattenGDS, makeDemoLayout } = await import('./gds.js');
const { STRUCTURE_PALETTES } = await import('./controllers/layer-legend-controller.js');
const { validateProjectFile } = await import('./project-schema.js');
const {
  adaptiveRoughMeshLod,
  allocateRoughTriangleBudgets,
  projectedPixelsPerUnit,
  roughSceneTriangleBudget,
  roughLod,
  roughNoise1D,
  roughProfileOffsetAtPoint,
  roughVisualBoundsZ,
} = await import('./surface-rendering.js');
const {
  createSectionZTransform,
  defaultSectionCollapse,
  defaultSectionCollapseForModel,
  niceSectionTicks,
  normalizeSectionCollapse,
  resolveSectionCollapse,
  sectionCollapseSnapValues,
  translateSectionCollapse,
} = await import('./section-z-collapse.js');
const { applyOperation, createModel, layerById, recolorLayer, renameLayer, surfaceSegment } =
  modelApi;
const {
  circleMulti,
  difference,
  intersection,
  isEmpty,
  pointInMulti,
  rectMulti,
  unionGeometries,
} = vg;

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}

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
assert.equal(
  Math.round(collapseTransform.lowerTop - collapseTransform.upperBottom),
  8,
);
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
assert.deepEqual(
  resolveSectionCollapse(null, layeredCollapseModel, [-5, 6]),
  normalizeSectionCollapse(safeDefaultCollapse, [-5, 6]),
);

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
assert.equal(
  roughProfileSample,
  roughProfileOffsetAtPoint(1.25, -0.75, roughAppearance),
);
assert.ok(roughProfileSample >= -1e-12);
assert.ok(roughProfileSample <= roughAppearance.etchDepth + 1e-12);
const normalProfileSample = roughProfileOffsetAtPoint(1.25, -0.75, {
  ...roughAppearance,
  polarity: 'normal',
});
assert.ok(
  Math.abs(normalProfileSample + roughProfileSample - roughAppearance.etchDepth) < 1e-12,
);
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
    roughProfileOffsetAtPoint(0, 0, { ...pyramidAppearance, polarity: 'inverted' }) - 0.2
  ) < 1e-12,
);
assert.equal(
  roughProfileOffsetAtPoint(1, 0, { ...pyramidAppearance, polarity: 'inverted' }),
  1,
);
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
  ].map(([x, y]) =>
    roughProfileOffsetAtPoint(x, y, { ...randomPyramidAppearance, seed: 2019 }),
  ),
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

const defaults = createModel();
assert.equal(defaults.width, 100000);
assert.equal(defaults.height, 100000);
assert.equal(defaults.units.xy, 'µm');
assert.equal(defaults.units.z, 'µm');
assert.equal(defaults.processRevision, 0);
assert.deepEqual(defaults.implants, []);
assert.equal(defaults.nextImplantId, 1);

const m = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const area = rectMulti(4, 4);
const add = applyOperation(m, {
  type: 'add',
  name: 'Film',
  thickness: 2,
  face: 'front',
  area,
  growth: 'direct',
});
assert.equal(add.changed, true);
assert.equal(layerById(m, add.layerId).name, 'Film');
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).layerId, add.layerId);

const beforeTop = surfaceSegment(regionAt(m, [0, 0]).stack).z1;
applyOperation(m, {
  type: 'grow',
  targetLayerId: add.layerId,
  thickness: 1,
  face: 'front',
  area,
  growth: 'direct',
});
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).z1, beforeTop + 1);

applyOperation(m, { type: 'etch', thickness: 4, face: 'front', area });
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).layerId, 'base');

const roughEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const roughResult = applyOperation(roughEtch, {
  type: 'etch',
  thickness: 1,
  face: 'front',
  area,
  surface: {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'normal',
    featureSize: 0.4,
    meanHeight: 0.8,
    featureCv: 0.2,
    heightCv: 0.3,
    geometryMode: 'ideal',
  },
});
assert.equal(roughResult.changed, true);
const roughSurface = surfaceSegment(regionAt(roughEtch, [0, 0]).stack);
assert.equal(roughSurface.z1, 4);
assert.equal(roughSurface.frontSurface.kind, 'rough');
assert.equal(roughSurface.frontSurface.morphology, 'stochastic');
assert.equal(roughSurface.frontSurface.polarity, 'normal');
assert.equal(roughSurface.frontSurface.featureSize, 0.4);
assert.equal(roughSurface.frontSurface.meanHeight, 0.8);
assert.equal(roughSurface.frontSurface.featureCv, 0.2);
assert.equal(roughSurface.frontSurface.heightCv, 0.3);
assert.equal(typeof roughSurface.frontSurface.profileId, 'string');
assert.equal(roughSurface.frontSurface.geometryMode, 'ideal');
assert.equal(Number.isInteger(roughSurface.frontSurface.seed), true);

assert.equal(roughSurface.frontSurface.etchDepth, 1);
assert.deepEqual(roughVisualBoundsZ(roughEtch, [-5, 4]), [-5, 5]);
const roughConformalModel = createModel({
  shape: 'rect',
  width: 20,
  height: 20,
  thickness: 10,
});
applyOperation(roughConformalModel, {
  type: 'etch',
  thickness: 1,
  face: 'front',
  area: roughConformalModel.boundary,
  surface: {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.5,
    meanHeight: 0.4,
    featureCv: 0.2,
    heightCv: 0.2,
  },
});
const roughCoat = applyOperation(roughConformalModel, {
    type: 'add',
    name: 'Rough conformal shell',
    thickness: 0.5,
    face: 'front',
    area: roughConformalModel.boundary,
    growth: 'conformal',
  }),
  roughBoundaryGroups = appearanceSurfaceGroups(roughConformalModel);
assert.ok(
  roughBoundaryGroups.some(
    (group) => group.layerId === 'base' && group.face === 'front' && group.z === 4,
  ),
);
assert.ok(
  roughBoundaryGroups.some(
    (group) =>
      group.layerId === roughCoat.layerId &&
      group.face === 'back' &&
      group.z === 4 &&
      group.profileNormal === 1,
  ),
);
assert.ok(
  roughBoundaryGroups.some(
    (group) => group.layerId === roughCoat.layerId && group.face === 'front' && group.z === 4.5,
  ),
);

// Regression: stripping a complete top film must reveal the pre-existing rough
// conformal interface, not silently turn that surface smooth.
const roughCoatBeforeStrip = surfaceSegment(
    regionAt(roughConformalModel, [0, 0]).stack,
  ).frontSurface,
  roughTopFilm = applyOperation(roughConformalModel, {
    type: 'add',
    name: 'Temporary metal',
    thickness: 0.3,
    face: 'front',
    area: roughConformalModel.boundary,
    growth: 'direct',
  });
assert.ok(roughTopFilm.layerId);
applyOperation(roughConformalModel, {
  type: 'etch',
  thickness: 0.3,
  face: 'front',
  area: roughConformalModel.boundary,
});
const reexposedRoughCoat = surfaceSegment(regionAt(roughConformalModel, [0, 0]).stack);
assert.equal(reexposedRoughCoat.layerId, roughCoat.layerId);
assert.equal(reexposedRoughCoat.frontSurface?.kind, 'rough');
assert.equal(reexposedRoughCoat.frontSurface?.profileId, roughCoatBeforeStrip.profileId);
assert.equal(reexposedRoughCoat.frontSurface?.seed, roughCoatBeforeStrip.seed);

const roughRenderPlan = buildRenderSurfacePlan(roughConformalModel),
  buriedAtInheritedInterface = roughRenderPlan.caps.filter(
    (cap) => cap.buried && Math.abs(cap.z - 4) < 1e-9,
  ),
  buriedHorizontalBorders = roughRenderPlan.borderLines.filter(
    ([a, b]) => Math.abs(a[2] - 4) < 1e-9 && Math.abs(b[2] - 4) < 1e-9,
  );
assert.equal(buriedAtInheritedInterface.length, 1);
assert.equal(buriedAtInheritedInterface[0].appearance?.kind, 'rough');
assert.equal(buriedHorizontalBorders.length, 0);
assert.ok(roughRenderPlan.sidewalls.every((part) => part.ownership === 'exterior' || part.ownership === 'interface'));
const pyramidEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const pyramidResult = applyOperation(pyramidEtch, {
  type: 'etch',
  thickness: 1,
  face: 'front',
  area,
  surface: {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'inverted',
    featureSize: 0.6,
    meanHeight: 0.7,
    featureCv: 0,
    heightCv: 0,
    geometryMode: 'ideal',
  },
});
assert.equal(pyramidResult.changed, true);
const pyramidSurface = surfaceSegment(regionAt(pyramidEtch, [0, 0]).stack).frontSurface;
assert.equal(pyramidSurface.morphology, 'pyramid');
assert.equal(pyramidSurface.polarity, 'inverted');
assert.equal(pyramidSurface.featureCv, 0);
assert.equal(pyramidSurface.heightCv, 0);
assert.equal(pyramidSurface.meanHeight, 0.7);
assert.equal(pyramidSurface.etchDepth, 1);


const invalidRoughEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const invalidRoughResult = applyOperation(invalidRoughEtch, {
  type: 'etch',
  thickness: 0.5,
  face: 'front',
  area,
  surface: {
    kind: 'rough',
    featureSize: 0.2,
    meanHeight: 0.8,
    featureCv: 0.2,
    heightCv: 0.2,
    geometryMode: 'ideal',
  },
});
assert.equal(invalidRoughResult.changed, false);
assert.match(invalidRoughResult.error, /Height cannot exceed Etch Depth/);
assert.equal(surfaceSegment(regionAt(invalidRoughEtch, [0, 0]).stack).z1, 5);

const smoothEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(smoothEtch, { type: 'etch', thickness: 1, face: 'front', area });
const smoothSurface = surfaceSegment(regionAt(smoothEtch, [0, 0]).stack);
assert.equal(smoothSurface.z1, roughSurface.z1);
assert.equal(smoothSurface.frontSurface, undefined);


// Literature acceptance case: suspended spoked silica microdisk released from Si.
// Geometry follows the reported 148 µm outer / 82 µm inner radii and 1.8 µm
// thermal oxide thickness. A larger central hub leaves a Si pedestal while a
// 36 µm isotropic XeF2-like release clears the annulus from both radial sides.
const releaseModel = createModel({ shape: 'rect', width: 400, height: 400, thickness: 80 });
const releaseOxide = applyOperation(releaseModel, {
  type: 'add',
  name: 'Thermal SiO2',
  thickness: 1.8,
  face: 'front',
  area: releaseModel.boundary,
  growth: 'direct',
});
const releaseOuter = circleMulti(296, 296, 128),
  releaseInner = circleMulti(164, 164, 128),
  releaseAnnulus = difference(releaseOuter, releaseInner),
  releaseHub = circleMulti(110, 110, 96),
  releaseSpokeH = rectMulti(180, 10),
  releaseSpokeV = rectMulti(10, 180),
  releasePad = unionGeometries([
    releaseAnnulus,
    releaseHub,
    releaseSpokeH,
    releaseSpokeV,
  ]),
  oxideOpen = difference(releaseModel.boundary, releasePad);

const oxidePattern = applyOperation(releaseModel, {
  type: 'etch',
  etchProfile: 'directional',
  etchTargetLayerIds: [releaseOxide.layerId],
  thickness: 2,
  face: 'front',
  area: oxideOpen,
});
assert.equal(oxidePattern.changed, true);
assert.equal(surfaceSegment(regionAt(releaseModel, [115, 0]).stack).layerId, releaseOxide.layerId);
assert.equal(surfaceSegment(regionAt(releaseModel, [170, 0]).stack).layerId, 'base');

const releaseResult = applyOperation(releaseModel, {
  type: 'etch',
  etchProfile: 'isotropic',
  etchTargetLayerIds: ['base'],
  thickness: 36,
  face: 'front',
  area: releaseModel.boundary,
});
assert.equal(releaseResult.changed, true, releaseResult.error || 'release changed=false');

const releasedRing = regionAt(releaseModel, [115, 0]).stack,
  releasedRingOxide = releasedRing.find((segment) => segment.layerId === releaseOxide.layerId),
  releasedRingSi = releasedRing.find((segment) => segment.layerId === 'base'),
  supportedHub = regionAt(releaseModel, [0, 0]).stack,
  supportedHubSi = supportedHub.find((segment) => segment.layerId === 'base');
assert.ok(releasedRingOxide, 'release must preserve the silica annulus');
assert.ok(releasedRingSi, 'release radius should leave deeper Si below the cavity');
assert.ok(
  releasedRingOxide.z0 - releasedRingSi.z1 > 10,
  'annulus must be physically suspended above a true air gap',
);
assert.ok(supportedHubSi);
assert.ok(
  Math.abs(supportedHubSi.z1 - releasedRingOxide.z0) < 1e-9,
  'central hub must retain a Si pedestal up to the oxide interface',
);
assert.equal(
  releaseModel.regions.some((region) =>
    region.stack.some(
      (segment) =>
        segment.layerId === releaseOxide.layerId &&
        region.stack.some((other) => other.layerId === 'base' && other.z1 < segment.z0 - 1e-6),
    ),
  ),
  true,
  'canonical topology must contain an overhang/cavity stack, not a render-only illusion',
);

// Implant rendering must respect the same canonical void instead of filling the
// air gap between the suspended oxide and lower silicon.
const gapImplant = applyOperation(releaseModel, {
  type: 'implant',
  name: 'Release gap probe',
  thickness: 50,
  face: 'front',
  area: rectMulti(2, 2, 115, 0),
});
assert.equal(gapImplant.changed, true);
const gapImplantIntervals = implantSolids(releaseModel, rectMulti(2, 2, 115, 0))
  .filter((solid) => solid.implantId === gapImplant.implantId)
  .map((solid) => [solid.z0, solid.z1])
  .sort((a, b) => a[0] - b[0]);
assert.ok(gapImplantIntervals.length >= 2);
assert.ok(
  gapImplantIntervals.some(
    (interval, index) =>
      index < gapImplantIntervals.length - 1 &&
      gapImplantIntervals[index + 1][0] - interval[1] > 1,
  ),
  'implant fragments must preserve the physical release gap',
);

// Compatibility: legacy directional etch must remove the oxide above a released
// cavity and stop at the void instead of jumping across air into the lower Si.
const postReleaseDirectional = structuredClone(releaseModel),
  postReleaseBeforeSi = regionAt(postReleaseDirectional, [115, 0]).stack.find(
    (segment) => segment.layerId === 'base',
  ).z1,
  postReleaseStrip = applyOperation(postReleaseDirectional, {
    type: 'etch',
    thickness: 5,
    face: 'front',
    area: rectMulti(2, 2, 115, 0),
  });
assert.equal(postReleaseStrip.changed, true);
const postReleaseStack = regionAt(postReleaseDirectional, [115, 0]).stack,
  postReleaseSi = postReleaseStack.find((segment) => segment.layerId === 'base');
assert.equal(
  postReleaseStack.some((segment) => segment.layerId === releaseOxide.layerId),
  false,
);
assert.equal(postReleaseSi.z1, postReleaseBeforeSi);

const releaseWithoutTarget = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const releaseWithoutTargetResult = applyOperation(releaseWithoutTarget, {
  type: 'etch',
  etchProfile: 'isotropic',
  thickness: 1,
  face: 'front',
  area: releaseWithoutTarget.boundary,
});
assert.equal(releaseWithoutTargetResult.changed, false);
assert.match(releaseWithoutTargetResult.error, /requires a selected material/);

const incompatibleRelease = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const incompatibleReleaseResult = applyOperation(incompatibleRelease, {
  type: 'etch',
  etchProfile: 'isotropic',
  etchTargetLayerIds: ['base'],
  thickness: 1,
  face: 'front',
  area: incompatibleRelease.boundary,
  surface: {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.2,
    meanHeight: 0.1,
    featureCv: 0.2,
    heightCv: 0.2,
  },
});
assert.equal(incompatibleReleaseResult.changed, false);
assert.match(incompatibleReleaseResult.error, /cannot combine with Rough\/Pyramid/);

applyOperation(roughEtch, {
  type: 'add',
  name: 'Rough-following film',
  thickness: 0.5,
  face: 'front',
  area,
  growth: 'direct',
});
const inheritedRough = surfaceSegment(regionAt(roughEtch, [0, 0]).stack);
assert.equal(inheritedRough.frontSurface.kind, 'rough');
assert.equal(inheritedRough.frontSurface.seed, roughSurface.frontSurface.seed);
assert.equal(inheritedRough.frontSurface.profileId, roughSurface.frontSurface.profileId);

applyOperation(roughEtch, {
  type: 'etch',
  thickness: 0.1,
  face: 'front',
  area,
});
assert.equal(surfaceSegment(regionAt(roughEtch, [0, 0]).stack).frontSurface, undefined);

const direct = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const d = applyOperation(direct, {
  type: 'add',
  name: 'D',
  thickness: 2,
  face: 'front',
  area,
  growth: 'direct',
});
assert.notEqual(surfaceSegment(regionAt(direct, [2.5, 0]).stack).layerId, d.layerId);

const conformal = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const c = applyOperation(conformal, {
  type: 'add',
  name: 'C',
  thickness: 2,
  face: 'front',
  area,
  growth: 'conformal',
});
assert.equal(surfaceSegment(regionAt(conformal, [2.5, 0]).stack).layerId, c.layerId);

const maskedConformal = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const maskedFilm = applyOperation(maskedConformal, {
  type: 'add',
  name: 'Masked conformal',
  thickness: 1,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'conformal',
});
assert.equal(surfaceSegment(regionAt(maskedConformal, [0, 0]).stack).layerId, maskedFilm.layerId);
assert.equal(
  regionAt(maskedConformal, [2.5, 0]).stack.some((segment) => segment.layerId === maskedFilm.layerId),
  false,
  'Conformal deposition must not wrap around an artificial mask edge',
);

const maskedConformalStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(maskedConformalStep, {
  type: 'add',
  name: 'Inner ridge',
  thickness: 2,
  face: 'front',
  area: rectMulti(2, 20),
  growth: 'direct',
});
const maskedStepFilm = applyOperation(maskedConformalStep, {
  type: 'add',
  name: 'Masked conformal over step',
  thickness: 1,
  face: 'front',
  area: rectMulti(8, 20),
  growth: 'conformal',
});
const maskedPhysicalSide = regionAt(maskedConformalStep, [1.5, 0]).stack.find(
  (segment) => segment.layerId === maskedStepFilm.layerId,
);
assert.equal(maskedPhysicalSide?.role, 'conformal-sidewall');
assert.equal(maskedPhysicalSide?.z0, 5);
assert.equal(maskedPhysicalSide?.z1, 8);
assert.equal(
  regionAt(maskedConformalStep, [4.5, 0]).stack.some(
    (segment) => segment.layerId === maskedStepFilm.layerId,
  ),
  false,
  'Masked conformal coating must remain hard-clipped at the selected area boundary',
);

const directStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(directStep, {
  type: 'add',
  name: 'Ridge',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
const directBlanket = applyOperation(directStep, {
  type: 'add',
  name: 'Direct blanket',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
const directSide = regionAt(directStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === directBlanket.layerId,
);
assert.equal(directSide.z0, 5);
assert.equal(directSide.z1, 6);

const conformalStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(conformalStep, {
  type: 'add',
  name: 'Ridge',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
const conformalBlanket = applyOperation(conformalStep, {
  type: 'add',
  name: 'Conformal blanket',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'conformal',
});
const conformalSide = regionAt(conformalStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === conformalBlanket.layerId,
);
assert.equal(conformalSide.z0, 5);
assert.equal(conformalSide.z1, 8);
const conformalFlat = regionAt(conformalStep, [4, 0]).stack.find(
  (segment) => segment.layerId === conformalBlanket.layerId,
);
assert.equal(conformalFlat.z0, 5);
assert.equal(conformalFlat.z1, 6);

const conformalGrowStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const conformalGrowSeed = applyOperation(conformalGrowStep, {
  type: 'add',
  name: 'Grow seed',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
applyOperation(conformalGrowStep, {
  type: 'grow',
  targetLayerId: conformalGrowSeed.layerId,
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'conformal',
});
const conformalGrowSide = regionAt(conformalGrowStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === conformalGrowSeed.layerId,
);
assert.equal(conformalGrowSide.z0, 5);
assert.equal(conformalGrowSide.z1, 8);
assert.equal(conformalGrowSide.role, 'conformal-sidewall');
assert.equal(surfaceSegment(regionAt(conformalGrowStep, [0, 0]).stack).z1, 8);
assert.deepEqual(
  regionAt(conformalGrowStep, [4, 0]).stack.find(
    (segment) => segment.layerId === conformalGrowSeed.layerId,
  ),
  { layerId: conformalGrowSeed.layerId, z0: 5, z1: 6 },
);

const buriedGrow = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const buriedSeed = applyOperation(buriedGrow, {
  type: 'add',
  name: 'Seed',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
applyOperation(buriedGrow, {
  type: 'add',
  name: 'Cap',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
const buriedRevision = buriedGrow.revision;
const buriedProcessRevision = buriedGrow.processRevision;
const buriedResult = applyOperation(buriedGrow, {
  type: 'grow',
  targetLayerId: buriedSeed.layerId,
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
assert.equal(buriedResult.changed, false);
assert.match(buriedResult.error, /not exposed/);
assert.equal(buriedGrow.revision, buriedRevision);
assert.equal(buriedGrow.processRevision, buriedProcessRevision);

assert.equal(renameLayer(conformal, c.layerId, 'Contact'), true);
assert.equal(layerById(conformal, c.layerId).name, 'Contact');
assert.equal(recolorLayer(conformal, c.layerId, '#55aacc'), true);
assert.equal(layerById(conformal, c.layerId).color, '#55aacc');
assert.ok(conformal.processRevision > 0);

const full = rectMulti(20, 20),
  inside = intersection(full, area),
  outside = difference(full, area);
assert.equal(isEmpty(inside), false);
assert.equal(pointInMulti([0, 0], outside), false);
assert.equal(pointInMulti([7, 0], outside), true);

const circle = createModel({ shape: 'circle', width: 20, height: 20, thickness: 10 });
assert.ok(circle.boundary[0][0].length > 100);
assert.equal(pointInMulti([0, 0], circle.boundary), true);
assert.equal(pointInMulti([10.1, 0], circle.boundary), false);

const demo = makeDemoLayout();
assert.equal(demo.linework.length, 1);
assert.ok(!demo.combos.some((x) => x.layer === 99));

function gdsReal8(value) {
  const out = new Uint8Array(8);
  if (value === 0) return out;
  let x = Math.abs(value),
    exp = 0;
  while (x >= 1) {
    x /= 16;
    exp++;
  }
  while (x < 1 / 16) {
    x *= 16;
    exp--;
  }
  out[0] = (value < 0 ? 0x80 : 0) | (exp + 64);
  for (let i = 1; i < 8; i++) {
    x *= 256;
    out[i] = Math.floor(x);
    x -= out[i];
  }
  return out;
}
function gdsRecord(type, dataType, data = new Uint8Array()) {
  const out = new Uint8Array(4 + data.length),
    v = new DataView(out.buffer);
  v.setUint16(0, out.length, false);
  out[2] = type;
  out[3] = dataType;
  out.set(data, 4);
  return out;
}
function gdsString(value) {
  const raw = new TextEncoder().encode(value),
    out = new Uint8Array(raw.length + (raw.length % 2));
  out.set(raw);
  return out;
}
function gdsI16(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setInt16(0, value, false);
  return out;
}
function gdsXY(points) {
  const out = new Uint8Array(points.length * 8),
    v = new DataView(out.buffer);
  points.forEach(([x, y], i) => {
    v.setInt32(i * 8, x, false);
    v.setInt32(i * 8 + 4, y, false);
  });
  return out;
}
function concatBytes(parts) {
  const n = parts.reduce((sum, p) => sum + p.length, 0),
    out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const units = concatBytes([gdsReal8(1e-3), gdsReal8(1e-9)]);
const gdsBytes = concatBytes([
  gdsRecord(0x03, 0x05, units),
  gdsRecord(0x05, 0x02),
  gdsRecord(0x06, 0x06, gdsString('TOP')),
  gdsRecord(0x08, 0x00),
  gdsRecord(0x0d, 0x02, gdsI16(1)),
  gdsRecord(0x0e, 0x02, gdsI16(0)),
  gdsRecord(
    0x10,
    0x03,
    gdsXY([
      [0, 0],
      [10000, 0],
      [10000, 20000],
      [0, 20000],
      [0, 0],
    ]),
  ),
  gdsRecord(0x11, 0x00),
  gdsRecord(0x07, 0x00),
]);
const parsed = parseGDS(gdsBytes.buffer),
  flat = flattenGDS(parsed, 'TOP');
assert.equal(parsed.units.xy, 'µm');
assert.ok(Math.abs(parsed.units.dbuToMicron - 0.001) < 1e-12);
assert.ok(Math.abs(flat.bounds.width - 10) < 1e-9);
assert.ok(Math.abs(flat.bounds.height - 20) < 1e-9);
assert.deepEqual(flat.elements[0].points[2], [10, 20]);

const validProject = {
  format: 'WaferCAD-vector',
  model: createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 }),
  layout: {
    name: 'Empty',
    root: '',
    elements: [],
    linework: [],
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 20, height: 20 },
    combos: [],
    hierarchy: {},
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  },
  selectedLayerKeys: [],
  activeCell: null,
  maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
  activeFace: 'front',
  roi: null,
  section: { a: [-5, 0], b: [5, 0] },
  planViews: {
    mask: { zoom: 1, panX: 0, panY: 0 },
    main: { zoom: 1, panX: 0, panY: 0 },
  },
  display: { xyUnit: 'um', structurePalette: 'balanced', customStructurePalette: null },
};
assert.equal(validateProjectFile(validProject), validProject);

const collapseProject = structuredClone(validProject);
collapseProject.display.sectionCollapse = { top: -0.5, bottom: -9.5 };
assert.equal(validateProjectFile(collapseProject), collapseProject);
const invalidCollapseProject = structuredClone(validProject);
invalidCollapseProject.display.sectionCollapse = { top: -9.5, bottom: -0.5 };
assert.throws(() => validateProjectFile(invalidCollapseProject), /sectionCollapse/);

const detailRoiProject = structuredClone(validProject);
detailRoiProject.display.sectionDetailRoi = {
  x: 0.2,
  y: 0.15,
  width: 0.3,
  height: 0.25,
  shape: 'circle',
};
assert.equal(validateProjectFile(detailRoiProject), detailRoiProject);
const invalidDetailRoiProject = structuredClone(validProject);
invalidDetailRoiProject.display.sectionDetailRoi = {
  x: 0.9,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  shape: 'rect',
};
assert.throws(() => validateProjectFile(invalidDetailRoiProject), /sectionDetailRoi/);

const cameraProject = structuredClone(validProject);
cameraProject.display.threeCamera = {
  position: [120, -95, 80],
  target: [0, 0, 4],
  fov: 34,
};
assert.equal(validateProjectFile(cameraProject), cameraProject);
const invalidCameraProject = structuredClone(validProject);
invalidCameraProject.display.threeCamera = {
  position: [1, 2],
  target: [0, 0, 0],
  fov: 34,
};
assert.throws(() => validateProjectFile(invalidCameraProject), /threeCamera/);

const roughProject = structuredClone(validProject);
roughProject.model.regions[0].stack[0].frontSurface = {
  kind: 'rough',
  morphology: 'stochastic',
  polarity: 'inverted',
  featureSize: 0.4,
  meanHeight: 0.4,
  featureCv: 0.25,
  heightCv: 0.3,
  seed: 0xffffffff,
  profileId: 'rough-schema-test',
  etchDepth: 0.8,
  geometryMode: 'ideal',
};
assert.equal(validateProjectFile(roughProject), roughProject);

const futureRoughGeometry = structuredClone(roughProject);
futureRoughGeometry.model.regions[0].stack[0].frontSurface.geometryMode = 'explicit';
assert.throws(() => validateProjectFile(futureRoughGeometry), /geometryMode/);

const badStack = structuredClone(validProject);
badStack.model.regions[0].stack[0].z1 = badStack.model.regions[0].stack[0].z0;
assert.throws(() => validateProjectFile(badStack), /z1 > z0/);

const badLayerReference = structuredClone(validProject);
badLayerReference.model.regions[0].stack[0].layerId = 'missing-layer';
assert.throws(() => validateProjectFile(badLayerReference), /unknown layer/);

const badLayout = structuredClone(validProject);
badLayout.layout = null;
assert.throws(() => validateProjectFile(badLayout), /layout must be an object/);

const implantModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const implantArea = rectMulti(6, 4);
const implantResult = applyOperation(implantModel, {
  type: 'implant',
  name: 'B marker',
  thickness: 1.25,
  face: 'front',
  area: implantArea,
  color: '#C94F68',
  tilt: 12,
});
assert.equal(implantResult.changed, true);
assert.equal(implantModel.implants.length, 1);
assert.equal(implantModel.implants[0].name, 'B marker');
assert.equal(implantModel.implants[0].thickness, 1.25);
assert.equal(implantModel.implants[0].tilt, 12);
assert.equal(implantModel.implants[0].depthProfile, 'follow');
assert.equal(implantModel.implants[0].visible, true);
assert.ok(implantModel.implants[0].patches.length > 0);
assert.equal(modelApi.setImplantDepthProfile(implantModel, implantModel.implants[0].id, 'smooth'), true);
assert.equal(implantSectionBands(implantModel, [-8, 0], [8, 0])[0]?.depthProfile, 'smooth');
assert.equal(modelApi.setImplantDepthProfile(implantModel, implantModel.implants[0].id, 'follow'), true);
assert.equal(implantModel.regions.length, 1);
assert.equal(implantSolids(implantModel)[0]?.surfaceExposed, true);

const buriedImplantModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(buriedImplantModel, {
  type: 'implant',
  name: 'Buried marker',
  thickness: 1,
  face: 'front',
  area: implantArea,
  tilt: 0,
});
applyOperation(buriedImplantModel, {
  type: 'add',
  name: 'Cap',
  thickness: 0.8,
  face: 'front',
  area: buriedImplantModel.boundary,
  growth: 'direct',
});
assert.equal(implantSolids(buriedImplantModel)[0]?.surfaceExposed, false);

const roughImplantModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(roughImplantModel, {
  type: 'etch',
  thickness: 1,
  face: 'front',
  area: implantArea,
  surface: {
    kind: 'rough',
    featureSize: 0.4,
    meanHeight: 0.6,
    featureCv: 0.2,
    heightCv: 0.2,
    geometryMode: 'ideal',
  },
});
const roughImplantResult = applyOperation(roughImplantModel, {
  type: 'implant',
  name: 'Rough-top implant',
  thickness: 0.8,
  face: 'front',
  area: implantArea,
  color: '#C94F68',
  tilt: 0,
});
assert.equal(roughImplantResult.changed, true);
assert.equal(roughImplantModel.implants[0].depthProfile, 'follow');
assert.equal(roughImplantModel.implants[0].patches[0].surfaceAppearance?.kind, 'rough');
assert.equal(implantSectionBands(roughImplantModel, [-8, 0], [8, 0])[0]?.depthProfile, 'follow');

const electricalProfileModel = createModel({
  shape: 'rect',
  width: 20,
  height: 20,
  thickness: 10,
});
const electricalProfileResult = applyOperation(electricalProfileModel, {
  type: 'electrical',
  name: 'Field marker',
  thickness: 0.4,
  face: 'front',
  area: rectMulti(20, 20),
  electricalRegionType: 'p-inversion',
  electricalRegionSource: 'induced',
});
assert.equal(electricalProfileResult.changed, true);
assert.equal(electricalProfileModel.electricalRegions[0].depthProfile, 'follow');
assert.equal(
  modelApi.setElectricalRegionDepthProfile(
    electricalProfileModel,
    electricalProfileModel.electricalRegions[0].id,
    'smooth',
  ),
  true,
);
assert.equal(electricalProfileModel.electricalRegions[0].depthProfile, 'smooth');

const etchedImplantModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(etchedImplantModel, {
  type: 'implant',
  name: 'Etch-follow implant',
  thickness: 2,
  face: 'front',
  area: rectMulti(20, 20),
  tilt: 0,
});
const beforeEtchSolid = implantSolids(etchedImplantModel)[0];
assert.ok(beforeEtchSolid);
assert.ok(Math.abs(beforeEtchSolid.z1 - beforeEtchSolid.z0 - 2) < 1e-9);
applyOperation(etchedImplantModel, {
  type: 'etch',
  thickness: 0.5,
  face: 'front',
  area: rectMulti(20, 20),
});
const afterEtchSolid = implantSolids(etchedImplantModel)[0];
assert.ok(afterEtchSolid);
assert.ok(Math.abs(afterEtchSolid.z1 - afterEtchSolid.z0 - 1.5) < 1e-9);
assert.equal(afterEtchSolid.surfaceExposed, true);

const roughCutModel = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(roughCutModel, {
  type: 'implant',
  name: 'Rough-cut implant',
  thickness: 2,
  face: 'front',
  area: rectMulti(20, 20),
  tilt: 0,
});
applyOperation(roughCutModel, {
  type: 'etch',
  thickness: 0.5,
  face: 'front',
  area: rectMulti(20, 20),
  surface: {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'inverted',
    featureSize: 0.4,
    meanHeight: 0.25,
    featureCv: 0.2,
    heightCv: 0.2,
    geometryMode: 'ideal',
  },
});
const roughCutBand = implantSectionBands(roughCutModel, [-8, 0], [8, 0])[0];
assert.equal(roughCutBand.surfaceAppearance?.kind, 'rough');

const fullyEtchedImplantModel = createModel({
  shape: 'rect',
  width: 20,
  height: 20,
  thickness: 10,
});
applyOperation(fullyEtchedImplantModel, {
  type: 'implant',
  name: 'Removed implant',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  tilt: 0,
});
applyOperation(fullyEtchedImplantModel, {
  type: 'etch',
  thickness: 1.5,
  face: 'front',
  area: rectMulti(20, 20),
});
assert.equal(implantSolids(fullyEtchedImplantModel).length, 0);

console.log('WaferCAD self-test: OK');
