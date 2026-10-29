import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { geometryArea } = await import('../model.js');
const { difference, intersection, pointInMulti, unionGeometries } = await import('../vector-geometry.js');

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
  for (const project of [published, preview]) {
    assert.deepEqual(project.display.sectionCollapse, expectedCollapse);
    assert.deepEqual(project.display.threeCamera.target, [-5, 0, 1.55]);
    assert.ok(
      project.display.threeCamera.position[2] > project.display.threeCamera.target[2],
      'Inspect the junction from above, not through the bulk substrate',
    );
    for (const state of [
      project.snapshotBranches.nodes[0].state,
      project.snapshotBranches.branches[0].headState,
    ]) {
      assert.deepEqual(
        state.display,
        project.display,
        'History restoration must retain the saved physical Section/3D inspection',
      );
    }
  }
});
