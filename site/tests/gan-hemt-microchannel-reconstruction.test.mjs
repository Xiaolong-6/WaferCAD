import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGanMicrochannel,
  GAN_MICROCHANNEL_DOI,
  GAN_MICROCHANNEL_MASKS,
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
  assert.equal(masks.get(18).rectangles.length, 10);
  assert.ok(masks.get(18).rectangles.every((r) => r.w === 0.5 && r.h === 300));
  assert.equal(masks.get(16).rectangles[0].w, 878.5);
  assert.equal(masks.get(16).rectangles[0].h, 1120);
});

test('Lian 2022 structure uses true stepped voids, a suspended die and replayable history', async () => {
  const { project, json, validation } = await buildGanMicrochannel();
  assert.equal(validation.pass, true);
  assert.equal(validation.mode, 'geometry-surrogate-not-wafer-bond-simulation');
  assert.ok(validation.processNodes >= 20);
  assert.ok(validation.bookmarks >= 5);
  assert.equal(validation.recipeSteps, project.processRecipe.steps.length);
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  validateProcessModel(project.model);
  validateProjectFile(project);

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
  // TSV bores pass completely through the interposer, outside the central chip.
  assert.equal(stackAt(project.model, [-1450, -950]).length, 0);
  assert.equal(stackAt(project.model, [1450, 950]).length, 0);
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
  assert.ok(elements.length >= 30);
  const gds = parseGDS(serializeGDS(elements).buffer);
  const oas = await parseOAS(serializeOASIS(elements).buffer);
  assert.equal(flattenGDS(gds, gds.root).elements.length, elements.length);
  assert.equal(flattenGDS(oas, oas.root).elements.length, elements.length);
});
