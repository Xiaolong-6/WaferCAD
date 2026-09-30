  const out = stack.map((seg) => ({ ...seg }));
  if (face === 'front') {
    const z1 = sourceZ + amount;
    if (local >= z1 - 1e-9) return out;
    out.push({ layerId: coatingLayerId, z0: local, z1 });
  } else {
    const z0 = sourceZ - amount;
    if (local <= z0 + 1e-9) return out;
    out.unshift({ layerId: coatingLayerId, z0, z1: local });
  }
  return normalizeStack(out);
}

function applyOperationImpl(
  model,
  { type, name, targetLayerId, thickness, face = 'front', area, growth = 'direct' },
) {
  const amount = Math.max(1e-5, Number(thickness) || 0);
  let active = intersection(area, model.boundary);
  if (isEmpty(active)) return { changed: false };
  let layer = null;
  if (type === 'add') layer = createLayer(model, name);
  if (type === 'grow' && !layerById(model, targetLayerId))
    return { changed: false, error: 'Target layer is unavailable.' };

  let growSources = null;
  if (type === 'grow') {
    growSources = conformalSourcePatches(model, active, face, type, targetLayerId);
    if (!growSources.length) {
      return {
        changed: false,
        error: 'Target layer is not exposed in the selected area on the active face.',
      };
    }
  }

  if (type === 'etch') {
    splitByArea(model, active, (stack) => mutateStack(stack, { type, amount, face }));
  } else if (growth === 'conformal') {
    const sources = growSources || conformalSourcePatches(model, active, face, type, targetLayerId);

    splitByArea(model, active, (stack) =>
      mutateStack(stack, { type, layerId: layer?.id, targetLayerId, amount, face }),
    );

    const lateralAmount = amount * relativeZToXYScale(model);
    for (const source of sources) {
      const expanded = intersection(bufferMulti(source.geom, lateralAmount, 32), model.boundary);
      const sidewallBand = difference(expanded, source.geom);
      if (isEmpty(sidewallBand)) continue;

      splitByArea(model, sidewallBand, (stack) =>
        conformalSidewallStack(stack, layer?.id, targetLayerId, amount, face, source.z, type),
      );
    }
  } else {
    splitByArea(model, active, (stack) =>
      mutateStack(stack, { type, layerId: layer?.id, targetLayerId, amount, face }),
    );
  }
  model.regions = mergeRegions(model, model.regions);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return { changed: true, layerId: layer?.id || targetLayerId || null };
}

export function applyOperation(model, params) {
  const rollback = params?.growth === 'conformal' ? cloneModel(model) : null;
  try {
    return applyOperationImpl(model, params);
  } catch (error) {
    if (!rollback) throw error;
    for (const key of Object.keys(model)) delete model[key];
    Object.assign(model, rollback);
    return {
      changed: false,
      error: `Conformal geometry failed safely: ${error?.message || 'unknown geometry error'}`,
    };
  }
}

export function modelBoundsZ(model) {
  let lo = Infinity,
    hi = -Infinity;
  for (const region of model.regions)
    for (const seg of region.stack) {
      lo = Math.min(lo, seg.z0);
      hi = Math.max(hi, seg.z1);
    }
  return Number.isFinite(lo) ? [lo, hi] : [-1, 1];
}

export function surfacePatches(model, face = 'front') {
  const out = [];
  for (const region of model.regions) {
    const seg = surfaceSegment(region.stack, face);
    if (!seg) continue;
    out.push({
      geom: region.geom,
      layerId: seg.layerId,
      z: face === 'front' ? seg.z1 : seg.z0,