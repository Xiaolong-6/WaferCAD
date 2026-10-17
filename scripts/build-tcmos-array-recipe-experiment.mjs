// Experimental 4×4 true Recipe: separate from the approved inspection-only
// array. No 16-cell Run All / History acceptance is implied by this file.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTcmosInverter } from './build-tcmos-inverter-example.mjs';
import { createTcmosArrayPatch, TCMOS_ARRAY_SPEC } from './build-tcmos-array-patch.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';

export async function createTcmosArrayRecipeExperiment(source, spec = TCMOS_ARRAY_SPEC) {
  await loadGeometryKernel();
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const { project, cells } = await createTcmosArrayPatch(source, spec);
  const recipe = structuredClone(source.processRecipe);
  assert.equal(recipe.steps.length, 23, 'Source 23-step T-CMOS process changed');
  recipe.name = 'Experimental native 4×4 Recipe, geometry replay unverified';
  recipe.base = {
    ...recipe.base,
    shape: 'rect',
    width: spec.columns * spec.pitchX,
    height: spec.rows * spec.pitchY,
    array: { ...spec },
  };
  // Translate process windows on the existing 0.0001 µm project grid.
  // Raw IEEE-754 sums can create zero-area slivers at coincident Si/Mask
  // edges (which the strict project Schema must continue to reject).
  // This is canonical coordinate arithmetic, not a relaxed area tolerance.
  const shift = (coordinate, offset) => Number((coordinate + offset).toFixed(4));
  const move = (shape, cell, id) => {
    const copy = structuredClone(shape);
    copy.id = 'shape-' + id;
    if (copy.type === 'polygon') {
      copy.points = copy.points.map(([x, y]) => [shift(x, cell.x), shift(y, cell.y)]);
    } else if (copy.type === 'rect') {
      copy.a = [shift(copy.a[0], cell.x), shift(copy.a[1], cell.y)];
      copy.b = [shift(copy.b[0], cell.x), shift(copy.b[1], cell.y)];
    } else {
      throw new Error('Unexpected process-mask geometry type ' + copy.type);
    }
    return copy;
  };
  for (const [index, step] of recipe.steps.entries()) {
    const mask = step.params?.mask;
    if (!mask) continue;
    assert.equal(mask.sourceMode, 'draw', 'Unexpected source mask mode at step ' + (index + 1));
    if (index === 20 || index === 21) {
      assert.equal(mask.drawMask.shapes.length, 218, 'Original CNT source geometry changed');
      // This uses the 3488 CNT polygons already repeated in the *File Mask*.
      // Re-copying them into 2 Draw Masks would exceed the existing 100k
      // Recipe-node safety budget; do not increase that budget.
      step.params.mask = {
        sourceMode: 'file',
        cell: source.activeCell,
        layerKeys: ['10|0'],
        // Only the Recipe contact geometry is snapped to the previously
        // validated 0.1 nm process grid. Approved SVG remains unchanged.
        processGridUm: 0.0001,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        roi: null,
      };
    } else {
      const single = mask.drawMask.shapes;
      const shapes = cells.flatMap((cell, c) =>
        single.map((shape, i) => move(shape, cell, c * single.length + i + 1)),
      );
      mask.drawMask = { nextShapeId: shapes.length + 1, shapes };
    }
  }
  project.processRecipe = recipe;
  validateProjectFile(project);
  const report = validateRecipeExecution(recipe.steps, {
    model: project.model,
    maskState: {
      layout: project.layout,
      sourceMode: project.maskSourceMode,
      activeCell: project.activeCell,
      selectedLayerKeys: project.selectedLayerKeys,
    },
    limit: recipe.steps.length,
    startMode: 'new-base',
    base: recipe.base,
  });
  assert.deepEqual(report.errors, [], 'Array Recipe must pass full new-Base preflight');
  const json = JSON.stringify(prepareProjectForWorkspaceStorage(project));
  const restored = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(restored);
  assert.equal(restored.model.array.instances.length, 16);
  assert.equal(restored.processRecipe.steps.length, 23);
  return { project, json, cells, report };
}

async function main() {
  const { project: source } = await buildTcmosInverter({ includeComparison: false });
  const { project, json, report } = await createTcmosArrayRecipeExperiment(source);
  const directory = resolve('test-results/tcmos');
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, 'tcmos-inverter-4x4-RECIPE-EXPERIMENT.wafercad');
  await writeFile(file, json);
  console.log(JSON.stringify({
    experimental: true,
    fullRecipeValidated: false,
    instanceCount: project.model.array.instances.length,
    maskElements: project.layout.elements.length,
    recipeSteps: project.processRecipe.steps.length,
    preflightErrors: report.errors,
    bytes: Buffer.byteLength(json),
    file,
  }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
