import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const modelApi = await import('../model.js');
const { applyOperation, createModel } = modelApi;
const { implantSectionBands, implantSolids } = await import('../model-view-geometry.js');
const { validateProjectFile } = await import('../project-schema.js');
const { rectMulti } = await import('../vector-geometry.js');

test('Project schema and annotation contracts', () => {
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
  collapseProject.display.sectionCollapse = { top: -0.5, bottom: -9.5, enabled: false };
  assert.equal(validateProjectFile(collapseProject), collapseProject);
  const invalidCollapseEnabledProject = structuredClone(validProject);
  invalidCollapseEnabledProject.display.sectionCollapse = {
    top: -0.5,
    bottom: -9.5,
    enabled: 'no',
  };
  assert.throws(
    () => validateProjectFile(invalidCollapseEnabledProject),
    /sectionCollapse.enabled/,
  );
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
  assert.equal(
    modelApi.setImplantDepthProfile(implantModel, implantModel.implants[0].id, 'smooth'),
    true,
  );
  assert.equal(implantSectionBands(implantModel, [-8, 0], [8, 0])[0]?.depthProfile, 'smooth');
  assert.equal(
    modelApi.setImplantDepthProfile(implantModel, implantModel.implants[0].id, 'follow'),
    true,
  );
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
  assert.equal(
    implantSolids(buriedImplantModel, rectMulti(4, 10))[0]?.viewClipped,
    true,
    'ROI clipping must mark a buried Implant fragment as an inspection cut',
  );
  assert.equal(
    implantSolids(buriedImplantModel, rectMulti(12, 12))[0]?.viewClipped,
    false,
    'an ROI that fully contains the Implant must not create a cut-face marker',
  );

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
});
