import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const modelApi = await import('../model.js');
const { applyOperation, createModel, layerById, surfaceSegment } = modelApi;
const { appearanceSurfaceGroups } = await import('../model-view-geometry.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');
const { roughVisualBoundsZ } = await import('../surface-rendering.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}

test('Core and rough process contracts', () => {
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
  assert.ok(
    roughRenderPlan.sidewalls.every(
      (part) => part.ownership === 'exterior' || part.ownership === 'interface',
    ),
  );
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
});
