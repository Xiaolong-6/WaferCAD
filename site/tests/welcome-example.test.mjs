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
