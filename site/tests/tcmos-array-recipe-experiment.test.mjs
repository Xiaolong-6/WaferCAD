import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { buildTcmosInverter } from '../../scripts/build-tcmos-inverter-example.mjs';
import { createTcmosArrayRecipeExperiment } from '../../scripts/build-tcmos-array-recipe-experiment.mjs';

await loadGeometryKernel();

test('native 4×4 23-step Recipe has reconstructible Base and original CNT Mask', async () => {
  const { project: source } = await buildTcmosInverter({ includeComparison: false });
  const { project, cells, report } = await createTcmosArrayRecipeExperiment(source);
  assert.deepEqual(report.errors, []);
  assert.equal(project.processRecipe.steps.length, 23);
  assert.deepEqual(project.processRecipe.base.array, {
    kind: 'rect-grid',
    rows: 4,
    columns: 4,
    pitchX: 14,
    pitchY: 8,
    activeSites: 16,
  });
  assert.equal(project.processRecipe.base.width, 56);
  assert.equal(project.processRecipe.base.height, 32);
  const original = source.processRecipe.steps;
  const experiment = project.processRecipe.steps;
  for (const [index, step] of experiment.entries()) {
    if (!original[index].params.mask) continue;
    if (index === 20 || index === 21) {
      assert.equal(step.params.mask.sourceMode, 'draw');
      assert.equal(step.params.mask.arrayRepeat, true);
      assert.equal(step.params.mask.drawMask.shapes.length, 218);
      assert.deepEqual(
        step.params.mask.drawMask,
        original[index].params.mask.drawMask,
        'CNT shape template must match the accepted 1×1 geometry exactly',
      );
    } else {
      const count = original[index].params.mask.drawMask.shapes.length;
      const shapes = step.params.mask.drawMask.shapes;
      assert.equal(shapes.length, count * 16);
      for (const [cellIndex, cell] of cells.entries()) {
        const shape = original[index].params.mask.drawMask.shapes[0];
        const tiled = shapes[cellIndex * count];
        if (shape.type === 'polygon') {
          assert.deepEqual(
            tiled.points,
            shape.points.map(([x, y]) => [
              Number((x + cell.x).toFixed(4)),
              Number((y + cell.y).toFixed(4)),
            ]),
          );
        } else {
          assert.deepEqual(tiled.a, [
            Number((shape.a[0] + cell.x).toFixed(4)),
            Number((shape.a[1] + cell.y).toFixed(4)),
          ]);
          assert.deepEqual(tiled.b, [
            Number((shape.b[0] + cell.x).toFixed(4)),
            Number((shape.b[1] + cell.y).toFixed(4)),
          ]);
        }
      }
    }
  }
  const ldd = experiment[12].params.mask.drawMask.shapes;
  for (const shape of ldd) {
    for (const coordinate of [...shape.a, ...shape.b]) {
      assert.ok(
        Math.abs(coordinate * 10000 - Math.round(coordinate * 10000)) < 1e-9,
        'LDD rectangle mask must remain on existing CAD storage grid',
      );
    }
  }
  assert.equal(project.layout.elements.length, 3712);
  assert.equal(project.model.array.templates.length, 1);
  assert.ok(!project.snapshotBranches, 'No fake 4×4 process History');
});

test('committed native 4×4 History restores a transistor-row Section, not a gap', async () => {
  const filePath = new URL(
    '../../examples/projects/tcmos-ternary-inverter-2019-candidate/tcmos-inverter-4x4-replayed.wafercad',
    import.meta.url,
  );
  const project = JSON.parse(await readFile(filePath, 'utf8'));
  const section = { a: [-28, -5.2], b: [28, -5.2] };
  assert.equal(project.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(project.layout.elements.length, 3712);
  assert.equal(project.snapshotBranches.nodes.length, 23);
  assert.deepEqual(project.section, section);
  const active = project.snapshotBranches.branches.find(
    (branch) => branch.id === project.snapshotBranches.activeBranchId,
  );
  assert.deepEqual(active?.headState?.section, section);
  assert.equal(
    project.model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible,
    true,
  );
});
