import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BUNDLED_EXAMPLES } from '../bundled-examples.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { readProjectFile } = await import('../project-io.js');
const { validateRecipeExecution } = await import('../process-recipe-preflight.js');

function historyPath(id, nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set();
  const result = [];
  while (id) {
    assert.ok(!seen.has(id), 'Process History must not cycle');
    seen.add(id);
    const node = byId.get(id);
    assert.ok(node, `missing History parent ${id}`);
    result.push(node);
    id = node.parentId;
  }
  return result.reverse();
}

for (const entry of BUNDLED_EXAMPLES) {
  test(`${entry.id} preserves complete Base, Mask and branch Recipe inputs`, async () => {
    const filename = entry.path.split('/').at(-1);
    const bytes = await readFile(new URL(`../examples/${filename}`, import.meta.url));
    const project = await readProjectFile({
      size: bytes.byteLength,
      text: async () => bytes.toString('utf8'),
    });
    const maskIsDraw = project.maskSourceMode === 'draw';
    const maskElementCount = maskIsDraw
      ? project.drawMask?.shapes?.length || 0
      : project.layout?.elements?.length || 0;
    assert.ok(maskElementCount > 0, 'the project must contain a nonempty exportable Mask');

    const nodes = project.snapshotBranches?.nodes || [];
    const branches = project.snapshotBranches?.branches || [];
    assert.ok(nodes.length > 0, 'missing Process History');
    assert.ok(branches.length > 0, 'missing restorable Main/Variants');
    assert.ok(project.processRecipe?.steps?.length > 0, 'missing active Recipe');

    for (const branch of branches) {
      const path = historyPath(branch.headNodeId, nodes);
      const expected = path.filter(
        (node) =>
          node.operation?.kind !== 'base' &&
          (node.operation?.processType !== 'example-root' || branch.id === 'main'),
      );
      const recipe = branch.headState?.processRecipe;
      assert.ok(recipe?.base, `${branch.id}: missing reproducible Base`);
      assert.equal(recipe.steps.length, expected.length, `${branch.id}: Recipe lost History steps`);
      assert.deepEqual(
        recipe.steps.map((step) => step.command),
        expected.map(
          (node) =>
            ({
              add: 'deposit',
              grow: 'extend',
              etch: 'etch',
              liftoff: 'liftoff',
              implant: 'implant',
              electrical: 'electrical',
              record: 'record',
            })[node.operation.kind],
        ),
        `${branch.id}: Recipe operations differ from actual History`,
      );
      const report = validateRecipeExecution(recipe.steps, {
        model: branch.headState.model,
        maskState: { layout: project.layout },
        base: recipe.base,
        startMode: 'new-base',
      });
      assert.deepEqual(report.errors, [], `${branch.id}: preflight errors`);
    }
  });
}

test('full-wafer Recipe retains an explicit canonical 625-site wafer Base', async () => {
  const bytes = await readFile(
    new URL('../examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
  );
  const project = await readProjectFile({
    size: bytes.byteLength,
    text: async () => bytes.toString('utf8'),
  });
  assert.equal(project.processRecipe.base.array.rows, 25);
  assert.equal(project.processRecipe.base.array.columns, 25);
  assert.equal(project.processRecipe.steps.length, 40);
});
