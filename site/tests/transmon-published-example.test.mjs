import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { directApertureStackFromGds } = await import('../direct-aperture-from-gds.js');
const { directIncidenceArea } = await import('../direct-incidence-geometry.js');
const { geometryArea } = await import('../model.js');
const { difference, intersection, pointInMulti, unionGeometries } =
  await import('../vector-geometry.js');

test('published original-GDS Q2 keeps real native Al material owners without claiming electrical physics', async () => {
  const bytes = await readFile(
    new URL('../examples/transmon-q2-original-gds.wafercad', import.meta.url),
  );
  const project = await readProjectFile(new Blob([bytes], { type: 'application/json' }));
  const { model, layout } = project;
  assert.equal(model.kernel, 'vector-2.5d-v1');
  assert.equal(model.thickness, 675);
  assert.equal(layout.elements.length, 17);
  assert.equal(layout.root, 'jj_width0p18');
  assert.deepEqual(
    new Set(layout.elements.map((element) => `${element.layer}/${element.datatype}`)),
    new Set(['8/0', '8/1']),
  );
  assert.equal(model.regions.length, 9);
  assert.equal(model.layers.length, 5);
  assert.equal(
    model.layers.some((layer) => /AlOx|MMA|PMMA/.test(layer.name)),
    false,
  );
  assert.equal(
    project.processRecipe,
    undefined,
    'Do not invent a replayable physical resist process',
  );
  assert.equal(
    project.snapshotBranches.nodes.length,
    1,
    'One authentic source geometry checkpoint',
  );
  assert.equal(project.snapshotBranches.nodes[0].operation.geometryCheckpoint, true);
  assert.equal(project.snapshotBranches.nodes[0].operation.replay, undefined);
  const coverage = unionGeometries(model.regions.map((region) => region.geom));
  assert.ok(geometryArea(difference(model.boundary, coverage)) < 1e-8, 'No missing XY coverage');
  assert.ok(geometryArea(difference(coverage, model.boundary)) < 1e-8, 'No outside XY coverage');
  const ownerSum = model.regions.reduce((sum, region) => sum + geometryArea(region.geom), 0);
  assert.ok(Math.abs(ownerSum - geometryArea(model.boundary)) < 1e-8, 'No duplicate XY owners');
  const occupied = (layerId) =>
    unionGeometries(
      model.regions
        .filter((region) => region.stack.some((segment) => segment.layerId === layerId))
        .map((region) => region.geom),
    );
  const overlap = geometryArea(intersection(occupied('layer-2'), occupied('layer-3')));
  assert.ok(
    Math.abs(overlap - 0.03226275) < 1e-8,
    `Unexpected original-GDS Al1/Al2 overlap ${overlap} µm²`,
  );
  const allAl = model.layers.filter((layer) => /^Native Al /.test(layer.name));
  assert.equal(allAl.length, 3, 'Exactly three native Al doses');
});

test('Q2 inspection shows the real three-Al crossing without changing material ownership', async () => {
  const readExample = async (suffix) => {
    const bytes = await readFile(new URL(suffix, import.meta.url));
    return readProjectFile(new Blob([bytes], { type: 'application/json' }));
  };
  const published = await readExample('../examples/transmon-q2-original-gds.wafercad');
  const preview = await readExample('../examples/previews/transmon-q2-original-gds.wafercad');
  const crossing = published.model.regions.find((region) => pointInMulti([-5, 0], region.geom));
  assert.ok(crossing, 'The source-GDS crossing must have a physical material owner');
  assert.deepEqual(
    crossing.stack.map(({ layerId }) => layerId),
    ['base', 'layer-2', 'layer-3', 'layer-4'],
    'Do not fill an apparent screen-space gap with fabricated Al or a barrier',
  );
  assert.deepEqual(
    crossing.stack.slice(1).map(({ z0, z1 }) => Number((z1 - z0).toFixed(4))),
    [0.04, 0.03, 0.03],
    'Retain physical 40/30/30 nm material thicknesses',
  );
  const expectedCollapse = { top: 337.3, bottom: -337.3, enabled: true };
  assert.deepEqual(published.display.sectionCollapse, expectedCollapse);
  assert.deepEqual(published.display.threeCamera.target, [-5, 0, 1.55]);
  assert.ok(
    published.display.threeCamera.position[2] > published.display.threeCamera.target[2],
    'Inspect the junction from above, not through the bulk substrate',
  );
  for (const state of [
    published.snapshotBranches.nodes[0].state,
    published.snapshotBranches.branches[0].headState,
  ]) {
    assert.deepEqual(
      state.display,
      published.display,
      'History restoration must retain the saved Section/3D inspection',
    );
  }
  assert.equal(preview.display.sectionCollapse, undefined);
  assert.equal(preview.display.threeCamera, undefined);
});

test('Q2 Al3 discontinuities follow saved native oblique self-shadow geometry', async () => {
  const bytes = await readFile(
    new URL('../examples/transmon-q2-original-gds.wafercad', import.meta.url),
  );
  const { model, layout } = await readProjectFile(new Blob([bytes], { type: 'application/json' }));
  const etchedSi = unionGeometries(
    model.regions
      .filter((region) => Math.abs(region.stack[0].z1 - 337.45) < 1e-8)
      .map((region) => region.geom),
  );
  const apertureStack = directApertureStackFromGds(layout.elements, [
    {
      bottomZUm: 337.45,
      topZUm: 337.95,
      selectors: [
        { layer: 8, datatype: 0 },
        { layer: 8, datatype: 1 },
      ],
    },
    {
      bottomZUm: 337.95,
      topZUm: 338.35,
      selectors: [{ layer: 8, datatype: 1 }],
    },
  ]);
  const incidence = { tiltDeg: 45, azimuthDeg: -135, heightStepUm: 0.0375, apertureStack };
  const beforeAl3 = {
    ...model,
    regions: model.regions.map((region) => ({
      ...region,
      stack: region.stack.filter(({ layerId }) => layerId !== 'layer-4'),
    })),
  };
  const flatWithoutExistingAl = {
    ...model,
    regions: model.regions.map((region) => ({
      ...region,
      stack: region.stack.filter(({ layerId }) => layerId === 'base'),
    })),
  };
  const persistedAl3 = unionGeometries(
    model.regions
      .filter((region) => region.stack.some(({ layerId }) => layerId === 'layer-4'))
      .map((region) => region.geom),
  );
  // Full single-dose shadow projection over a flat target cannot reproduce
  // the disconnections created by sequential Al1/Al2 topography. The normal
  // Direct path explicitly excludes non-rectangular sidewall deposition.
  const staticAl3 = directIncidenceArea(flatWithoutExistingAl, etchedSi, incidence, {
    depositedThicknessUm: 0.03,
  }).area;
  const nativeAl3 = directIncidenceArea(beforeAl3, etchedSi, incidence, {
    depositedThicknessUm: 0.03,
  }).area;
  const storedArea = geometryArea(persistedAl3);
  const staticDelta = geometryArea(staticAl3) - storedArea;
  const nativeDisagreement =
    geometryArea(difference(nativeAl3, persistedAl3)) +
    geometryArea(difference(persistedAl3, nativeAl3));
  assert.ok(
    staticDelta > 0.008 && staticDelta < 0.02,
    `Flat-target shadowing unexpectedly matches the saved Al3: Δ=${staticDelta} µm²`,
  );
  assert.ok(
    nativeDisagreement / storedArea < 0.002,
    `Q2 Al3 footprint no longer follows native topographic shadowing: Δ=${nativeDisagreement} µm²`,
  );
  for (const point of [
    [-5.043, -0.1195],
    [-4.8841, 0.0394],
  ]) {
    assert.equal(
      pointInMulti(point, persistedAl3),
      false,
      'Preserve source-backed shadow gaps; do not fabricate a cosmetic Al bridge',
    );
  }
});
