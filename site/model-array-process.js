import {
  arrayParts,
  translateGeometry,
  geometryBounds,
  boundsOverlap,
  rectangleGeometry,
} from './model-array.js';
import {
  neighborhood,
  neighborhoodKey,
  arrayContext,
  cropContext,
  localGeometry,
} from './model-array-context.js';
import { bufferMulti, intersection } from './vector-geometry.js';

const COUNTERS = ['nextLayerId', 'nextRegionId', 'nextImplantId', 'nextElectricalRegionId'];
const NO_CHANGE =
  /not exposed|None of the selected|no eligible|contains no material|No material remains|does not remove material|No exposed|not remove the selected|did not remove|does not overlap/i;
export function applyArrayOperation(model, params, apply) {
  const area = params.area,
    maskBoundsCache = new WeakMap();
  const lateral =
    params.growth === 'conformal' || ['isotropic', 'undercut'].includes(params.etchProfile);
  const radius = lateral ? Math.max(0, Number(params.thickness) || 0) : 0;
  const reach = ['isotropic', 'undercut'].includes(params.etchProfile) ? radius : 0;
  const areaBounds = geometryBounds(area);
  const bounds = {
      minX: areaBounds.minX - reach,
      minY: areaBounds.minY - reach,
      maxX: areaBounds.maxX + reach,
      maxY: areaBounds.maxY + reach,
    },
    contexts = new Map(),
    results = new Map(),
    replacements = new Map();
  let changed = false,
    last = null,
    metadata = null;
  const counters = Object.fromEntries(COUNTERS.map((k) => [k, model[k]]));
  const parts = arrayParts(model),
    physicalKeys = new WeakMap();
  const physical = (m) => {
    if (!physicalKeys.has(m))
      physicalKeys.set(
        m,
        JSON.stringify([
          m.regions.map(({ id, ...r }) => r),
          ...['implants', 'electricalRegions'].map((key) =>
            (m[key] || []).filter((a) => a.patches.length),
          ),
        ]),
      );
    return physicalKeys.get(m);
  };
  let transferPlane;
  if (params.growth === 'transfer') {
    for (const part of parts) {
      if (!boundsOverlap(part.bounds, bounds)) continue;
      const active = localGeometry(
        area,
        part,
        translateGeometry(part.model.boundary, part.x, part.y),
        maskBoundsCache,
      );
      for (const r of part.model.regions)
        if (intersection(r.geom, active).length && r.stack.length) {
          const z = params.face === 'back' ? r.stack[0].z0 : r.stack.at(-1).z1;
          transferPlane =
            transferPlane === undefined
              ? z
              : params.face === 'back'
                ? Math.min(transferPlane, z)
                : Math.max(transferPlane, z);
        }
    }
  }
  for (const part of parts) {
    if (!boundsOverlap(part.bounds, bounds)) continue;
    const worldDomain = translateGeometry(part.model.boundary, part.x, part.y);
    if (!reach && !intersection(area, worldDomain).length) continue;
    if (reach) {
      const b = part.bounds,
        query = rectangleGeometry({
          minX: b.minX - reach,
          minY: b.minY - reach,
          maxX: b.maxX + reach,
          maxY: b.maxY + reach,
        });
      const seeds = localGeometry(area, part, query, maskBoundsCache);
      if (!intersection(bufferMulti(seeds, reach, 20), part.model.boundary).length) continue;
    }
    const neighbors = lateral ? neighborhood(model, part, radius) : [part];
    const margin = radius * 2 + 0.001,
      b = geometryBounds(part.model.boundary);
    const clipBounds = lateral
      ? {
          minX: b.minX - margin,
          minY: b.minY - margin,
          maxX: b.maxX + margin,
          maxY: b.maxY + margin,
        }
      : null;
    const localDomain = lateral
      ? intersection(
          model.boundary,
          translateGeometry(rectangleGeometry(clipBounds), part.x, part.y),
        )
      : worldDomain;
    const localArea = localGeometry(area, part, localDomain, maskBoundsCache);
    const neighborhoodId = neighborhoodKey(part, neighbors);
    let contextEntry = contexts.get(neighborhoodId);
    if (!contextEntry) {
      const context = arrayContext(model, part, neighbors, { clipBounds });
      contextEntry = { context, key: JSON.stringify(context) };
      contexts.set(neighborhoodId, contextEntry);
    }
    const key = contextEntry.key + '|' + JSON.stringify(localArea);
    let cached = results.get(key);
    if (!cached) {
      const context = structuredClone(contextEntry.context);
      const result = apply(context, {
        ...params,
        area: localArea,
        ...(transferPlane === undefined ? {} : { arrayTransferPlane: transferPlane }),
      });
      if (!result?.changed && result?.error && !NO_CHANGE.test(result.error))
        throw new Error(result.error);
      cached = { result, leaf: result?.changed ? cropContext(context, part.model.boundary) : null };
      results.set(key, cached);
    }
    if (!cached.result?.changed) continue;
    const leaf = cached.leaf;
    // A neighboring operation may change its halo but leave this cell intact.
    if (physical(leaf) === physical(part.model)) continue;
    replacements.set(part.id, leaf);
    changed = true;
    last = cached.result;
    metadata = leaf;
    for (const k of COUNTERS) counters[k] = Math.max(counters[k] || 1, leaf[k] || 1);
  }
  if (!changed)
    return {
      changed: false,
      error: [...results.values()].find((c) => c.result?.error)?.result.error,
    };
  const templates = [],
    byPhysical = new Map(),
    signatures = new WeakMap(),
    definitions = new Map(model.array.templates.map((t) => [t.id, t.model]));
  const instances = model.array.instances.map((i) => {
    const leaf = replacements.get(i.id) || definitions.get(i.templateId);
    let signature = signatures.get(leaf);
    if (signature === undefined) {
      signature = JSON.stringify(leaf);
      signatures.set(leaf, signature);
    }
    let id = byPhysical.get(signature);
    if (!id) {
      id = `template-${templates.length}`;
      templates.push({ id, model: leaf });
      byPhysical.set(signature, id);
    }
    return { ...i, templateId: id };
  });
  // Commit only after every working set has completed successfully.
  model.array = { ...model.array, templates, instances };
  model.layers = metadata.layers;
  for (const key of ['implants', 'electricalRegions']) {
    const definitions = new Map((model[key] || []).map((a) => [a.id, a]));
    for (const leaf of replacements.values())
      for (const a of leaf[key] || []) definitions.set(a.id, { ...a, patches: [] });
    model[key] = [...definitions.values()];
  }
  Object.assign(model, counters);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return {
    ...last,
    changed: true,
    arrayWorkingSets: results.size,
    arrayChangedInstances: replacements.size,
  };
}
