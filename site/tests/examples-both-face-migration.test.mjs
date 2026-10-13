import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { assertTandemTextureContract } =
  await import('../../scripts/test-helpers/example-contracts.mjs');

async function example(name) {
  const text = await readFile(
    new URL('../examples/' + name + '.wafercad', import.meta.url),
    'utf8',
  );
  return readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
}
function historyPath(project, id) {
  const nodes = new Map(project.snapshotBranches.nodes.map((node) => [node.id, node]));
  const result = [];
  const visited = new Set();
  while (id) {
    assert.ok(!visited.has(id), 'History cycle');
    visited.add(id);
    const node = nodes.get(id);
    assert.ok(node, 'Missing History node ' + id);
    result.push(node);
    id = node.parentId;
  }
  return result.reverse();
}
function verifyGraph(project) {
  const graph = project.snapshotBranches;
  const nodes = new Set(graph.nodes.map((node) => node.id));
  for (const branch of graph.branches) {
    assert.ok(nodes.has(branch.headNodeId), branch.name + ': missing head');
    historyPath(project, branch.headNodeId);
  }
  for (const snapshot of project.snapshots || []) {
    assert.ok(nodes.has(snapshot.historyNodeId), snapshot.name + ': orphaned bookmark');
  }
}

test('Black-Si thermal oxide covers two faces, then the back is exposed before P implant', async () => {
  const project = await example('photodetector-literature-examples');
  verifyGraph(project);
  for (const id of ['black-si-fig1a', 'black-si-fig1a-final', 'black-si-fig1a-qa']) {
    const branch = project.snapshotBranches.branches.find((b) => b.id === id);
    const steps = branch.headState.processRecipe.steps;
    const both = steps.findIndex(
      (step) =>
        step.command === 'deposit' &&
        step.params.material === 'Thermal SiO2 650 nm' &&
        step.params.face === 'both',
    );
    const removal = steps.findIndex(
      (step) =>
        step.command === 'etch' &&
        step.params.face === 'back' &&
        step.params.target === 'Thermal SiO2 650 nm',
    );
    const implant = steps.findIndex(
      (step) => step.command === 'implant' && step.params.face === 'back',
    );
    assert.equal(both, 0);
    assert.ok(removal > both && implant > removal, id + ': rear oxide removal order');
    assert.equal(steps[removal].params.thicknessUm, 0.65);
    const history = historyPath(project, branch.headNodeId);
    const initial = history.find((node) => node.operation?.face === 'both');
    assert.ok(initial, id + ': missing Both History');
    const films = initial.state.model.layers.filter(
      (layer) => layer.name === 'Thermal SiO2 650 nm',
    );
    assert.equal(films.length, 2);
    assert.notEqual(films[0].id, films[1].id);
    assert.equal(films[0].pairedLayerId, films[1].id);
    assert.equal(films[1].pairedLayerId, films[0].id);
  }
});

test('PERC passes front/back masks through one shared passivation step', async () => {
  const project = await example('perc-solar-cells-point-contacts');
  verifyGraph(project);
  assert.equal(project.snapshotBranches.branches.length, 3);
  const expectedCounts = [8, 14, 17];
  for (const [index, branch] of project.snapshotBranches.branches.entries()) {
    const recipe = branch.headState.processRecipe;
    assert.equal(recipe.steps.length, expectedCounts[index], branch.name);
    const both = recipe.steps.filter(
      (step) =>
        step.command === 'deposit' &&
        step.params.face === 'both' &&
        step.params.thicknessUm === 0.11,
    );
    assert.equal(both.length, 1, branch.name);
    if (branch.name.includes('GDS') || branch.name.includes('source-order')) {
      const etches = recipe.steps.filter(
        (step) =>
          step.command === 'etch' &&
          step.params.thicknessUm === 0.11 &&
          step.params.area === 'mask',
      );
      assert.ok(
        etches.some(
          (step) => step.params.face === 'back' && step.params.mask.layerKeys.includes('5|0'),
        ),
        branch.name + ': rear mask',
      );
      assert.ok(
        etches.some(
          (step) => step.params.face === 'front' && step.params.mask.layerKeys.includes('4|0'),
        ),
        branch.name + ': front mask',
      );
    }
    const front = branch.headState.model.layers.find(
      (layer) => layer.processFace === 'front' && layer.processGroupId,
    );
    const back =
      front && branch.headState.model.layers.find((layer) => layer.id === front.pairedLayerId);
    assert.ok(back && back.processFace === 'back', branch.name + ': broken material pair');
    assert.notEqual(front.id, back.id);
  }
});

test('Tandem Both pyramid Etch retains independent 2018/2019 seeds and final texture', async () => {
  const project = await example('fully-textured-perovskite-silicon-tandem');
  verifyGraph(project);
  for (const branch of project.snapshotBranches.branches) {
    const recipe = branch.headState.processRecipe;
    const texture = recipe.steps.filter(
      (step) => step.command === 'etch' && step.params.face === 'both',
    );
    assert.equal(texture.length, 1, branch.name);
    assert.equal(texture[0].params.thicknessUm, 4.5);
    assert.equal(texture[0].params.faceSurfaces.front.seed, 2018);
    assert.equal(texture[0].params.faceSurfaces.back.seed, 2019);
  }
  const finalTexture = assertTandemTextureContract(project);
  assert.equal(finalTexture.frontLayerCount, 12);
  assert.equal(finalTexture.backLayerCount, 4);
});
