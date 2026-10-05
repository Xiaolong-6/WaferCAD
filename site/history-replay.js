function remappedId(id, layerIdMap) {
  return id && layerIdMap?.has(id) ? layerIdMap.get(id) : id;
}

export function remapHistoryReplayOperation(operation, params, layerIdMap) {
  const nextOperation = operation,
    nextParams = params,
    remapLayerId = (id) => remappedId(id, layerIdMap);

  if (nextParams.targetLayerId) nextParams.targetLayerId = remapLayerId(nextParams.targetLayerId);
  if (Array.isArray(nextParams.etchTargetLayerIds)) {
    nextParams.etchTargetLayerIds = nextParams.etchTargetLayerIds.map(remapLayerId);
  }

  if (nextOperation.targetLayerId) {
    nextOperation.targetLayerId = remapLayerId(nextOperation.targetLayerId);
  }
  if (Array.isArray(nextOperation.etchTargetLayerIds)) {
    nextOperation.etchTargetLayerIds = nextOperation.etchTargetLayerIds.map(remapLayerId);
  }
  if (nextOperation.replay?.version === 1) {
    nextOperation.replay.params = structuredClone(nextParams);
  }

  return { operation: nextOperation, params: nextParams };
}

export function captureHistoryReplayResult(operation, sourceStep, result, layerIdMap) {
  const refs = sourceStep?.entityRefs || {};

  if (operation.kind === 'add' && result?.layerId) {
    const previousId = refs.resultLayerId || operation.resultLayerId || null;
    if (previousId) layerIdMap?.set(previousId, result.layerId);
    operation.resultLayerId = result.layerId;
  } else if (operation.kind === 'implant' && result?.implantId) {
    operation.resultImplantId = result.implantId;
  } else if (operation.kind === 'electrical' && result?.electricalRegionId) {
    operation.resultElectricalRegionId = result.electricalRegionId;
  }

  return operation;
}
