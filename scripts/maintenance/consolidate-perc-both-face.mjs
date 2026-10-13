// Consolidate legacy PERC front/rear 110 nm oxide into one atomic Both step.
// Preserve its canonical geometry, distinct film IDs, GDS masks, and Variant topology.
// The historical source only records the 110 nm front/rear passivation as symmetric.
// Re-run the migration only on an unmodified legacy PERC fixture.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../process-benchmarks.mjs';

await loadGeometryKernel();
const { expandProjectStorage, prepareProjectForWorkspaceStorage, readProjectFile } =
  await import('../../site/project-io.js');
const { validateProjectFile } = await import('../../site/project-schema.js');

const target = new URL(
  '../../site/examples/perc-solar-cells-point-contacts.wafercad',
  import.meta.url,
);
const source = await readFile(target, 'utf8');
const project = expandProjectStorage(JSON.parse(source));
const graph = project.snapshotBranches;
const nodes = graph.nodes;
const pairs = [];
const isFront = (name) => /(?:Front passivating oxide|Front passivation SiO2)/i.test(name || '');
const isBack = (name) => /(?:Rear passivating oxide|Rear passivation SiO2)/i.test(name || '');
for (const front of nodes) {
  if (
    front.operation?.kind !== 'add' ||
    front.operation.face !== 'front' ||
    !isFront(front.operation.name)
  )
    continue;
  const back = nodes.find(
    (candidate) =>
      candidate.parentId === front.id &&
      candidate.operation?.kind === 'add' &&
      candidate.operation.face === 'back' &&
      isBack(candidate.operation.name),
  );
  assert.ok(back, front.id + ': missing immediately following rear oxide');
  assert.equal(front.operation.thickness, 0.11);
  assert.equal(back.operation.thickness, 0.11);
  assert.equal(front.operation.growth, 'conformal');
  assert.equal(back.operation.growth, 'conformal');
  assert.equal(front.operation.areaMode, 'full');
  assert.equal(back.operation.areaMode, 'full');
  pairs.push({ front, back, frontName: front.operation.name, backName: back.operation.name });
}
const previouslyConverted = nodes.some(
  (node) =>
    node.operation?.kind === 'add' &&
    node.operation.face === 'both' &&
    isFront(node.operation.name),
);
if (!pairs.length) {
  assert.ok(previouslyConverted, 'No eligible PERC oxide pair to consolidate');
  console.log('PERC Both migration: already converted, no further edits');
  process.exit(0);
}
assert.equal(pairs.length, 2, 'Expected one shared baseline/GDS pair and one source-order pair');

const beforeModels = new Map();
for (const branch of graph.branches) {
  const model = branch.headState.model;
  beforeModels.set(
    branch.id,
    JSON.stringify({
      regions: model.regions,
      implants: model.implants,
      electricalRegions: model.electricalRegions,
      boundary: model.boundary,
    }),
  );
}
const byRemoved = new Map(pairs.map(({ front, back }) => [back.id, front.id]));
for (const { front, back, frontName } of pairs) {
  // Front node now represents the completed atomic Front -> Back operation.
  const params = {
    type: 'add',
    name: frontName,
    thickness: 0.11,
    growth: 'conformal',
    face: 'both',
  };
  Object.assign(front.operation, {
    label: 'Deposit double-sided SiO2 passivation · Conformal · 110 nm',
    face: 'both',
    replay: { version: 1, params, areaMode: 'full' },
  });
  front.state = { ...back.state, activeFace: 'front' };
}
graph.nodes = nodes.filter((node) => !byRemoved.has(node.id));
for (const node of graph.nodes) {
  node.parentId = byRemoved.get(node.parentId) || node.parentId;
}
for (const branch of graph.branches) {
  branch.headNodeId = byRemoved.get(branch.headNodeId) || branch.headNodeId;
  branch.rootNodeId = byRemoved.get(branch.rootNodeId) || branch.rootNodeId;
}
graph.cursorNodeId = byRemoved.get(graph.cursorNodeId) || graph.cursorNodeId;
for (const snapshot of project.snapshots || []) {
  if (byRemoved.has(snapshot.historyNodeId)) {
    snapshot.historyNodeId = byRemoved.get(snapshot.historyNodeId);
    snapshot.name = 'Double-sided passivation SiO2 · 110 nm';
    snapshot.state.activeFace = 'front';
  }
  const pair = pairs.find(({ front }) => snapshot.historyNodeId === front.id);
  if (pair) snapshot.state = { ...pair.front.state, processRecipe: snapshot.state.processRecipe };
}

function collapseRecipe(recipe) {
  if (!recipe?.steps?.length) return;
  for (const { front, back, frontName, backName } of pairs) {
    const oldFrontId = 'recipe-' + front.id;
    const oldBackId = 'recipe-' + back.id;
    const first = recipe.steps.findIndex((step) => step.id === oldFrontId);
    const second = recipe.steps.findIndex((step) => step.id === oldBackId);
    if (first >= 0) {
      // A saved prefix ending on the old front node is remapped onto the
      // fully completed Both node; every other prefix contains both steps.
      assert.ok(second === -1 || second === first + 1, 'Non-adjacent PERC oxide pair');
      recipe.steps[first].params.face = 'both';
      recipe.steps[first].params.material = frontName;
      if (second >= 0) recipe.steps.splice(second, 1);
      if (recipe.activeStepId === oldBackId) recipe.activeStepId = oldFrontId;
      for (const step of recipe.steps) {
        if (
          step.command === 'etch' &&
          step.params.face === 'back' &&
          step.params.target === backName
        )
          step.params.target = frontName;
      }
    }
  }
}

const models = new Set([project.model]);
const recipes = new Set([project.processRecipe]);
for (const node of graph.nodes) {
  if (node.state?.model) models.add(node.state.model);
  if (node.state?.processRecipe) recipes.add(node.state.processRecipe);
}
for (const branch of graph.branches) {
  if (branch.headState?.model) models.add(branch.headState.model);
  if (branch.headState?.processRecipe) recipes.add(branch.headState.processRecipe);
}
for (const snap of project.snapshots || []) {
  if (snap.state?.model) models.add(snap.state.model);
  if (snap.state?.processRecipe) recipes.add(snap.state.processRecipe);
}
let pairedModels = 0;
for (const model of models) {
  for (const { frontName, backName } of pairs) {
    const front = model.layers?.find((layer) => layer.name === frontName);
    const back = model.layers?.find((layer) => layer.name === backName);
    if (!front || !back) continue;
    assert.notEqual(front.id, back.id);
    const group = 'both-' + front.id + '-' + back.id;
    front.processGroupId = back.processGroupId = group;
    front.processFace = 'front';
    back.processFace = 'back';
    front.pairedLayerId = back.id;
    back.pairedLayerId = front.id;
    // The Recipe command has one shared material, with two separate IDs.
    back.name = front.name;
    pairedModels++;
  }
}
for (const recipe of recipes) collapseRecipe(recipe);
for (const branch of graph.branches) {
  const model = branch.headState.model;
  assert.equal(
    JSON.stringify({
      regions: model.regions,
      implants: model.implants,
      electricalRegions: model.electricalRegions,
      boundary: model.boundary,
    }),
    beforeModels.get(branch.id),
    branch.id + ': physical geometry changed',
  );
  assert.ok(
    branch.headState.processRecipe.steps.some(
      (s) => s.command === 'deposit' && s.params.face === 'both',
    ),
  );
}
assert.ok(pairedModels >= 3, 'No double-sided models were found');
validateProjectFile(project);
const text = JSON.stringify(
  prepareProjectForWorkspaceStorage(project, { geometryTemplates: false }),
);
const reloaded = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
assert.equal(reloaded.snapshotBranches.nodes.length, nodes.length - pairs.length);
assert.equal(reloaded.snapshotBranches.branches.length, 3);
assert.equal(reloaded.processRecipe.steps.filter((s) => s.params?.face === 'both').length, 1);
if (process.argv.includes('--write')) await writeFile(target, text);
else assert.equal(text, source, 'PERC Both migration requires --write');
console.log(
  JSON.stringify({
    migratedPairs: pairs.length,
    modelsPaired: pairedModels,
    historyNodes: reloaded.snapshotBranches.nodes.length,
    recipeSteps: reloaded.processRecipe.steps.length,
    outputBytes: Buffer.byteLength(text),
    write: process.argv.includes('--write'),
  }),
);
