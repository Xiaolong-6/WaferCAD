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
