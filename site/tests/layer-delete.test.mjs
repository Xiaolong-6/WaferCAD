import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { createLayer, createModel, deleteExposedLayer, isLayerExposed } =
  await import('../model.js');

test('only layers exposed at a stack boundary can be deleted', () => {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 10 });
  const first = createLayer(model, 'First');
  model.regions[0].stack.push({ layerId: first.id, z0: 5, z1: 7 });

  assert.equal(isLayerExposed(model, first.id), true);

  const second = createLayer(model, 'Second');
  model.regions[0].stack.push({ layerId: second.id, z0: 7, z1: 9 });

  assert.equal(isLayerExposed(model, first.id), false);
  assert.equal(deleteExposedLayer(model, first.id), false);
  assert.equal(
    model.layers.some((layer) => layer.id === first.id),
    true,
  );

  assert.equal(isLayerExposed(model, second.id), true);
  assert.equal(deleteExposedLayer(model, second.id), true);
  assert.equal(
    model.layers.some((layer) => layer.id === second.id),
    false,
  );
  assert.deepEqual(
    model.regions[0].stack.map((segment) => segment.layerId),
    ['base', first.id],
  );
});

test('a layer exposed on the back face is also deletable', () => {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 10 });
  const back = createLayer(model, 'Back coating');
  model.regions[0].stack.unshift({ layerId: back.id, z0: -7, z1: -5 });

  assert.equal(isLayerExposed(model, back.id), true);
  assert.equal(deleteExposedLayer(model, back.id), true);
  assert.deepEqual(
    model.regions[0].stack.map((segment) => segment.layerId),
    ['base'],
  );
});
