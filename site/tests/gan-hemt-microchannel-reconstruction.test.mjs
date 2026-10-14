import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildGanMicrochannel,
  GAN_MICROCHANNEL_DOI,
  GAN_MICROCHANNEL_MASKS,
  GAN_SILICON_COLOR,
  GAN_MANIFOLD_PARAMETERS,
  ganManifoldCenterline,
} from '../../scripts/build-gan-hemt-microchannel-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

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
  assert.equal(masks.get(13).rectangles.length, 6);
  assert.ok(masks.get(13).rectangles.every((r) => r.w === 30 && r.h === 760));
  const manifold = masks.get(22);
  assert.ok(manifold, 'Missing independent mask for Fig. 2h inlet/outlet diversion');
  assert.equal(manifold.polygons.length, 12, 'Every straight channel needs two fanout arms');
  assert.equal(manifold.rectangles.length, 2, 'Expected inlet and outlet throat openings');
  assert.equal(GAN_MANIFOLD_PARAMETERS.throatWidth, 110);
  assert.deepEqual(ganManifoldCenterline(150, 1)[0], [150, 355]);
  assert.deepEqual(ganManifoldCenterline(150, 1).at(-1), [33, 430]);
  assert.equal(masks.get(18).rectangles.length, 10);
  assert.ok(masks.get(18).rectangles.every((r) => r.w === 0.5 && r.h === 300));
  assert.equal(masks.get(16).rectangles[0].w, 878.5);
  assert.equal(masks.get(16).rectangles[0].h, 1120);
});

test('Lian 2022 structure uses true stepped voids, a suspended die and replayable history', async () => {
  const { project, json, validation } = await buildGanMicrochannel();
  assert.equal(validation.pass, true);
  assert.equal(validation.mode, 'geometry-surrogate-not-wafer-bond-simulation');
  assert.equal(validation.maskLayers, 13);
  assert.equal(validation.processNodes, 23);
  assert.equal(validation.recipeSteps, 22);
  assert.equal(validation.checks.bothBacksidePortsConnectToAllSixTopChannels, true);
  assert.equal(validation.checks.retainedInterChannelSiRibs, true);
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
  assert.deepEqual(manifoldReview.state.roi, {
    type: 'rect',
    a: [-500, -520],
    b: [500, 520],
  });
  assert.deepEqual(manifoldReview.state.section, { a: [0, -500], b: [0, 500] });
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
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.equal(project.planViews.main.zoom, 2.5);
  assert.equal(project.planViews.mask.zoom, 1);
  assert.deepEqual(
    project.display.sectionCollapse,
    { top: 0, bottom: -150, enabled: false },
    'Section default must show all four microchannel tiers without hidden Z interval',
  );
  assert.deepEqual(
    project.roi,
    {
      type: 'rect',
      a: [-650, 0],
      b: [650, 650],
    },
    'Saved ROI must be a local 3D inspection crop',
  );
  assert.deepEqual(
    project.display.threeCamera,
    {
      position: [1050, -1650, 1120],
      target: [0, 0, 370],
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
  for (const y of [-415, 415]) {
    assert.equal(solidAt(project.model, [0, y], -100), false);
    assert.equal(solidAt(project.model, [0, y], 100), false);
  }
  assert.equal(solidAt(project.model, [0, 0], -100), true);
  assert.equal(solidAt(project.model, [0, 0], 100), false);
  // The screenshot's four apparent vertical pillars must be *empty bores*
  // with solid surrounding Si. Assert cross-section at each published-side
  // illustrative TSV, not only one XY center / one axial elevation.
  for (const x of [-1450, 1450]) {
    for (const y of [-950, 950]) {
      for (const z of [-150, -50, 50, 150, 250, 350, 450, 550]) {
        assert.equal(
          solidAt(project.model, [x, y], z),
          false,
          'TSV became a solid pillar at ' + [x, y, z],
        );
        assert.equal(
          solidAt(project.model, [x + 43, y], z),
          true,
          'Silicon TSV sidewall is missing at ' + [x + 43, y, z],
        );
      }
      for (const dx of [-20, 0, 20]) {
        for (const dy of [-20, 0, 20]) {
          assert.equal(
            stackAt(project.model, [x + dx, y + dy]).length,
            0,
            'TSV bore has a filled corner at ' + [x + dx, y + dy],
          );
        }
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
  assert.equal(sic.z0, 605, 'AuSn bond stand-off must set the SiC backside at z=605');
  assert.equal(sic.z1 - sic.z0, 99);
  assert.equal(
    solidAt(project.model, [30, 0], 604.99),
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
