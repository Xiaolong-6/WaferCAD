import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildGanMicrochannel,
  GAN_MICROCHANNEL_DOI,
  GAN_MICROCHANNEL_MASKS,
  GAN_SILICON_COLOR,
  GAN_MANIFOLD_PARAMETERS,
  GAN_LOWER_FEED,
  GAN_TSV_LINER,
  GAN_HEMT_STACK,
  GAN_GSG_STACK,
  ganManifoldCenterline,
} from '../../scripts/build-gan-hemt-microchannel-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { createSnapshotManager } from '../workspace-snapshots.js';

await loadGeometryKernel();
const { pointInMulti } = await import('../vector-geometry.js');
const { readProjectFile } = await import('../project-io.js');

const { validateProjectFile, validateProcessModel } = await import('../project-schema.js');
const { collectMaskExportElements, serializeGDS, serializeOASIS } =
  await import('../layout-export.js');
const { parseGDS, flattenGDS } = await import('../gds.js');
const { parseOAS } = await import('../oasis.js');

function stackAt(model, xy) {
  return model.regions.filter((region) => pointInMulti(xy, region.geom)).flatMap((r) => r.stack);
}

function solidAt(model, xy, z) {
  return stackAt(model, xy).some((segment) => segment.z0 < z && segment.z1 > z);
}

test('Lian 2022 derived mask values distinguish reported from inferred geometry', () => {
  assert.equal(GAN_MICROCHANNEL_DOI, '10.1038/s41378-022-00462-3');
  const masks = new Map(GAN_MICROCHANNEL_MASKS.map((mask) => [mask.id, mask]));
  assert.equal(masks.get(10).rectangles[0].w, 700);
  assert.equal(masks.get(10).rectangles[0].h, 900);
  assert.equal(masks.get(23).rectangles.length, 2);
  assert.equal(masks.get(25).rectangles.length, 4);
  assert.ok(
    masks.get(25).rectangles.every((r) => r.w === 90 && r.h === 90),
    'TSV seed coating window must include the actual material sidewall',
  );
  assert.equal(GAN_TSV_LINER.titaniumUm, 0.2);
  assert.equal(GAN_TSV_LINER.copperUm, 0.5);
  assert.equal(GAN_LOWER_FEED.portOffsetY, 1450);
  assert.ok(masks.get(23).rectangles.every((r) => r.w === 110 && r.h === 1100));
  assert.equal(masks.get(13).rectangles.length, 6);
  assert.ok(masks.get(13).rectangles.every((r) => r.w === 30 && r.h === 760));
  const topStripes = masks.get(13).rectangles;
  const leftEdge = Math.min(...topStripes.map((r) => r.x));
  const rightEdge = Math.max(...topStripes.map((r) => r.x + r.w));
  assert.equal(rightEdge - leftEdge, 330, 'Six 30/30 channels span 330 um, not 380 um');
  assert.equal(
    (380 - (rightEdge - leftEdge)) / 2,
    25,
    'Remaining 25 um per edge of the paper footprint is an inferred solid margin',
  );
  const manifold = masks.get(22);
  assert.ok(manifold, 'Missing independent mask for Fig. 2h inlet/outlet diversion');
  assert.equal(manifold.polygons.length, 12, 'Every straight channel needs two fanout arms');
  assert.equal(manifold.rectangles.length, 2, 'Expected inlet and outlet throat openings');
  assert.equal(GAN_MANIFOLD_PARAMETERS.throatWidth, 110);
  assert.deepEqual(ganManifoldCenterline(150, 1)[0], [150, 355]);
  assert.deepEqual(ganManifoldCenterline(150, 1).at(-1), [33, 425]);
  const outerCurve = ganManifoldCenterline(150, 1);
  const middleCurve = ganManifoldCenterline(90, 1);
  const innerCurve = ganManifoldCenterline(30, 1);
  assert.ok(
    Math.max(...outerCurve.map((point) => point[1])) > 470,
    'Outermost branch must wrap around the throat as in Fig. 2h',
  );
  assert.ok(
    Math.max(...middleCurve.map((point) => point[1])) > 435,
    'Middle branch must form an intermediate nested return bend',
  );
  assert.ok(
    Math.max(...innerCurve.map((point) => point[1])) < 435,
    'Innermost branch should approach the collecting throat directly',
  );
  assert.deepEqual(
    ganManifoldCenterline(150, -1).map(([x, y]) => [x, -y]),
    outerCurve,
    'Entry and exit diversion loops must be symmetric',
  );
  assert.equal(GAN_HEMT_STACK.barrierUm, 0.025);
  assert.equal(GAN_HEMT_STACK.isolationSiNUm, 0.15);
  assert.equal(masks.get(24).rectangles.length, 4, 'Isolation requires an open active window');
  assert.ok(
    masks.get(24).rectangles.every((r) => r.w > 0 && r.h > 0),
    'SiN frame contains a degenerate shape',
  );
  assert.equal(masks.get(18).rectangles.length, 10);
  assert.ok(masks.get(18).rectangles.every((r) => r.w === 0.5 && r.h === 300));
  assert.equal(masks.get(16).rectangles[0].w, 878.5);
  assert.equal(masks.get(16).rectangles[0].h, 1120);
  assert.equal(masks.get(26).rectangles.length, 2);
  assert.equal(masks.get(27).rectangles.length, 2);
  assert.equal(masks.get(20).rectangles.length, 6);
  assert.equal(GAN_GSG_STACK.substrateThicknessUm, 100);
});

test('Lian 2022 structure uses true stepped voids, a suspended die and replayable history', async () => {
  const { project, json, validation } = await buildGanMicrochannel();
  assert.equal(validation.pass, true);
  assert.equal(validation.mode, 'geometry-surrogate-not-wafer-bond-simulation');
  assert.equal(validation.maskLayers, 18);
  assert.equal(
    GAN_MICROCHANNEL_MASKS.some((mask) => mask.id === 28),
    false,
    'Temporary partial-oxide protection mask must not ship in the full-exposure example',
  );
  assert.equal(validation.processNodes, 40);
  assert.equal(validation.recipeSteps, 39);
  assert.equal(validation.checks.actualDoubleSidedTiCuSputteredMaterials, true);
  assert.equal(validation.checks.frontBackExteriorSiO2WithUnsealedCoolant, true);
  assert.equal(validation.checks.localizedTsvSiO2ConformalGeometryWithoutCoolantBlockage, true);
  assert.equal(validation.checks.twoInferredGsgDieBodiesAndPadsAreRealGeometry, true);
  // Candidate process-order contract: source paper distinguishes metalized
  // TSVs from HEMT-to-GSG Au wire bonds. Do not turn a metadata-only assembly
  // record into an assertion of physical electrical connectivity.
  const recipe = project.processRecipe.steps;
  const depositIndex = (material) =>
    recipe.findIndex((step) => step.command === 'deposit' && step.params.material === material);
  const wireBondRecordIndex = recipe.findIndex(
    (step) => step.command === 'record' && step.params.label.includes('Au wire bonds'),
  );
  const frontOxideIndex = depositIndex('Interposer front exposed-surface SiO2 0.5 um (inferred)');
  const backOxideIndex = depositIndex('Interposer back exposed-surface SiO2 0.5 um (inferred)');
  const localOxideIndex = depositIndex('TSV SiO2 local oxide surrogate 0.5 um (inferred)');
  const frontTiIndex = depositIndex('Interposer front Ti sputter 0.2 um');
  const backTiIndex = depositIndex('Interposer back Ti sputter 0.2 um');
  const frontCuIndex = depositIndex('Interposer front Cu sputter 0.5 um');
  const backCuIndex = depositIndex('Interposer back Cu sputter 0.5 um');
  const tiSeedIndex = depositIndex('TSV Ti conformal seed surrogate 0.2 um');
  const cuSeedIndex = depositIndex('TSV Cu conformal seed surrogate 0.5 um');
  const cuFillIndex = depositIndex('TSV Cu electrofill surrogate 35 um');
  const cuPlanarizationIndex = recipe.findIndex(
    (step) =>
      step.command === 'etch' && step.params.target === 'TSV Cu electrofill surrogate 35 um',
  );
  const solderIndex = depositIndex('AuSn perimeter solder (5 um surrogate)');
  const sicIndex = depositIndex('GaN HEMT SiC substrate 99 um');
  const gsgSolderIndex = depositIndex('GSG AuSn solder supports 5 um (inferred)');
  const gsgDieIndex = depositIndex('GSG chip substrate surrogate (100 um inferred)');
  const gsgIndex = depositIndex('GSG Au pads surrogate 0.5 um');
  assert.ok(
    [
      frontOxideIndex,
      backOxideIndex,
      localOxideIndex,
      frontTiIndex,
      backTiIndex,
      frontCuIndex,
      backCuIndex,
      tiSeedIndex,
      cuSeedIndex,
      cuFillIndex,
      cuPlanarizationIndex,
      solderIndex,
      gsgSolderIndex,
      sicIndex,
      gsgDieIndex,
      gsgIndex,
      wireBondRecordIndex,
    ].every((index) => index >= 0),
    'Expected physical TSV/HEMT materials and separate wire-bond source record',
  );
  assert.ok(
    frontOxideIndex < backOxideIndex &&
      backOxideIndex < localOxideIndex &&
      localOxideIndex < frontTiIndex &&
      frontTiIndex < backTiIndex &&
      backTiIndex < frontCuIndex &&
      frontCuIndex < backCuIndex &&
      backCuIndex < tiSeedIndex &&
      tiSeedIndex < cuSeedIndex &&
      cuSeedIndex < cuFillIndex &&
      cuFillIndex < cuPlanarizationIndex &&
      cuPlanarizationIndex < solderIndex &&
      solderIndex < gsgSolderIndex &&
      gsgSolderIndex < sicIndex &&
      sicIndex < gsgDieIndex &&
      gsgDieIndex < gsgIndex &&
      gsgIndex < wireBondRecordIndex,
    'Surrogate TSV metallization, assembly and recorded Au wire bonding are out of order',
  );
  assert.equal(validation.checks.bothBacksidePortsConnectToAllSixTopChannels, true);
  assert.equal(validation.checks.retainedInterChannelSiRibs, true);
  assert.equal(validation.checks.longSupplyReturnRoutesReachBothRemotePorts, true);
  assert.equal(validation.checks.physicalAlGaNAndSiNWith2DEGOnlyAsMetadata, true);
  assert.equal(validation.checks.fourTSVsWithContinuousTiCuSeedGeometry, true);
  assert.equal(validation.checks.fourTSVsAreActualCuFilledColumns, true);
  assert.equal(validation.checks.fourCuFilledTSVsWithUnblockedCoolant, true);
  assert.equal(validation.checks.idealizedCuPlanarizationPreservesTSVConductors, true);
  assert.equal(
    project.processRecipe.steps.filter(
      (step) =>
        step.command === 'deposit' &&
        step.params.coverage === 'conformal' &&
        step.params.material.startsWith('TSV '),
    ).length,
    4,
    'Native Recipe must replay local SiO2, Ti/Cu coating and inferred Cu electrofill',
  );
  assert.ok(
    project.processRecipe.steps.some(
      (step) => step.command === 'record' && step.params.label.includes('2DEG'),
    ),
    '2DEG interface must be explicitly recorded as non-geometric metadata',
  );
  assert.ok(
    project.processRecipe.steps.some(
      (step) =>
        step.command === 'etch' &&
        step.params.mask?.layerKeys?.includes('22|0') &&
        step.params.target === 'Si geometric bridge tier 4',
    ),
  );
  assert.ok(validation.processNodes >= 20);
  assert.ok(validation.bookmarks >= 5);
  assert.equal(validation.recipeSteps, project.processRecipe.steps.length);
  const manifoldReview = project.snapshots.find((snapshot) =>
    snapshot.name.startsWith('01 Four-level open microchannels'),
  );
  assert.ok(manifoldReview, 'No pre-assembly manifold inspection bookmark');
  // A Bookmark with a custom 3D camera/ROI/Section intentionally differs
  // from the associated Process Step state. Snapshot Manager describes it as a
  // distinct checkpoint; the History UI must nevertheless offer the same
  // "Restore bookmark" action as for an ordinary Step-aligned bookmark.
  let live = project;
  const history = createSnapshotManager({
    capture: () => live,
    restore: (state) => {
      live = state;
    },
    validateState: (state) => {
      try {
        validateProcessModel(state.model);
        return true;
      } catch {
        return false;
      }
    },
  });
  history.importRecords(project.snapshots, project.snapshotBranches);
  const listedBookmark = history.list().find((record) => record.id === manifoldReview.id);
  assert.ok(listedBookmark, 'First manifold Bookmark was lost during Snapshot Manager import');
  assert.equal(
    listedBookmark.legacyCheckpoint,
    true,
    'Custom inspection state must remain distinct from the Process Step checkpoint',
  );
  assert.equal(
    history.restore(listedBookmark.id),
    true,
    'Custom inspection Bookmark cannot restore',
  );
  assert.deepEqual(live.roi, manifoldReview.state.roi);
  assert.deepEqual(live.section, manifoldReview.state.section);
  assert.deepEqual(live.display.threeCamera, manifoldReview.state.display.threeCamera);
  assert.equal(
    live.model.layers.some((layer) => layer.name.startsWith('GaN HEMT SiC substrate')),
    false,
    'The restored pre-assembly Bookmark incorrectly contains the final HEMT',
  );
  assert.deepEqual(manifoldReview.state.roi, {
    type: 'rect',
    a: [-500, -520],
    b: [500, 520],
  });
  assert.deepEqual(manifoldReview.state.section, { a: [30, -500], b: [30, 500] });
  assert.deepEqual(manifoldReview.state.display.threeCamera, {
    position: [650, -740, 1530],
    target: [0, 0, 440],
    fov: 36,
  });
  assert.ok(
    !manifoldReview.state.model.layers.some((layer) =>
      layer.name.startsWith('GaN HEMT SiC substrate'),
    ),
    'Pre-assembly manifold view must not be obscured by the attached HEMT',
  );
  assert.ok(
    project.model.layers.some((layer) => layer.name.startsWith('GaN HEMT SiC substrate')),
    'Final integrated project must still contain the HEMT',
  );
  const hemtReview = project.snapshots.find((s) => s.name.startsWith('05 HEMT active'));
  assert.ok(hemtReview, 'Missing HEMT active structure inspection Bookmark');
  assert.deepEqual(hemtReview.state.section, { a: [-440, 0], b: [440, 0] });
  assert.deepEqual(hemtReview.state.display.threeCamera, {
    position: [1650, -2150, 2350],
    target: [0, 0, 580],
    fov: 37,
  });
  assert.deepEqual(hemtReview.state.roi, {
    type: 'rect',
    a: [-470, -580],
    b: [470, 580],
  });
  const alganLayer = project.model.layers.find((layer) =>
    layer.name.startsWith('AlGaN barrier surrogate'),
  );
  const sinLayer = project.model.layers.find((layer) =>
    layer.name.startsWith('SiN isolation/passivation surrogate'),
  );
  assert.ok(alganLayer && sinLayer);
  assert.equal(
    project.model.layers.some((layer) => /2DEG/i.test(layer.name)),
    false,
    '2DEG is an electronic state rather than a physically deposited solid',
  );
  const oxideBookmark = project.snapshots.find((s) => s.name.startsWith('03a TSV local SiO2'));
  assert.ok(oxideBookmark, 'Physical local TSV oxide needs a saved pre-metallization state');
  const oxideLayer = project.model.layers.find(
    (layer) => layer.name === 'TSV SiO2 local oxide surrogate 0.5 um (inferred)',
  );
  assert.ok(oxideLayer, 'Local TSV SiO2 layer is missing');
  const platedTSV = project.snapshots.find((s) => s.name.startsWith('03b Open Ti/Cu-lined'));
  assert.ok(platedTSV, 'Ti/Cu deposition needs a distinct scientific Bookmark');
  const filledBookmark = project.snapshots.find((r) => r.name.startsWith('03c Cu-filled TSV'));
  assert.ok(filledBookmark, 'Full Cu TSV geometry needs a distinct History Bookmark');
  assert.ok(
    project.model.layers.some((layer) => layer.name === 'TSV Ti conformal seed surrogate 0.2 um'),
  );
  assert.ok(
    project.model.layers.some((layer) => layer.name === 'TSV Cu conformal seed surrogate 0.5 um'),
  );
  const fillLayer = project.model.layers.find(
    (l) => l.name === 'TSV Cu electrofill surrogate 35 um',
  );
  assert.ok(fillLayer, 'Model is missing full-depth Cu TSV fill layer');
  const zTop = (node) =>
    Math.max(
      ...node.state.model.regions.flatMap((r) =>
        r.stack.filter((s) => s.layerId === fillLayer.id).map((s) => s.z1),
      ),
    );
  const preCmp = project.snapshotBranches.nodes.find((n) =>
    n.operation.label.includes('Idealized Cu TSV electrofill'),
  );
  const postCmp = project.snapshotBranches.nodes.find((n) =>
    n.operation.label.includes('Planarize TSV Cu overburden'),
  );
  assert.ok(preCmp && postCmp, 'Missing separately replayable Cu deposition and CMP');
  assert.ok(Math.abs(zTop(preCmp) - 637.4) < 1e-6);
  assert.ok(Math.abs(zTop(postCmp) - 602.4) < 1e-6);
  const tsvInspection = project.snapshots.find((s) => s.name.startsWith('06 Integrated GaN HEMT'));
  assert.ok(tsvInspection);
  assert.equal(tsvInspection.state.roi, null);
  assert.deepEqual(tsvInspection.state.section, { a: [-1800, 950], b: [1800, 950] });
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.equal(project.planViews.main.zoom, 2.5);
  assert.equal(project.planViews.mask.zoom, 1);
  assert.deepEqual(project.section, { a: [30, -1700], b: [30, 1700] });
  assert.deepEqual(
    project.display.sectionCollapse,
    { top: 0, bottom: -150, enabled: false },
    'Section default must show all four microchannel tiers without hidden Z interval',
  );
  assert.deepEqual(
    project.roi,
    {
      type: 'rect',
      a: [0, -1650],
      b: [650, 1650],
    },
    'Saved ROI must be a local 3D inspection crop',
  );
  assert.deepEqual(
    project.display.threeCamera,
    {
      position: [-1700, -2250, 1500],
      target: [200, 0, 330],
      fov: 36,
    },
    'Saved camera must focus on chip and microchannels',
  );
  const siLayers = project.model.layers.filter(
    (layer) => layer.id === 'base' || layer.name.startsWith('Si geometric bridge tier '),
  );
  assert.equal(siLayers.length, 5);
  assert.equal(new Set(siLayers.map((layer) => layer.id)).size, 5);
  assert.ok(
    siLayers.every((layer) => layer.color === GAN_SILICON_COLOR),
    'Physically identical Si layers must use one material color',
  );
  // X = 0 misses the top fingers; X = 30 intersects a published-width channel.
  // The cavity widens with depth: 380 -> 480 -> 600 -> 700 um.
  for (const [point, voidZ] of [
    [[30, 0], 550],
    [[200, 0], 450],
    [[280, 0], 350],
    [[340, 0], 250],
  ]) {
    assert.equal(
      solidAt(project.model, point, voidZ),
      false,
      'Stepped cavity unexpectedly occupied at ' + point + ', z=' + voidZ,
    );
  }
  // AuSn and SiC bridge over the fluid gap; no material fills the coolant volume.
  assert.equal(solidAt(project.model, [30, 0], 580), false);
  assert.equal(solidAt(project.model, [30, 0], 650), true);
  assert.equal(solidAt(project.model, [2000, 0], 550), true);
  // The two backside fluid ports open into the central bottom chamber.
  for (const y of [-1450, 1450]) {
    assert.equal(solidAt(project.model, [0, y], -100), false);
    assert.equal(solidAt(project.model, [0, y], 100), false);
  }
  for (const y of [-1200, 1200]) {
    assert.equal(solidAt(project.model, [0, y], 100), false);
    assert.equal(solidAt(project.model, [100, y], 100), true);
  }
  assert.equal(solidAt(project.model, [0, 0], -100), true);
  assert.equal(solidAt(project.model, [0, 0], 100), false);
  // All four vias have real Cu-filled cores. Test the idealized physical
  // material, not just the presence of a layer label or render artifact.
  for (const x of [-1450, 1450]) {
    for (const y of [-950, 950]) {
      for (const z of [-150, -50, 50, 150, 250, 350, 450, 550]) {
        assert.ok(
          stackAt(project.model, [x, y]).some(
            (seg) => seg.layerId === fillLayer.id && seg.z0 < z && seg.z1 > z,
          ),
          'Cu TSV core missing at ' + [x, y, z],
        );
        assert.equal(
          solidAt(project.model, [x + 43, y], z),
          true,
          'Surrounding silicon TSV wall missing at ' + [x + 43, y, z],
        );
      }
    }
  }
  // SiC backside at x=30 contacts the open cooling domain. No surrogate
  // bridge layer or hidden coolant film may occupy the fluid-to-SiC gap.
  const channel = stackAt(project.model, [30, 0]);
  const sicId = project.model.layers.find(
    (layer) => layer.name === 'GaN HEMT SiC substrate 99 um',
  ).id;
  const sic = channel.find((segment) => segment.layerId === sicId);
  assert.ok(sic, 'GaN-on-SiC chip is not positioned over channel');
  assert.equal(sic.z0, 606.2, 'AuSn bond stand-off must set the SiC backside at z=606.2');
  assert.equal(sic.z1 - sic.z0, 99);
  assert.equal(
    solidAt(project.model, [30, 0], 606.19),
    false,
    'Cooling liquid must contact exposed SiC bottom face',
  );
  const layers = project.model.layers.map((layer) => layer.name);
  assert.ok(layers.includes('GaN HEMT SiC substrate 99 um'));
  assert.ok(layers.includes('GaN buffer 1 um'));

  const saved = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(saved);
  assert.deepEqual(saved.model, project.model);
  assert.equal(saved.snapshotBranches.nodes.length, project.snapshotBranches.nodes.length);
  assert.equal(saved.snapshots.length, project.snapshots.length);
  assert.deepEqual(saved.processRecipe, project.processRecipe);

  // The committed Draft asset must reflect the current generator, including
  // the source/assumption history, structural materials and saved view setup.
  const assetUrl = new URL('../examples/gan-hemt-microchannel-2022.wafercad', import.meta.url);
  const assetBytes = await readFile(assetUrl);
  const asset = await readProjectFile({
    size: assetBytes.byteLength,
    text: async () => assetBytes.toString('utf8'),
  });
  validateProjectFile(asset);
  assert.deepEqual(asset.model, project.model, 'Bundled physical model is stale');
  assert.deepEqual(asset.roi, project.roi, 'Bundled local inspection ROI is stale');
  assert.deepEqual(asset.planViews, project.planViews, 'Bundled Main zoom is stale');
  assert.deepEqual(
    asset.display.threeCamera,
    project.display.threeCamera,
    'Bundled 3D camera is stale',
  );
  assert.equal(asset.snapshotBranches.nodes.length, project.snapshotBranches.nodes.length);
  assert.equal(asset.snapshots.length, project.snapshots.length);
  const committedManifoldBookmark = asset.snapshots.find((snapshot) =>
    snapshot.name.startsWith('01 Four-level open microchannels'),
  );
  assert.deepEqual(
    committedManifoldBookmark?.state.roi,
    manifoldReview.state.roi,
    'Committed manifold inspection crop is stale',
  );
  assert.deepEqual(
    committedManifoldBookmark?.state.section,
    manifoldReview.state.section,
    'Committed manifold inspection section is stale',
  );
  assert.deepEqual(
    committedManifoldBookmark?.state.display.threeCamera,
    manifoldReview.state.display.threeCamera,
    'Committed manifold inspection 3D camera is stale',
  );

  // Small preview stores the exact same canonical root material geometry,
  // with all intermediate models stripped and one saved inspection step.
  const previewBytes = await readFile(
    new URL('../examples/previews/gan-hemt-microchannel-2022.wafercad', import.meta.url),
  );
  const preview = await readProjectFile({
    size: previewBytes.byteLength,
    text: async () => previewBytes.toString('utf8'),
  });
  validateProjectFile(preview);
  assert.deepEqual(preview.model, asset.model, 'Preview changed the final physical structure');
  assert.deepEqual(preview.layout, asset.layout, 'Preview lost the editable mask');
  assert.equal(preview.snapshotBranches.nodes.length, 1);
  assert.equal(preview.snapshotBranches.branches.length, 1);
  assert.equal(preview.snapshots.length, 0);
  assert.deepEqual(preview.roi, asset.roi);
  assert.deepEqual(preview.display.threeCamera, asset.display.threeCamera);
});

test('Lian 2022 inferred mask layout exports as both GDSII and OASIS', async () => {
  const { project } = await buildGanMicrochannel();
  const elements = collectMaskExportElements({
    layout: project.layout,
    maskSourceMode: 'file',
    drawMask: project.drawMask,
    maskTransform: project.maskTransform,
    maskRoi: null,
    selectedCells: new Set([project.layout.root]),
    selectedLayerKeys: new Set(GAN_MICROCHANNEL_MASKS.map((mask) => mask.id + '|0')),
  }).elements;
  assert.ok(elements.length >= 45);
  assert.equal(
    elements.filter((element) => element.layer === 22).length,
    14,
    'GDS/OAS layout must include all twelve arms and two polygon throats',
  );
  const gds = parseGDS(serializeGDS(elements).buffer);
  const oas = await parseOAS(serializeOASIS(elements).buffer);
  assert.equal(flattenGDS(gds, gds.root).elements.length, elements.length);
  assert.equal(flattenGDS(oas, oas.root).elements.length, elements.length);
});
