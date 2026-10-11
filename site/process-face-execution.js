// Execute one logical Process operation on both exposed faces.
// The only supported order is Front then Back. The candidate is committed
// only if BOTH passes succeed; a failed second pass cannot mutate the caller.
const SUPPORTED_BOTH_TYPES = new Set(['add', 'grow', 'etch', 'implant', 'electrical']);

export function applyProcessFaces(model, params, applySingleFace) {
  if (params?.face !== 'both') {
    const candidate = structuredClone(model);
    const result = applySingleFace(candidate, params);
    return { model: result?.changed ? candidate : model, result };
  }

  if (!SUPPORTED_BOTH_TYPES.has(params.type)) {
    return {
      model,
      result: { changed: false, error: `Both faces are unsupported for ${params.type || 'this operation'}.` },
    };
  }
  // Planarize uses an absolute physical Z plane; applying the same target on
  // opposite faces can erase the entire wafer rather than symmetrically thin it.
  if (params.type === 'etch' && params.etchProfile === 'planarize') {
    return {
      model,
      result: { changed: false, error: 'Both faces are unsupported for absolute-Z Planarize.' },
    };
  }

  const candidate = structuredClone(model);
  const front = applySingleFace(candidate, { ...params, face: 'front' });
  if (!front?.changed) {
    return {
      model,
      result: { changed: false, error: `Front face: ${front?.error || 'no geometry changed.'}` },
    };
  }
  if (params.type === 'add' && !front.layerId) {
    return {
      model,
      result: { changed: false, error: 'Front face deposition returned no reusable layer ID.' },
    };
  }

  // Both-sided films are one material layer, not two same-named layers.
  const back = applySingleFace(candidate, {
    ...params,
    face: 'back',
    ...(params.type === 'add' ? { reuseLayerId: front.layerId } : {}),
  });
  if (!back?.changed) {
    return {
      model,
      result: { changed: false, error: `Back face: ${back?.error || 'no geometry changed.'}` },
    };
  }

  return {
    model: candidate,
    result: {
      ...back,
      changed: true,
      face: 'both',
      ...(params.type === 'add' ? { layerId: front.layerId } : {}),
      ...(params.type === 'implant'
        ? { implantId: front.implantId, implantIds: [front.implantId, back.implantId] }
        : {}),
      ...(params.type === 'electrical'
        ? {
            electricalRegionId: front.electricalRegionId,
            electricalRegionIds: [front.electricalRegionId, back.electricalRegionId],
          }
        : {}),
    },
  };
}
