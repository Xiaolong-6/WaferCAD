import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BUNDLED_EXAMPLES } from '../bundled-examples.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { validateRecipeExecution } = await import('../process-recipe-preflight.js');
const id = 'suspended-tfln-microrings-10x8';
const candidate = BUNDLED_EXAMPLES.find((item) => item.id === id);
async function readAsset(path) {
  const buf = await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url));
  return readProjectFile({ size: buf.length, text: async () => buf.toString('utf8') });
}
test('TFLN Welcome opens the full native 80-ring editable, restorable model', async () => {
  assert.ok(candidate);
  assert.equal(candidate.sources[0].doi, '10.1038/s41377-026-02506-z');
  const project = await readAsset(candidate.path);
  assert.equal(project.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(project.model.array.instances.length, 10);
  assert.equal(project.model.array.templates.length, 1);
  assert.equal(project.layout.elements.length, 1120);
  assert.deepEqual(
    [...new Set(project.layout.elements.map((el) => `${el.layer}|${el.datatype}`))].sort(),
    ['11|0', '12|0'],
  );
  const nodes = project.snapshotBranches.nodes;
  assert.equal(nodes.length, 5, 'Step 0 is synthetic, not persisted');
  assert.ok(nodes.every((node) => node.operation.kind === 'record'));
  assert.ok(nodes.every((node) => node.operation.geometryCheckpoint === true));
  assert.ok(nodes.every((node) => node.operation.replay == null));
  // These are restorable engineering checkpoints, not fabricated Add/Etch replay steps.
  const { upgradeBundledExampleHistory } = await import('../bundled-example-history.js');
  assert.deepEqual(upgradeBundledExampleHistory(project), { upgraded: 0, unsupported: [] });
  assert.equal(nodes[0].parentId, null);
  assert.equal(project.snapshotBranches.branches[0].rootNodeId, nodes[0].id);
  assert.equal(nodes[0].state.model.array.templates[0].model.layers.length, 2);
  assert.equal(nodes[4].operation.kind, 'record');
  assert.deepEqual(nodes[4].state.model, project.model);
  assert.equal(project.processRecipe.steps.length, 5);
  assert.deepEqual(
    validateRecipeExecution(project.processRecipe.steps, {
      model: project.model,
      maskState: { layout: project.layout },
      base: project.processRecipe.base,
      startMode: 'new-base',
    }).errors,
    [],
  );
});
test('Welcome preview is physical two-disk ROI and cannot replace full 80-ring model', async () => {
  const preview = await readAsset(candidate.previewProject.path);
  assert.equal(preview.model.kernel, 'vector-2.5d-v1');
  assert.ok(preview.model.width >= 200 && preview.model.width <= 300);
  assert.ok(preview.model.height >= 100 && preview.model.height <= 160);
  assert.ok(preview.layout.elements.length > 0 && preview.layout.elements.length < 1120);
  assert.equal(preview.snapshotBranches.nodes.length, 1);
  assert.ok(preview.model.regions.length > 0);
  assert.ok(Math.abs(preview.model.boundary[0][0][0][0]) < 200);
  const image = await readFile(
    new URL('../' + candidate.preview.path.replace(/^\.\//, ''), import.meta.url),
  );
  assert.ok(image.length > 10000 && image.length < 200000);
});
