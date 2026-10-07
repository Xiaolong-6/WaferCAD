function isEmpty(vectorApi, geom) {
  return vectorApi.isEmpty(geom);
}

function stackKey(stack) {
  return (stack || [])
    .map((segment) =>
      [
        segment.layerId,
        Number(segment.z0).toPrecision(15),
        Number(segment.z1).toPrecision(15),
        segment.role || '',
        segment.backSurface ? JSON.stringify(segment.backSurface) : '',
        segment.frontSurface ? JSON.stringify(segment.frontSurface) : '',
      ].join(':'),
    )
    .join('|');
}

function mergeRegions(model, vectorApi, regions) {
  const groups = new Map();
  for (const region of regions || []) {
    if (isEmpty(vectorApi, region.geom) || !(region.stack || []).length) continue;
    const key = stackKey(region.stack);
    if (!groups.has(key)) groups.set(key, { stack: region.stack, geoms: [] });
    groups.get(key).geoms.push(region.geom);
  }

  const out = [];
  for (const group of groups.values()) {
    const geom = vectorApi.unionGeometries(group.geoms);
    if (isEmpty(vectorApi, geom)) continue;
    out.push({
      id: `region-${model.nextRegionId++}`,
      geom,
      stack: group.stack.map((segment) => ({ ...segment })),
    });
  }
  return out;
}

function splitRegions(model, vectorApi, area, mutateStack) {
  const next = [];
  let changed = false;
  for (const region of model.regions || []) {
    const hit = vectorApi.intersection(region.geom, area),
      rest = vectorApi.difference(region.geom, area);
    if (!isEmpty(vectorApi, rest)) {
      next.push({
        id: region.id,
        geom: rest,
        stack: region.stack.map((segment) => ({ ...segment })),
      });
    }
    if (isEmpty(vectorApi, hit)) continue;
    const before = stackKey(region.stack),
      stack = mutateStack(
        region.stack.map((segment) => ({ ...segment })),
        region,
      );
    if (stackKey(stack) !== before) changed = true;
    if (stack.length) {
      next.push({ id: `region-${model.nextRegionId++}`, geom: hit, stack });
    }
  }
  return { changed, regions: next };
}

function planarizeStack(modelApi, stack, targetZ, face) {
  const out = [];
  let cut = false;

  for (const source of stack || []) {
    const segment = { ...source };
    if (face === 'front') {
      if (segment.z0 >= targetZ - 1e-9) {
        cut = true;
        continue;
      }
      if (segment.z1 > targetZ + 1e-9) {
        segment.z1 = targetZ;
        delete segment.frontSurface;
        cut = true;
      }
    } else {
      if (segment.z1 <= targetZ + 1e-9) {
        cut = true;
        continue;
      }
      if (segment.z0 < targetZ - 1e-9) {
        segment.z0 = targetZ;
        delete segment.backSurface;
        cut = true;
      }
    }
    if (segment.z1 > segment.z0 + 1e-9) out.push(segment);
  }

  return { changed: cut, stack: modelApi.normalizeStack(out) };
}

function applyPlanarize(model, params, area, modelApi, vectorApi) {
  const targetZ = Number(params.targetZ ?? params.thickness);
  if (!Number.isFinite(targetZ)) {
    return { changed: false, error: 'Planarize target Z must be a finite physical coordinate.' };
  }
  const face = params.face === 'back' ? 'back' : 'front';
  let stackChanged = false;
  const split = splitRegions(model, vectorApi, area, (stack) => {
    const result = planarizeStack(modelApi, stack, targetZ, face);
    stackChanged ||= result.changed;
    return result.stack;
  });
  if (!split.changed || !stackChanged) {
    return {
      changed: false,
      error: 'The target plane does not remove material in the selected area.',
    };
  }
  model.regions = mergeRegions(model, vectorApi, split.regions);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return { changed: true, targetZ };
}

function exposedTransferPlane(model, area, face, modelApi, vectorApi) {
  let plane = face === 'front' ? -Infinity : Infinity;
  let found = false;
  for (const region of model.regions || []) {
    if (isEmpty(vectorApi, vectorApi.intersection(region.geom, area))) continue;
    const z = modelApi.surfaceZ(region.stack, face);
    if (!Number.isFinite(z)) continue;
    plane = face === 'front' ? Math.max(plane, z) : Math.min(plane, z);
    found = true;
  }
  return found ? plane : null;
}

function transferredSegment(layerId, surfaceZ, amount, gap, face) {
  return face === 'front'
    ? { layerId, z0: surfaceZ + gap, z1: surfaceZ + gap + amount }
    : { layerId, z0: surfaceZ - gap - amount, z1: surfaceZ - gap };
}

function applyFollowSurfaceTransfer(model, params, area, modelApi, vectorApi) {
  const amount = Number(params.thickness),
    gap = Math.max(0, Number(params.transferGap) || 0),
    face = params.face === 'back' ? 'back' : 'front';
  if (!(amount > 1e-9))
    return { changed: false, error: 'Transfer thickness must be greater than zero.' };

  const layer = modelApi.createLayer(model, params.name || 'Transferred layer'),
    next = [];
  let touched = false;

  for (const region of model.regions || []) {
    const hit = vectorApi.intersection(region.geom, area),
      rest = vectorApi.difference(region.geom, area);
    if (!isEmpty(vectorApi, rest)) {
      next.push({
        id: region.id,
        geom: rest,
        stack: region.stack.map((segment) => ({ ...segment })),
      });
    }
    if (isEmpty(vectorApi, hit)) continue;

    const surfaceZ = modelApi.surfaceZ(region.stack, face);
    if (!Number.isFinite(surfaceZ)) {
      next.push({
        id: `region-${model.nextRegionId++}`,
        geom: hit,
        stack: region.stack.map((segment) => ({ ...segment })),
      });
      continue;
    }

    touched = true;
    const transferred = transferredSegment(layer.id, surfaceZ, amount, gap, face);
    next.push({
      id: `region-${model.nextRegionId++}`,
      geom: hit,
      stack: modelApi.normalizeStack([
        ...region.stack.map((segment) => ({ ...segment })),
        transferred,
      ]),
    });
  }

  if (!touched) {
    model.layers = model.layers.filter((candidate) => candidate.id !== layer.id);
    return { changed: false, error: 'Transfer/Laminate does not overlap the selected target.' };
  }

  model.regions = mergeRegions(model, vectorApi, next);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return {
    changed: true,
    layerId: layer.id,
    transferMode: 'follow',
    transferGap: gap,
    transferSource: String(params.transferSource || '').trim() || null,
  };
}

function applyFlatTransfer(model, params, area, modelApi, vectorApi) {
  const amount = Number(params.thickness),
    gap = Math.max(0, Number(params.transferGap) || 0),
    face = params.face === 'back' ? 'back' : 'front';
  if (!(amount > 1e-9))
    return { changed: false, error: 'Transfer thickness must be greater than zero.' };

  const plane = exposedTransferPlane(model, area, face, modelApi, vectorApi);
  if (!Number.isFinite(plane)) {
    return {
      changed: false,
      error: 'No exposed target surface is available for Transfer/Laminate.',
    };
  }

  const layer = modelApi.createLayer(model, params.name || 'Transferred layer'),
    transferred = transferredSegment(layer.id, plane, amount, gap, face),
    next = [],
    coveredParts = [];

  for (const region of model.regions || []) {
    const hit = vectorApi.intersection(region.geom, area),
      rest = vectorApi.difference(region.geom, area);
    if (!isEmpty(vectorApi, rest)) {
      next.push({
        id: region.id,
        geom: rest,
        stack: region.stack.map((segment) => ({ ...segment })),
      });
    }
    if (isEmpty(vectorApi, hit)) continue;
    coveredParts.push(hit);
    next.push({
      id: `region-${model.nextRegionId++}`,
      geom: hit,
      stack: modelApi.normalizeStack([
        ...region.stack.map((segment) => ({ ...segment })),
        transferred,
      ]),
    });
  }

  const covered = coveredParts.length ? vectorApi.unionGeometries(coveredParts) : [],
    bridge = vectorApi.difference(area, covered);
  if (!isEmpty(vectorApi, bridge)) {
    next.push({
      id: `region-${model.nextRegionId++}`,
      geom: bridge,
      stack: [{ ...transferred }],
    });
  }

  if (!next.length) {
    model.layers = model.layers.filter((candidate) => candidate.id !== layer.id);
    return { changed: false, error: 'Transfer/Laminate does not overlap the selected target.' };
  }

  model.regions = mergeRegions(model, vectorApi, next);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return {
    changed: true,
    layerId: layer.id,
    transferMode: 'flat',
    transferPlaneZ: plane,
    transferGap: gap,
    transferSource: String(params.transferSource || '').trim() || null,
  };
}

function applyUndercut(model, params, area, modelApi, vectorApi) {
  const targetLayerId = (params.etchTargetLayerIds || []).find(Boolean),
    radius = Number(params.thickness),
    face = params.face === 'back' ? 'back' : 'front';
  if (!targetLayerId) {
    return {
      changed: false,
      error: 'Undercut release requires one selected sacrificial material.',
    };
  }
  if (!(radius > 1e-9)) {
    return { changed: false, error: 'Undercut distance must be greater than zero.' };
  }

  const seeds = [];
  for (const region of model.regions || []) {
    const surface = modelApi.surfaceSegment(region.stack, face);
    if (surface?.layerId !== targetLayerId) continue;
    const hit = vectorApi.intersection(region.geom, area);
    if (!isEmpty(vectorApi, hit)) seeds.push(hit);
  }
  if (!seeds.length) {
    return {
      changed: false,
      error: 'The selected sacrificial material is not exposed through the selected access area.',
    };
  }

  const seed = vectorApi.unionGeometries(seeds),
    reached = vectorApi.intersection(vectorApi.bufferMulti(seed, radius, 20), model.boundary),
    split = splitRegions(model, vectorApi, reached, (stack) =>
      modelApi.normalizeStack(stack.filter((segment) => segment.layerId !== targetLayerId)),
    );
  if (!split.changed) {
    return { changed: false, error: 'The undercut front did not remove the selected material.' };
  }

  model.regions = mergeRegions(model, vectorApi, split.regions);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return { changed: true, undercutDistance: radius, targetLayerId };
}

// Returns null when the regular Process Geometry Kernel should handle params.
// Advanced operations live beside the existing kernel so old project/replay
// semantics stay untouched while these newer manufacturing primitives mature.
export function applyAdvancedProcessOperation(model, params, area, modelApi, vectorApi) {
  if (params?.type === 'etch' && params?.etchProfile === 'planarize') {
    return applyPlanarize(model, params, area, modelApi, vectorApi);
  }
  if (params?.type === 'etch' && params?.etchProfile === 'undercut') {
    return applyUndercut(model, params, area, modelApi, vectorApi);
  }
  if (params?.type === 'add' && params?.growth === 'transfer') {
    // Old saved/replayed transfer steps did not carry transferMode and keep
    // their historical flat-bridge semantics. New UI operations explicitly
    // store transferMode='follow'.
    return params.transferMode === 'follow'
      ? applyFollowSurfaceTransfer(model, params, area, modelApi, vectorApi)
      : applyFlatTransfer(model, params, area, modelApi, vectorApi);
  }
  return null;
}
