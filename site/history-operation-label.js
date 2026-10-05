function preciseMicron(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Number(numeric.toPrecision(8))} µm` : '';
}

function namedEntity(items, id, fallback = '') {
  if (!id) return fallback;
  return (items || []).find((item) => item?.id === id)?.name || fallback;
}

export function historyOperationLabel(node, model) {
  const operation = node?.operation || {},
    refs = node?.entityRefs || {},
    fallback = operation.label || operation.kind || 'Process step',
    thickness = preciseMicron(operation.thickness);

  if (!model || operation.kind === 'record') return fallback;

  if (operation.kind === 'add') {
    const name = namedEntity(model.layers, refs.resultLayerId, operation.name || '');
    if (!name || !thickness) return fallback;
    return `Deposit ${name} · ${operation.growth === 'conformal' ? 'Conformal' : 'Directional'} · ${thickness}`;
  }

  if (operation.kind === 'grow') {
    const name = namedEntity(model.layers, refs.targetLayerId, operation.name || '');
    if (!name || !thickness) return fallback;
    return `Extend ${name} · ${operation.growth === 'conformal' ? 'Conformal' : 'Directional'} · ${thickness}`;
  }

  if (operation.kind === 'etch') {
    if (!thickness) return fallback;
    const targetId = refs.etchTargetLayerIds?.[0] || null,
      targetName = namedEntity(model.layers, targetId, ''),
      release = operation.etchProfile === 'isotropic',
      surfaceLabel =
        !release && operation.surface
          ? operation.surface.morphology === 'pyramid'
            ? 'Pyramid'
            : 'Rough'
          : '';
    return `${release ? 'Release' : 'Etch'}${targetName ? ` ${targetName}` : ''} · ${thickness}${release ? ' · Isotropic' : surfaceLabel ? ` · ${surfaceLabel}` : ''}`;
  }

  if (operation.kind === 'implant') {
    const name = namedEntity(model.implants, refs.resultImplantId, operation.name || '');
    return name && thickness ? `Implant ${name} · ${thickness}` : fallback;
  }

  if (operation.kind === 'electrical') {
    const name = namedEntity(
      model.electricalRegions,
      refs.resultElectricalRegionId,
      operation.name || '',
    );
    return name && thickness
      ? `Electrical ${name} · ${operation.electricalRegionType || 'region'} · ${thickness}`
      : fallback;
  }

  return fallback;
}


function normalizedLayerKeyLabel(value) {
  const [layer, datatype = '0'] = String(value || '').split(/[|/]/, 2);
  return layer ? `${layer}/${datatype || '0'}` : '';
}

export function historyOperationAreaLabel(node, state = null) {
  const operation = node?.operation || {},
    areaMode = operation.areaMode || operation.replay?.areaMode || '',
    fallback =
      operation.areaLabel ||
      (areaMode === 'full'
        ? 'Whole face'
        : areaMode === 'invert'
          ? 'Invert mask'
          : areaMode === 'mask'
            ? 'Selected mask'
            : ''),
    context = operation.maskContext || operation.replay?.maskContext || null;

  if (!areaMode || areaMode === 'full') return fallback;
  if (!context) {
    const stateLayers = Array.isArray(state?.selectedLayerKeys) ? state.selectedLayerKeys : [],
      stateCell = state?.activeCell || state?.layout?.root || '';
    if (!stateCell && !stateLayers.length) return fallback;
    const layerLabels = stateLayers.map(normalizedLayerKeyLabel).filter(Boolean);
    return [
      fallback,
      stateCell ? `Cell ${stateCell}` : '',
      layerLabels.length
        ? `${layerLabels.length === 1 ? 'Layer' : 'Layers'} ${layerLabels.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const sourceMode = context.sourceMode === 'draw' ? 'draw' : 'file';
  if (sourceMode === 'draw') {
    const shapeCount = Number(context.shapeCount);
    return [
      fallback,
      Number.isInteger(shapeCount) && shapeCount >= 0
        ? `Draw · ${shapeCount} shape${shapeCount === 1 ? '' : 's'}`
        : 'Draw',
    ].join(' · ');
  }

  const cell = context.cell || state?.activeCell || state?.layout?.root || '',
    layerKeys = Array.isArray(context.layerKeys)
      ? context.layerKeys
      : Array.isArray(state?.selectedLayerKeys)
        ? state.selectedLayerKeys
        : [],
    layerLabels = layerKeys.map(normalizedLayerKeyLabel).filter(Boolean);

  return [
    fallback,
    cell ? `Cell ${cell}` : '',
    layerLabels.length
      ? `${layerLabels.length === 1 ? 'Layer' : 'Layers'} ${layerLabels.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
