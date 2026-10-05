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
assert.notEqual(
  surfaceSegment(regionAt(conformal, [2.5, 0]).stack).layerId,
  c.layerId,
  'A flat mask boundary must stay hard-clipped even for conformal deposition',
);

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

console.log('WaferCAD self-test: OK');
