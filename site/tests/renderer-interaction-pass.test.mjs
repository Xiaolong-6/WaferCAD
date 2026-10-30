import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseDenseInteractionSinglePass } from '../renderer-interaction-pass.js';

const denseModel = {
  regions: [
    { geom: Array.from({ length: 1500 }) },
    { geom: Array.from({ length: 2000 }) },
  ],
};

test('large imported geometry drops extra WebGL outline passes only while moving', () => {
  assert.equal(
    shouldUseDenseInteractionSinglePass({ model: denseModel, interacting: true }),
    true,
  );
  assert.equal(
    shouldUseDenseInteractionSinglePass({ model: denseModel, interacting: false }),
    false,
    'The settled frame retains exact structural depth',
  );
  assert.equal(
    shouldUseDenseInteractionSinglePass({
      model: denseModel,
      interacting: true,
      primaryRenderer: false,
    }),
    false,
    'Offscreen export/capture never inherits an interactive approximation',
  );
});

test('small scenes always retain existing multi-pass Border rendering', () => {
  assert.equal(
    shouldUseDenseInteractionSinglePass({
      model: { regions: [{ geom: Array.from({ length: 100 }) }] },
      interacting: true,
    }),
    false,
  );
  assert.equal(shouldUseDenseInteractionSinglePass({ interacting: true }), false);
});
