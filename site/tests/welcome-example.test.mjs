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

const { createVisualizationExample, createVisualizationLayout } = await import(
  '../welcome-example.js'
);
const { validateProjectFile } = await import('../project-schema.js');

test('Visualization welcome example preserves the uploaded mask structure', () => {
  const layout = createVisualizationLayout();
  assert.equal(layout.root, 'Wafer');
  assert.equal(layout.elements.length, 397);
  assert.equal(layout.combos.length, 7);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Opening').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'ITO').length, 132);
  assert.equal(layout.elements.filter((element) => element.sourceCell === 'Metal').length, 132);
});

test('Visualization welcome example is a valid interactive WaferCAD project', () => {
  const project = createVisualizationExample();
  assert.equal(validateProjectFile(project), project);
  assert.equal(project.model.layers.length, 7);
  assert.deepEqual(project.selectedLayerKeys, ['4|0']);
  assert.ok(
    project.model.regions.some((region) =>
      region.stack.some((segment) => segment.role === 'conformal-sidewall'),
    ),
  );
});
