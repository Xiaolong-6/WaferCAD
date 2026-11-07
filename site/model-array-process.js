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
import { materialShadowRadius } from './material-model-tiling.js';
import {
  intersection as intersectMaterial,
  unionGeometries as unionMaterialGeometries,
  unionMaterialSweeps,
} from './material-process-boolean.js';
import { synchronizeMaterialPartition } from './material-process-noding.js';
import { compactMaterialArrayStorage } from './material-array-compaction.js';
import { unionMaterialTiles } from './material-tile-union.js';
import {
  materialOwnerCoverage,
  partitionMaterialProcess,
  repairMaterialHaloPartition,
} from './material-process-partition.js';

const COUNTERS = ['nextLayerId', 'nextRegionId', 'nextImplantId', 'nextElectricalRegionId'];
const NO_CHANGE =
  /not exposed|None of the selected|no eligible|contains no material|contains no sacrificial layer to lift off|No material remains|does not remove material|No exposed|not remove the selected|did not remove|does not overlap/i;
export function applyArrayOperation(
  model,
  params,
  apply,
  {
    onWorkingSet = () => {},
    validateWorkingSet = () => {},
    restoreWorkingSet = () => null,
    saveWorkingSet = () => {},
  } = {},
) {
  const area = params.area,
    maskBoundsCache = new WeakMap();
  const development = params.etchProfile === 'develop' && Number(params.developLateralUm) > 0;
  const lateral =
    development ||
    params.incidence?.materialGeometry === true ||
    params.growth === 'conformal' ||
    ['isotropic', 'undercut'].includes(params.etchProfile);
  const radius =
    params.incidence?.materialGeometry === true
      ? materialShadowRadius(model, params)
      : development
        ? Number(params.developLateralUm)
        : lateral
          ? Math.max(0, Number(params.thickness) || 0)
          : 0;
  const reach = development || ['isotropic', 'undercut'].includes(params.etchProfile) ? radius : 0;
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
  const existingDopants = new Set((model.dopantRegions || []).map((region) => region.id));
  const newDopants = new Map();
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
    if (clipBounds && params.incidence?.materialGeometry) {
      for (const key of ['minX', 'minY'])
        clipBounds[key] = Number((Math.floor(clipBounds[key] * 10000) / 10000).toFixed(4));
      for (const key of ['maxX', 'maxY'])
        clipBounds[key] = Number((Math.ceil(clipBounds[key] * 10000) / 10000).toFixed(4));
    }
    const localDomain = lateral
      ? intersection(
          model.boundary,
          translateGeometry(rectangleGeometry(clipBounds), part.x, part.y),
        )
      : worldDomain;
    const localArea = localGeometry(area, part, localDomain, maskBoundsCache);
    // Sparse file-Mask queries may select none of a background cell.
    // Avoid constructing or caching any Kernel working set for that cell.
    if (!localArea.length) continue;
    const neighborhoodId = neighborhoodKey(part, neighbors);
    let contextEntry = contexts.get(neighborhoodId);
    const buildContext = () => {
      const unannotated = ['implants', 'electricalRegions', 'dopantRegions'].every(
        (key) => !(model[key] || []).length,
      );
      const context = arrayContext(model, part, neighbors, {
        clipBounds,
        ...(params.incidence?.materialGeometry
          ? {
              intersect: intersectMaterial,
              unite: unannotated
                ? (geometries) =>
                    unionMaterialTiles(geometries, { gridScale: 10000000 }) ??
                    unionMaterialSweeps(geometries)
                : unionMaterialSweeps,
            }
          : {}),
      });
      let repaired = false;
      if (params.incidence?.materialGeometry) {
        context.regions = synchronizeMaterialPartition(context.regions);
        repaired = repairMaterialHaloPartition(context, () => {
          const coverage = neighbors.map((neighbor) =>
            intersectMaterial(
              translateGeometry(
                materialOwnerCoverage(neighbor.model),
                neighbor.x - part.x,
                neighbor.y - part.y,
              ),
              context.boundary,
            ),
          );
          return (
            unionMaterialTiles(coverage, { gridScale: 10000000 }) ??
            unionMaterialGeometries(coverage)
          );
        });
      }
      return { context, repaired };
    };
    if (!contextEntry) {
      const { context, repaired } = buildContext();
      contextEntry = { context, repaired, key: JSON.stringify(context) };
      contexts.set(neighborhoodId, contextEntry);
    }
    const key = contextEntry.key + '|' + JSON.stringify(localArea);
    let cached = results.get(key);
    if (!cached) {
      onWorkingSet({ workingSet: results.size + 1, partId: part.id, totalInstances: parts.length });
      const childParams = {
        ...params,
        area: localArea,
        ...(params.incidence?.materialGeometry ? { arrayMaterialWorkingSet: true } : {}),
        ...(contextEntry.repaired ? { materialHaloRepaired: true } : {}),
        ...(transferPlane === undefined ? {} : { arrayTransferPlane: transferPlane }),
      };
      const entry = { key, params: childParams, boundary: part.model.boundary };
      const restored = restoreWorkingSet(entry);
      const context = restored
        ? null
        : structuredClone(contextEntry.context || buildContext().context);
      const result = restored?.result ?? apply(context, childParams);
      if (!result?.changed && result?.error && !NO_CHANGE.test(result.error))
        throw new Error(result.error);
      const leaf = restored
        ? restored.leaf
        : result?.changed
          ? cropContext(
              context,
              part.model.boundary,
              params.incidence?.materialGeometry ? { intersect: intersectMaterial } : {},
            )
          : null;
      const addedDopants = restored
        ? restored.addedDopants
        : (leaf?.dopantRegions || []).filter((dopant) => !existingDopants.has(dopant.id));
      if (leaf && restored && JSON.stringify(leaf.boundary) !== JSON.stringify(part.model.boundary))
        throw Error('Restored array working set has a different physical domain.');
      if (leaf && !restored && params.incidence?.materialGeometry) {
        leaf.regions = partitionMaterialProcess(leaf, materialOwnerCoverage(part.model));
      }
      if (leaf) validateWorkingSet(leaf, { workingSet: results.size + 1, partId: part.id });
      // Root array dopants carry world-space intent. A leaf must not
      // inherit every other site's globally aggregated geometry.
      if (leaf) {
        if (part.model.dopantRegions) {
          leaf.dopantRegions = structuredClone(part.model.dopantRegions);
        } else {
          delete leaf.dopantRegions;
        }
      }
      cached = { result, leaf, addedDopants };
      if (!restored) saveWorkingSet(entry, cached);
      results.set(key, cached);
    }
    // Material halos can be large. Keep their immutable cache key and result,
    // releasing the duplicate planning model after its first use. A different
    // local area can reconstruct the same context from the unchanged root.
    if (params.incidence?.materialGeometry) contextEntry.context = null;
    if (!cached.result?.changed) continue;
    const leaf = cached.leaf;
    // A neighboring operation may change its halo but leave this cell intact.
    if (physical(leaf) === physical(part.model)) continue;
    replacements.set(part.id, leaf);
    for (const dopant of cached.addedDopants) {
      const world = translateGeometry(dopant.area, part.x, part.y);
      const previous = newDopants.get(dopant.id);
      if (previous) {
        const { area: oldArea, ...oldMeta } = previous;
        const { area: sourceArea, ...sourceMeta } = dopant;
        if (JSON.stringify(oldMeta) !== JSON.stringify(sourceMeta)) {
          throw new Error('Array dopant metadata differs between identical implant IDs.');
        }
        oldArea.push(...world);
      } else {
        newDopants.set(dopant.id, { ...structuredClone(dopant), area: world });
      }
    }
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
  const next = { ...model, ...counters, array: { ...model.array, templates, instances } };
  if (params.incidence?.materialGeometry) compactMaterialArrayStorage(next);
  model.array = next.array;
  // Preserve per-face provenance on existing material IDs when array working
  // sets regenerate their layer metadata from canonical template models.
  const previousLayers = new Map(model.layers.map((layer) => [layer.id, layer]));
  model.layers = metadata.layers.map((layer) => {
    const previous = previousLayers.get(layer.id);
    return previous?.processGroupId
      ? {
          ...layer,
          processGroupId: previous.processGroupId,
          processFace: previous.processFace,
          pairedLayerId: previous.pairedLayerId,
        }
      : layer;
  });
  if (newDopants.size) {
    model.dopantRegions = [...(model.dopantRegions || []), ...newDopants.values()];
  }
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
