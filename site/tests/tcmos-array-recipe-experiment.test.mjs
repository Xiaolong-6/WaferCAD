import assert from 'node:assert/strict';
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
      assert.equal(step.params.mask.sourceMode, 'file');
      assert.deepEqual(step.params.mask.layerKeys, ['10|0']);
      assert.equal(step.params.mask.processGridUm, 0.0001);
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
