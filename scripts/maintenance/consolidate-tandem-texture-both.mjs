// Consolidate Tandem's adjacent double-sided 4.5 µm pyramidal texturing.
// The two deterministic appearance seeds remain separate: front 2018 / back 2019.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation } = await import('../../site/model.js');
const { expandProjectStorage, prepareProjectForWorkspaceStorage, readProjectFile } =
  await import('../../site/project-io.js');
const { validateProjectFile } = await import('../../site/project-schema.js');

const target = new URL(
  '../../site/examples/fully-textured-perovskite-silicon-tandem.wafercad',
  import.meta.url,
);
const source = await readFile(target, 'utf8');
const project = expandProjectStorage(JSON.parse(source));
const graph = project.snapshotBranches;
const nodes = graph.nodes;
const back = nodes.find(
  (node) =>
    node.operation?.kind === 'etch' &&
    node.operation.face === 'back' &&
    node.operation.thickness === 4.5,
);
if (!back) {
  assert.ok(
    nodes.some(
      (node) =>
        node.operation?.kind === 'etch' &&
        node.operation.face === 'both' &&
        node.operation.thickness === 4.5,
    ),
    'Tandem double-texture stages absent',
  );
  console.log('Tandem texture migration: already converted');
  process.exit(0);
}
const front = nodes.find((node) => node.id === back.parentId);
assert.ok(front && front.operation.kind === 'etch' && front.operation.face === 'front');
assert.equal(front.operation.thickness, 4.5);
assert.deepEqual(front.operation.etchTargetLayerIds, ['base']);
assert.deepEqual(back.operation.etchTargetLayerIds, ['base']);
const firstId = 'recipe-' + front.id;
const lastId = 'recipe-' + back.id;
const oldSteps = graph.branches[0].headState.processRecipe.steps;
const frontRecipe = oldSteps.find((step) => step.id === firstId);
const backRecipe = oldSteps.find((step) => step.id === lastId);
assert.ok(frontRecipe && backRecipe, 'Missing two saved texture Recipe steps');
const faceSurfaces = structuredClone({
  front: frontRecipe.params.surface,
  back: backRecipe.params.surface,
});
assert.equal(faceSurfaces.front.seed, 2018);
assert.equal(faceSurfaces.back.seed, 2019);
const modeledTexture = back.state.model.regions
  .flatMap((region) => region.stack)
  .find(
    (segment) =>
      segment.layerId === 'base' &&
      segment.frontSurface?.seed === 2018 &&
      segment.backSurface?.seed === 2019,
  );
assert.ok(modeledTexture, 'Expected legacy two-sided deterministic texture');
faceSurfaces.front.profileId = modeledTexture.frontSurface.profileId;
faceSurfaces.back.profileId = modeledTexture.backSurface.profileId;
for (const surface of Object.values(faceSurfaces)) {
  assert.equal(surface.morphology, 'pyramid');
  assert.equal(surface.meanHeight, 4.5);
}
const predecessor = nodes.find((node) => node.id === front.parentId);
assert.ok(predecessor?.state?.model, 'Missing untextured Base stage');
const candidate = structuredClone(predecessor.state.model);
const full = candidate.boundary;
const calculated = applyOperation(candidate, {
  type: 'etch',
  face: 'both',
  etchProfile: 'directional',
  thickness: 4.5,
  etchTargetLayerIds: ['base'],
  area: full,
  surface: faceSurfaces.front,
  faceSurfaces,
});
assert.equal(calculated.changed, true, calculated.error || 'Both texturing failed');
const expected = back.state.model;
assert.deepEqual(candidate.regions, expected.regions, 'Both texturing changed scientific geometry');
assert.deepEqual(candidate.layers, expected.layers, 'Both texturing changed substrate ownership');

const originalHeads = new Map(
  graph.branches.map((branch) => [
    branch.id,
    JSON.stringify({
      regions: branch.headState.model.regions,
      layers: branch.headState.model.layers,
    }),
  ]),
);
front.operation = {
  ...front.operation,
  face: 'both',
  label: 'Etch double-sided Si pyramids · 4.5 µm · two reproducible seeds',
  surface: structuredClone(faceSurfaces.front),
  replay: {
    version: 1,
    params: {
      type: 'etch',
      face: 'both',
      etchProfile: 'directional',
      etchTargetLayerIds: ['base'],
      thickness: 4.5,
      surface: structuredClone(faceSurfaces.front),
      faceSurfaces: structuredClone(faceSurfaces),
    },
    areaMode: 'full',
  },
};
front.state = { ...back.state, activeFace: 'front' };
graph.nodes = nodes.filter((node) => node.id !== back.id);
for (const node of graph.nodes) {
  if (node.parentId === back.id) node.parentId = front.id;
}
for (const branch of graph.branches) {
  if (branch.rootNodeId === back.id) branch.rootNodeId = front.id;
  if (branch.headNodeId === back.id) branch.headNodeId = front.id;
}
if (graph.cursorNodeId === back.id) graph.cursorNodeId = front.id;
for (const snapshot of project.snapshots || []) {
  if (snapshot.historyNodeId === back.id) snapshot.historyNodeId = front.id;
  if (snapshot.historyNodeId === front.id)
    snapshot.state = { ...front.state, processRecipe: snapshot.state.processRecipe };
}

const recipes = new Set([project.processRecipe]);
for (const node of graph.nodes)
  if (node.state?.processRecipe) recipes.add(node.state.processRecipe);
for (const branch of graph.branches)
  if (branch.headState?.processRecipe) recipes.add(branch.headState.processRecipe);
for (const snap of project.snapshots || [])
  if (snap.state?.processRecipe) recipes.add(snap.state.processRecipe);
for (const recipe of recipes) {
  const a = recipe.steps.findIndex((step) => step.id === firstId);
  const b = recipe.steps.findIndex((step) => step.id === lastId);
  if (a === -1) continue;
  assert.ok(b === -1 || b === a + 1, 'Texture stage order changed');
  recipe.steps[a].params.face = 'both';
  recipe.steps[a].params.surface = structuredClone(faceSurfaces.front);
  recipe.steps[a].params.faceSurfaces = structuredClone(faceSurfaces);
  if (b >= 0) recipe.steps.splice(b, 1);
  if (recipe.activeStepId === lastId) recipe.activeStepId = firstId;
}
for (const branch of graph.branches) {
  assert.equal(
    JSON.stringify({
      regions: branch.headState.model.regions,
      layers: branch.headState.model.layers,
    }),
    originalHeads.get(branch.id),
    'Tandem final material geometry changed',
  );
  assert.equal(
    branch.headState.processRecipe.steps.filter(
      (s) => s.command === 'etch' && s.params.face === 'both',
    ).length,
    1,
  );
}
validateProjectFile(project);
const text = JSON.stringify(
  prepareProjectForWorkspaceStorage(project, { geometryTemplates: false }),
);
const reopened = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
assert.equal(reopened.snapshotBranches.nodes.length, nodes.length - 1);
assert.equal(reopened.snapshotBranches.branches.length, 2);
if (process.argv.includes('--write')) await writeFile(target, text);
else assert.equal(text, source, 'Tandem Both migration requires --write');
console.log(
  JSON.stringify({
    historyNodes: reopened.snapshotBranches.nodes.length,
    recipeSteps: reopened.processRecipe.steps.length,
    faceSeeds: { front: 2018, back: 2019 },
    savedBytes: Buffer.byteLength(text),
    write: process.argv.includes('--write'),
  }),
);
