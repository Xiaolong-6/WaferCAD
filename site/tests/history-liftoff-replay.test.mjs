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
