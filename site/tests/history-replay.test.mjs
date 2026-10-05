import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureHistoryReplayResult,
  remapHistoryReplayOperation,
} from '../history-replay.js';

test('History replay remaps recreated material IDs into downstream Grow and Etch targets', () => {
  const layerIdMap = new Map();

  const replayedDeposit = {
    kind: 'add',
    resultLayerId: 'layer-2',
    replay: {
      version: 1,
      params: {
        type: 'add',
        name: 'ITO',
        thickness: 0.2,
        growth: 'direct',
      },
    },
  };

  captureHistoryReplayResult(
    replayedDeposit,
    { entityRefs: { resultLayerId: 'layer-2' } },
    { layerId: 'layer-3' },
    layerIdMap,
  );

  assert.equal(layerIdMap.get('layer-2'), 'layer-3');
  assert.equal(replayedDeposit.resultLayerId, 'layer-3');

  const grow = {
      kind: 'grow',
      targetLayerId: 'layer-2',
      replay: {
        version: 1,
        params: {
          type: 'grow',
          targetLayerId: 'layer-2',
          thickness: 0.05,
          growth: 'conformal',
        },
      },
    },
    growParams = structuredClone(grow.replay.params);

  remapHistoryReplayOperation(grow, growParams, layerIdMap);
  assert.equal(grow.targetLayerId, 'layer-3');
  assert.equal(growParams.targetLayerId, 'layer-3');
  assert.equal(grow.replay.params.targetLayerId, 'layer-3');

  const etch = {
      kind: 'etch',
      etchTargetLayerIds: ['layer-2', 'base'],
      replay: {
        version: 1,
        params: {
          type: 'etch',
          etchTargetLayerIds: ['layer-2', 'base'],
          thickness: 0.1,
        },
      },
    },
    etchParams = structuredClone(etch.replay.params);

  remapHistoryReplayOperation(etch, etchParams, layerIdMap);
  assert.deepEqual(etch.etchTargetLayerIds, ['layer-3', 'base']);
  assert.deepEqual(etchParams.etchTargetLayerIds, ['layer-3', 'base']);
  assert.deepEqual(etch.replay.params.etchTargetLayerIds, ['layer-3', 'base']);
});

test('History replay leaves pre-existing material IDs unchanged when no recreated mapping exists', () => {
  const operation = {
      kind: 'grow',
      targetLayerId: 'layer-1',
      replay: {
        version: 1,
        params: {
          type: 'grow',
          targetLayerId: 'layer-1',
          thickness: 0.05,
        },
      },
    },
    params = structuredClone(operation.replay.params);

  remapHistoryReplayOperation(operation, params, new Map([['layer-2', 'layer-3']]));
  assert.equal(operation.targetLayerId, 'layer-1');
  assert.equal(params.targetLayerId, 'layer-1');
});

test('History replay refreshes annotation result IDs without treating them as material targets', () => {
  const implant = { kind: 'implant', resultImplantId: 'implant-1' },
    electrical = { kind: 'electrical', resultElectricalRegionId: 'electrical-1' },
    layerIdMap = new Map();

  captureHistoryReplayResult(
    implant,
    { entityRefs: { resultImplantId: 'implant-1' } },
    { implantId: 'implant-2' },
    layerIdMap,
  );
  captureHistoryReplayResult(
    electrical,
    { entityRefs: { resultElectricalRegionId: 'electrical-1' } },
    { electricalRegionId: 'electrical-2' },
    layerIdMap,
  );

  assert.equal(implant.resultImplantId, 'implant-2');
  assert.equal(electrical.resultElectricalRegionId, 'electrical-2');
  assert.equal(layerIdMap.size, 0);
});
