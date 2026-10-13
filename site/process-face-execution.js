// One logical Process operation, evaluated Front then Back on a private candidate.
// A failure on either face never partially commits material or History.
const SUPPORTED_BOTH_TYPES = new Set(['add', 'grow', 'etch', 'implant', 'electrical']);

function pairedTarget(model, id, face) {
  if (!id) return id;
  const layer = model.layers.find((candidate) => candidate.id === id);
  if (!layer) return id;
  if (layer.processFace === 'front' && face === 'back' && layer.pairedLayerId) {
    const pair = model.layers.find((candidate) => candidate.id === layer.pairedLayerId);
    if (!pair || pair.pairedLayerId !== id || pair.processFace !== 'back') {
      throw new Error('Both-face material pair is incomplete.');
    }
    return pair.id;
  }
  return id;
}

export function applyProcessFaces(model, params, applySingleFace) {
  if (params?.face !== 'both') {
    const candidate = structuredClone(model);
    const result = applySingleFace(candidate, params);
    return { model: result?.changed ? candidate : model, result };
  }

  if (!SUPPORTED_BOTH_TYPES.has(params.type)) {
    return {
      model,
      result: {
        changed: false,
        error: `Both faces are unsupported for ${params.type || 'this operation'}.`,
      },
    };
  }
  // Absolute Z Planarize on both faces would have an ambiguous physical meaning.
  if (params.type === 'etch' && params.etchProfile === 'planarize') {
    return {
      model,
      result: { changed: false, error: 'Both faces are unsupported for absolute-Z Planarize.' },
    };
  }

  const candidate = structuredClone(model);
  let front;
  try {
    front = applySingleFace(candidate, {
      ...params,
      face: 'front',
      ...(params.faceSurfaces ? { surface: params.faceSurfaces.front } : {}),
    });
  } catch (error) {
    return {
      model,
      result: { changed: false, error: `Front face: ${error.message}` },
    };
  }
  if (!front?.changed) {
    return {
      model,
      result: { changed: false, error: `Front face: ${front?.error || 'no geometry changed.'}` },
    };
  }
  if (params.type === 'add' && !front.layerId) {
    return {
      model,
      result: { changed: false, error: 'Front face deposition returned no layer ID.' },
    };
  }

  // A later Extend / selective Etch addresses the matching Back film when
  // its selected Front film came from one earlier Both deposition.
  let back;
  try {
    const backParams = {
      ...params,
      face: 'back',
      ...(params.faceSurfaces ? { surface: params.faceSurfaces.back } : {}),
    };
    if (params.type === 'grow') {
      backParams.targetLayerId = pairedTarget(candidate, params.targetLayerId, 'back');
    }
    if (params.type === 'etch' && Array.isArray(params.etchTargetLayerIds)) {
      backParams.etchTargetLayerIds = params.etchTargetLayerIds.map((id) =>
        pairedTarget(candidate, id, 'back'),
      );
    }
    back = applySingleFace(candidate, backParams);
  } catch (error) {
    return {
      model,
      result: { changed: false, error: `Back face: ${error.message}` },
    };
  }
  if (!back?.changed) {
    return {
      model,
      result: { changed: false, error: `Back face: ${back?.error || 'no geometry changed.'}` },
    };
  }

  let layerIds = null;
  let layerGroupId = null;
  if (params.type === 'add') {
    if (!back.layerId || front.layerId === back.layerId) {
      return {
        model,
        result: { changed: false, error: 'Both deposition must create two distinct layer IDs.' },
      };
    }
    layerIds = { front: front.layerId, back: back.layerId };
    layerGroupId = `both-${front.layerId}-${back.layerId}`;
    for (const face of ['front', 'back']) {
      const layer = candidate.layers.find((item) => item.id === layerIds[face]);
      if (!layer) {
        return {
          model,
          result: { changed: false, error: 'Both deposition lost one material layer.' },
        };
      }
      layer.processGroupId = layerGroupId;
      layer.processFace = face;
      layer.pairedLayerId = layerIds[face === 'front' ? 'back' : 'front'];
    }
  }

  return {
    model: candidate,
    result: {
      ...back,
      changed: true,
      face: 'both',
      ...(layerIds ? { layerId: layerIds.front, layerIds, layerGroupId } : {}),
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
