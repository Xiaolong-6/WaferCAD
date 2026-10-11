import test from 'node:test';
import assert from 'node:assert/strict';
import { modelInventoryCount } from '../ui-v2/view-kit/model-inventory.js';

test('ordinary scientific models show canonical regions', () => {
  assert.equal(modelInventoryCount({ regions: [{}, {}, {}] }), '3 regions');
});

test('true full arrays show instance count rather than empty root regions', () => {
  assert.equal(
    modelInventoryCount({ regions: [], array: { templates: [{}], instances: Array(6400) } }),
    '6,400 instances',
  );
});
