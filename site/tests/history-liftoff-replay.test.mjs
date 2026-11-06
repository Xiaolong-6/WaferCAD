import assert from 'node:assert/strict';
import test from 'node:test';
import { remapHistoryReplayOperation } from '../history-replay.js';

test('Lift-off History replay remaps the sacrificial layer when earlier layer IDs change', () => {
  const operation = {
    kind: 'liftoff',
    sacrificialLayerId: 'layer-1',
    replay: { version: 1, params: { type: 'liftoff', sacrificialLayerId: 'layer-1' } },
  };
  const params = structuredClone(operation.replay.params);
  remapHistoryReplayOperation(operation, params, new Map([['layer-1', 'layer-42']]));
  assert.equal(params.sacrificialLayerId, 'layer-42');
  assert.equal(operation.sacrificialLayerId, 'layer-42');
  assert.equal(operation.replay.params.sacrificialLayerId, 'layer-42');
});

test('bilayer release and surface-selective oxide follow remapped material identities', () => {
  const changes = new Map([
    ['MMA-old', 'MMA-new'],
    ['PMMA-old', 'PMMA-new'],
    ['Al1-old', 'Al1-new'],
  ]);
  const operation = {
    kind: 'liftoff',
    sacrificialLayerId: 'MMA-old',
    sacrificialLayerIds: ['MMA-old', 'PMMA-old'],
    replay: { version: 1 },
  };
  const params = {
    type: 'liftoff',
    sacrificialLayerId: 'MMA-old',
    sacrificialLayerIds: ['MMA-old', 'PMMA-old'],
  };
  remapHistoryReplayOperation(operation, params, changes);
  assert.deepEqual(operation.sacrificialLayerIds, ['MMA-new', 'PMMA-new']);
  assert.deepEqual(operation.replay.params.sacrificialLayerIds, ['MMA-new', 'PMMA-new']);
  const oxide = { kind: 'add', surfaceLayerId: 'Al1-old', replay: { version: 1 } };
  remapHistoryReplayOperation(oxide, { type: 'add', surfaceLayerId: 'Al1-old' }, changes);
  assert.equal(oxide.surfaceLayerId, 'Al1-new');
  assert.equal(oxide.replay.params.surfaceLayerId, 'Al1-new');
});
