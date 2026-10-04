import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vendorSource = await readFile(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { createVisualizationExample, createVisualizationLayout } =
  await import('../welcome-example.js');
const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const { expandProjectStorage } = await import('../project-io.js');
const { CURRENT_PROJECT_VERSION, migrateProjectFile, validateProjectFile } =
  await import('../project-schema.js');

test('Visualization welcome example preserves the uploaded mask structure', () => {
  const layout = createVisualizationLayout();
  assert.equal(layout.root, 'Wafer');
  assert.equal(layout.elements.length, 397);
  assert.equal(layout.combos.length, 7);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Opening').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'ITO').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Metal').length, 132);
});

test('Visualization welcome example migrates into the current interactive project schema', () => {
  const project = migrateProjectFile(createVisualizationExample());
  assert.equal(project.version, CURRENT_PROJECT_VERSION);
  assert.equal(validateProjectFile(project), project);
  assert.equal(project.model.layers.length, 7);
  assert.deepEqual(project.selectedLayerKeys, ['4|0']);
  assert.equal(project.maskSourceMode, 'file');
  assert.deepEqual(project.drawMask, { nextShapeId: 1, shapes: [] });
  assert.deepEqual(
    project.model.layers.map((layer) => layer.name),
    ['Base', 'SiO2', 'Perovskite', 'ETL', 'ITO', 'Metal', 'Back metal'],
  );
});


test('welcome example catalog groups literature detectors into one branch-based project family', async () => {
  assert.deepEqual(
    BUNDLED_EXAMPLES.map((example) => example.id),
    ['photodetector-literature', 'visualization'],
  );
  const literature = BUNDLED_EXAMPLES[0];
  assert.equal(literature.kind, 'project');
  assert.match(literature.path, /photodetector-literature-examples\.wafercad$/);

  const packed = JSON.parse(
    await readFile(new URL('../examples/photodetector-literature-examples.wafercad', import.meta.url), 'utf8'),
  );
  expandProjectStorage(packed);
  assert.equal(validateProjectFile(packed), packed);

  const branches = new Map(
    packed.snapshotBranches.branches.map((branch) => [branch.id, branch]),
  );
  assert.equal(packed.snapshotBranches.activeBranchId, 'black-si-fig1a-final');
  assert.equal(branches.get('black-si-fig1a')?.parentBranchId, 'main');
  assert.equal(branches.get('black-si-fig1a-final')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('black-si-fig1a-qa')?.parentBranchId, 'black-si-fig1a');
  assert.equal(branches.get('ge-fig15-common')?.parentBranchId, 'main');
  assert.equal(branches.get('ge-fig15-a')?.parentBranchId, 'ge-fig15-common');
  assert.equal(branches.get('ge-fig15-b')?.parentBranchId, 'ge-fig15-common');

  assert.equal(packed.snapshotBranches.branches.length, 7);
  assert.equal(packed.snapshotBranches.nodes.length, 32);
  assert.equal(packed.snapshots.length, 47);
});
