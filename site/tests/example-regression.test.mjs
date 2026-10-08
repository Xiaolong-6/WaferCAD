import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vendorSource = await readFile(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const { upgradeBundledExampleHistory } = await import('../bundled-example-history.js');
const { expandProjectStorage } = await import('../project-io.js');
const { migrateProjectFile, validateProjectFile } = await import('../project-schema.js');
const {
  appearanceSurfaceGroups,
  electricalRegionSolids,
  extrusionGroups,
  implantSectionBands,
  implantSolids,
  materialSolids,
  sectionSlices,
  surfaceGroups,
} = await import('../model-view-geometry.js');

async function loadBundledProject(id) {
  const example = BUNDLED_EXAMPLES.find((entry) => entry.id === id);
  assert.ok(example?.path, `missing bundled project ${id}`);
  const fileName = example.path.split('/').at(-1),
    project = JSON.parse(
      await readFile(new URL(`../examples/${fileName}`, import.meta.url), 'utf8'),
    );
  expandProjectStorage(project);
  upgradeBundledExampleHistory(project);
  validateProjectFile(project);
  return project;
}

async function loadLiteratureProject() {
  return loadBundledProject('photodetector-literature');
}

function branchMap(project) {
  return new Map(project.snapshotBranches.branches.map((branch) => [branch.id, branch]));
}

function branchModel(project, branchId) {
  const branch = branchMap(project).get(branchId);
  assert.ok(branch, `missing Variant ${branchId}`);
  assert.ok(branch.headState?.model, `Variant ${branchId} must retain a HEAD model`);
  return branch.headState.model;
}

function layerNames(model) {
  return new Map((model.layers || []).map((layer) => [layer.id, layer.name]));
}

function exposedLayerNames(model, face) {
  const names = layerNames(model);
  return new Set(
    surfaceGroups(model, face).map((surface) => names.get(surface.layerId) || surface.layerId),
  );
}

function roughSurfaceCounts(model) {
  const counts = { front: 0, back: 0, buried: 0 };
  for (const group of appearanceSurfaceGroups(model)) {
    if (group.appearance?.kind !== 'rough') continue;
    if (group.buried) counts.buried += 1;
    else counts[group.face] += 1;
  }
  return counts;
}

function ringArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index],
      [x2, y2] = ring[(index + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(twiceArea) / 2;
}

function multiPolygonArea(geometry) {
  return (geometry || []).reduce((total, polygon) => {
    if (!polygon?.length) return total;
    return (
      total +
      ringArea(polygon[0]) -
      polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0)
    );
  }, 0);
}

function materialVolumes(model) {
  const names = layerNames(model),
    volumes = new Map();
  for (const region of model.regions || []) {
    const area = multiPolygonArea(region.geom);
    for (const segment of region.stack || []) {
      const name = names.get(segment.layerId) || segment.layerId,
        volume = area * (segment.z1 - segment.z0);
      volumes.set(name, (volumes.get(name) || 0) + volume);
    }
  }
  return volumes;
}

function assertClose(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function assertRendererReadyState(state, label) {
  const model = state.model;
  assert.ok(model, `${label}: model missing`);
  const knownLayerIds = new Set((model.layers || []).map((layer) => layer.id));

  for (const region of model.regions || []) {
    for (const segment of region.stack || []) {
      assert.ok(knownLayerIds.has(segment.layerId), `${label}: dangling layer id`);
      assert.ok(segment.z1 > segment.z0, `${label}: non-positive material thickness`);
    }
  }

  const hasMaterial = (model.regions || []).some((region) => region.stack?.length);
  if (!hasMaterial) return;

  const extrusions = extrusionGroups(model),
    solids = materialSolids(model);
  assert.ok(extrusions.length > 0, `${label}: renderer extrusion groups missing`);
  assert.ok(solids.length > 0, `${label}: renderer material solids missing`);

  for (const solid of solids) {
    assert.ok(knownLayerIds.has(solid.layerId), `${label}: solid references unknown material`);
    for (const slab of solid.slabs || []) {
      assert.ok(slab.z1 > slab.z0, `${label}: renderer slab has invalid Z interval`);
      assert.ok(slab.polys?.length, `${label}: renderer slab has empty geometry`);
    }
  }

  const section = state.section;
  if (section?.a && section?.b) {
    const slices = sectionSlices(model, section.a, section.b);
    assert.ok(slices.length > 0, `${label}: saved Section A-B misses the device`);
    for (const slice of slices) {
      assert.ok(slice.t1 > slice.t0, `${label}: Section has invalid XY interval`);
      assert.ok(slice.z1 > slice.z0, `${label}: Section has invalid Z interval`);
    }
  }

  for (const solid of implantSolids(model)) {
    assert.ok(solid.z1 > solid.z0, `${label}: Implant solid has invalid depth`);
    assert.ok(solid.polys?.length, `${label}: Implant solid has empty geometry`);
  }

  for (const solid of electricalRegionSolids(model)) {
    assert.ok(solid.z1 > solid.z0, `${label}: Electrical solid has invalid depth`);
    assert.ok(solid.polys?.length, `${label}: Electrical solid has empty geometry`);
    assert.ok(
      knownLayerIds.has(solid.hostLayerId),
      `${label}: Electrical solid lost its host material`,
    );
  }
}

test('bundled examples remain valid renderer-ready regression fixtures', async () => {
  for (const example of BUNDLED_EXAMPLES) {
    const project = await loadBundledProject(example.id);
    assertRendererReadyState(project, `${example.id} current state`);

    for (const node of project.snapshotBranches?.nodes || []) {
      assert.notEqual(node.restorable, false, `${node.id}: production Step must remain restorable`);
      assert.ok(node.state?.model, `${node.id}: restorable Step lost its model`);
      if (node.operation?.kind === 'base') {
        assert.notEqual(
          node.operation?.replay?.version,
          1,
          `${node.id}: Base lifecycle marker must not masquerade as an editable Process Step`,
        );
      } else {
        assert.equal(
          node.operation?.replay?.version,
          1,
          `${node.id}: bundled Process Step must expose deterministic replay metadata`,
        );
        if (node.operation?.kind !== 'record') {
          assert.ok(node.operation.replay.params, `${node.id}: replay params missing`);
          if (node.operation?.surface) {
            assert.equal(
              node.operation.replay.params.surface?.kind,
              'rough',
              `${node.id}: legacy rough surface must remain a rough replay surface`,
            );
            assert.ok(
              Number.isInteger(node.operation.replay.params.surface?.seed),
              `${node.id}: legacy rough surface must preserve its deterministic seed`,
            );
            assert.ok(
              node.operation.replay.params.surface?.profileId,
              `${node.id}: legacy rough surface must preserve its profile identity`,
            );
          }
          assert.ok(
            ['full', 'mask', 'invert'].includes(node.operation.replay.areaMode),
            `${node.id}: replay area mode must be normalized`,
          );
        }
      }
      assertRendererReadyState(
        node.state,
        `${example.id} Step ${node.operation?.label || node.id}`,
      );
    }

    for (const variant of project.snapshotBranches?.branches || []) {
      assert.ok(
        variant.headState?.model,
        `${example.id}/${variant.id}: Variant HEAD model missing`,
      );
      assertRendererReadyState(variant.headState, `${example.id} Variant ${variant.id} HEAD`);
    }
  }

  const literature = await loadLiteratureProject();
  assert.equal(literature.version, 14);
  assert.equal(literature.snapshotBranches.nodes.length, 46);
  assert.equal(literature.snapshotBranches.branches.length, 7);
  assert.equal(literature.snapshots.length, 20);
});

test('literature example keeps the intended Variant ancestry and HEADs', async () => {
  const project = await loadLiteratureProject(),
    branches = branchMap(project);

  assert.equal(project.snapshotBranches.activeBranchId, 'black-si-fig1a-final');
  assert.equal(branches.get('black-si-fig1a')?.parentBranchId, 'main');
  assert.equal(branches.get('black-si-fig1a-final')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('black-si-fig1a-qa')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('ge-fig15-common')?.parentBranchId, 'main');
  assert.equal(branches.get('ge-fig15-a')?.parentBranchId, 'ge-fig15-common');
  assert.equal(branches.get('ge-fig15-b')?.parentBranchId, 'ge-fig15-common');

  const ownStepCount = (branchId) =>
    project.snapshotBranches.nodes.filter((node) => node.branchId === branchId).length;
  assert.equal(ownStepCount('main'), 1);
  assert.equal(ownStepCount('black-si-fig1a'), 14);
  assert.equal(ownStepCount('black-si-fig1a-final'), 1);
  assert.equal(ownStepCount('black-si-fig1a-qa'), 1);
  assert.equal(ownStepCount('ge-fig15-common'), 13);
  assert.equal(ownStepCount('ge-fig15-a'), 7);
  assert.equal(ownStepCount('ge-fig15-b'), 9);
});


test('Ge process uses real sacrificial masks and source-order implantation', async () => {
  const project = await loadLiteratureProject();
  const nodes = project.snapshotBranches.nodes.filter(
    (node) => node.branchId === 'ge-fig15-common',
  );
  const labels = nodes.map((node) => node.operation.label);
  const where = (needle) => labels.findIndex((label) => label.includes(needle));
  assert.equal(nodes[0].operation.kind, 'base', 'Ge must start from its own Base');
  assert.ok(where('PECVD SiNx') > 0);
  assert.ok(where('Pattern SiNx') > where('PECVD SiNx'));
  assert.ok(where('B p+ front') > where('Pattern SiNx'));
  assert.ok(where('P n+ rear') > where('B p+ front'));
  assert.ok(where('Activate B/P') > where('P n+ rear'));
  assert.ok(where('Temporary ALD') > where('Activate B/P'));
  assert.ok(where('ICP-RIE Ge') > where('Temporary ALD'));
  assert.ok(where('H2O2 etch-back') > where('ICP-RIE Ge'));
  assert.ok(where('Strip temporary') > where('H2O2 etch-back'));
  assert.ok(where('HCl clean') > where('Strip temporary'));
  const sourceState = branchMap(project).get('ge-fig15-common').headState;
  assert.equal(sourceState.model.layers[0].name, 'n-Ge Sb · 302 µm · 29.1 Ωcm');
  for (const id of ['ge-fig15-a', 'ge-fig15-b']) {
    const next = branchMap(project).get(id);
    assert.ok(next.headState.processRecipe.steps.length > 15, id + ': missing full recipe');
    assert.ok(next.headState.processRecipe.steps.some(
      (step) => step.command === 'record' && /350°C/.test(step.params.label),
    ), id + ': final anneal should be a real History Step');
  }
});

test('Black-Si processing records drive-in and forming-gas anneals as independent Steps', async () => {
  const project = await loadLiteratureProject();
  const nodes = project.snapshotBranches.nodes.filter(
    (node) => node.branchId === 'black-si-fig1a',
  );
  const labels = nodes.map((node) => node.operation.label);
  for (const phrase of ['Drive-in', 'Remove drive-in oxide', 'Forming gas']) {
    assert.ok(labels.some((label) => label.includes(phrase)), phrase + ' missing');
  }
  const anneal = nodes.find((node) => node.operation.label.startsWith('Forming gas'));
  assert.equal(anneal.operation.kind, 'record');
  assert.equal(anneal.operation.temperatureC, 425);
  assert.ok(branchMap(project).get('black-si-fig1a-final').headState.processRecipe.steps.length >= 15);
});

test('Black-Si FINAL preserves ALD and front roughness while removing blanket Al', async () => {
  const project = await loadLiteratureProject(),
    common = branchModel(project, 'black-si-fig1a'),
    finalModel = branchModel(project, 'black-si-fig1a-final'),
    qa = branchModel(project, 'black-si-fig1a-qa'),
    commonVolumes = materialVolumes(common),
    finalVolumes = materialVolumes(finalModel),
    qaVolumes = materialVolumes(qa),
    ald = 'ALD Al2O3 · 50 nm',
    frontAl = 'Front sputtered Al · 300 nm',
    rearAl = 'Rear cathode Al · 1000 nm';

  assert.equal(common.processRevision, 15);
  assert.equal(finalModel.processRevision, 16);
  assert.equal(qa.processRevision, 16);

  assertClose(finalVolumes.get(ald), commonVolumes.get(ald), 1e-3, 'FINAL ALD volume');
  assert.ok(
    finalVolumes.get(frontAl) < commonVolumes.get(frontAl) * 0.2,
    'FINAL must strip most blanket front Al',
  );
  assert.ok(qaVolumes.get(ald) < finalVolumes.get(ald), 'QA overetch must remove protected ALD');

  const finalFront = exposedLayerNames(finalModel, 'front'),
    finalBack = exposedLayerNames(finalModel, 'back'),
    finalRough = roughSurfaceCounts(finalModel),
    qaRough = roughSurfaceCounts(qa);

  assert.ok(finalFront.has(ald), 'FINAL active surface must re-expose ALD');
  assert.ok(finalFront.has(frontAl), 'FINAL must retain patterned front Al contacts');
  assert.deepEqual([...finalBack], [rearAl]);
  assert.ok(finalRough.front > 0, 'FINAL must preserve the front rough interface');
  assert.equal(finalRough.back, 0, 'front roughness must never ghost onto Back');
  assert.equal(qaRough.front, 0, 'QA overetch is expected to destroy the protected rough surface');

  assert.equal(finalModel.implants.length, 2);
  assert.equal(finalModel.electricalRegions.length, 0);

  const frontAlId = finalModel.layers.find((layer) => layer.name === frontAl)?.id;
  assert.ok(frontAlId, 'front Al layer must exist');
  for (const [label, model] of [
    ['common', common],
    ['FINAL', finalModel],
  ]) {
    for (const region of model.regions || []) {
      const stack = region.stack || [];
      for (let index = 0; index < stack.length; index++) {
        const segment = stack[index];
        if (segment.role !== 'conformal-sidewall') continue;
        const outward = stack[index + 1];
        assert.notEqual(
          outward?.layerId,
          frontAlId,
          `${label}: directional front Al must not cap a conformal-sidewall surrogate`,
        );
      }
    }
  }

  const rearImplant = finalModel.implants.find((implant) => implant.face === 'back');
  assert.ok(rearImplant, 'FINAL rear Implant must exist');
  const rearBands = implantSectionBands(finalModel, project.section.a, project.section.b).filter(
    (band) => band.implantId === rearImplant.id,
  );
  assert.equal(
    rearBands.length,
    1,
    'continuous rear Implant must not expose host-region partition seams in Section',
  );
});

test('Ge Fig. 15 A/B preserve Electrical semantics and host-material ownership', async () => {
  const project = await loadLiteratureProject(),
    common = branchModel(project, 'ge-fig15-common'),
    modelA = branchModel(project, 'ge-fig15-a'),
    modelB = branchModel(project, 'ge-fig15-b'),
    commonVolumes = materialVolumes(common),
    aVolumes = materialVolumes(modelA),
    bVolumes = materialVolumes(modelB),
    geName = 'n-Ge Sb · 302 µm · 29.1 Ωcm',
    geLayerId = modelA.layers.find((layer) => layer.name === geName)?.id;

  assert.ok(geLayerId, 'Ge host layer must exist');
  // Conformal ownership canonicalizes the 0.1 nm shared XY grid. Allow at most
  // one part per billion of the unchanged bulk Ge volume for rounding effects.
  const geVolumeTolerance = Math.max(1e-3, commonVolumes.get(geName) * 1e-9);
  assertClose(aVolumes.get(geName), commonVolumes.get(geName), geVolumeTolerance, 'Fig. 15a Ge volume');
  assertClose(bVolumes.get(geName), commonVolumes.get(geName), geVolumeTolerance, 'Fig. 15b Ge volume');

  assert.equal(
    modelA.layers.some((layer) => /SiO2 inactive/i.test(layer.name)),
    false,
    'Fig. 15a must not contain the inactive SiO2 branch film',
  );
  assert.equal(
    modelB.layers.some((layer) => /SiO2 inactive/i.test(layer.name)),
    true,
    'Fig. 15b must contain the inactive SiO2 branch film',
  );

  assert.deepEqual(
    modelA.electricalRegions.map((region) => region.regionType),
    ['p-inversion'],
  );
  assert.deepEqual(
    new Set(modelB.electricalRegions.map((region) => region.regionType)),
    new Set(['p-inversion', 'n-accumulation']),
  );

  for (const model of [modelA, modelB]) {
    assert.equal(
      model.implants.some((implant) => /^INDUCED/i.test(implant.name)),
      false,
      'induced regions must never regress back to Implant placeholders',
    );
    assert.equal(model.implants.length, 2, 'real B/P contact implants must remain Implant');

    for (const region of model.electricalRegions) {
      assert.equal(region.source, 'induced');
      assert.ok(region.patches.length > 0);
      assert.ok(
        region.patches.every((patch) => patch.layerId === geLayerId),
        `${region.name}: source patch must remain bound to Ge`,
      );
    }

    const electricalSolids = electricalRegionSolids(model);
    assert.ok(electricalSolids.length > 0);
    assert.ok(
      electricalSolids.every((solid) => solid.hostLayerId === geLayerId),
      'rendered Electrical Regions must remain inside their Ge host material',
    );
  }

  assert.equal(roughSurfaceCounts(modelA).back, 0);
  assert.equal(roughSurfaceCounts(modelB).back, 0);
});

test('PERC example exposes only curated reconstruction variants with a saved inspection view', async () => {
  const project = await loadBundledProject('perc-point-contact-solar-cell'),
    active = branchMap(project).get(project.snapshotBranches.activeBranchId),
    branchNames = project.snapshotBranches.branches.map((branch) => branch.name);

  assert.ok(active);
  assert.match(active.name, /source-order reconstruction/i);
  assert.equal(project.snapshotBranches.branches.length, 3);
  assert.deepEqual(branchNames, [
    'PERC Fig. 1 · baseline reconstruction',
    'PERC Fig. 1 · GDS-patterned contacts',
    'PERC Fig. 1 · source-order reconstruction',
  ]);
  assert.equal(
    branchNames.some((name) => /test|proxy|check/i.test(name)),
    false,
  );
  assert.equal(project.model.processRevision, 18);
  assert.equal(project.model.implants.length, 2);
  assert.ok(project.model.layers.some((layer) => /Front passivation SiO2/i.test(layer.name)));
  assert.ok(project.model.layers.some((layer) => /Rear passivation SiO2/i.test(layer.name)));
  assert.ok(project.model.layers.some((layer) => /rear contact/i.test(layer.name)));
  assert.deepEqual(project.display.sectionCollapse, { top: 131.5727, bottom: -131.5727 });
  assert.equal(project.display.threeCamera?.position?.length, 3);
  assert.deepEqual(project.section, active.headState.section);
});

test('microdisk example contains a canonical suspended air gap and central Si support', async () => {
  const project = await loadBundledProject('suspended-silica-microdisk'),
    model = project.model,
    oxideId = model.layers.find((layer) => /Thermal SiO/i.test(layer.name))?.id;

  assert.equal(model.processRevision, 9);
  assert.equal(project.snapshotBranches.nodes.length, 9);
  assert.equal(project.snapshots.length, 9);
  assert.ok(oxideId);

  const releaseStep = project.snapshotBranches.nodes.find((node) =>
    /XeF₂ isotropic Si release/.test(node.operation?.label || ''),
  );
  assert.equal(releaseStep?.operation?.replay?.areaMode, 'invert');
  assert.equal(releaseStep?.operation?.replay?.params?.etchProfile, 'isotropic');
  assert.deepEqual(releaseStep?.operation?.replay?.params?.etchTargetLayerIds, ['base']);

  const oxideSegments = model.regions.flatMap((region) =>
      region.stack.filter((segment) => segment.layerId === oxideId),
    ),
    suspended = model.regions.filter((region) => {
      const oxide = region.stack.find((segment) => segment.layerId === oxideId),
        silicon = region.stack.find((segment) => segment.layerId === 'base');
      return oxide && silicon && oxide.z0 - silicon.z1 > 30;
    }),
    supported = model.regions.filter((region) => {
      const oxide = region.stack.find((segment) => segment.layerId === oxideId),
        silicon = region.stack.find((segment) => segment.layerId === 'base');
      return oxide && silicon && Math.abs(oxide.z0 - silicon.z1) < 1e-9;
    });

  assert.ok(oxideSegments.length >= 2);
  assert.ok(oxideSegments.every((segment) => Math.abs(segment.z1 - segment.z0 - 1.8) < 1e-9));
  assert.ok(suspended.length > 0, 'released annulus must retain a real canonical air gap');
  assert.ok(supported.length > 0, 'central silica support must remain in contact with Si');
});
