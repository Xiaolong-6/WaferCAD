import { visibleMaterialModel } from './model.js';
import { materialSolidsFromTopology } from './process-topology.js';

// This optional two-thread path runs only *inside* the existing disposable
// Surface Plan worker. The primary worker computes the remaining materials,
// while one child handles the heaviest independent layer. No production
// geometry, tolerance, Z level or material ownership rule is approximated.
// Keep it disabled on small/mobile devices where the extra memory would hurt.
export function splitHeavyMaterialLayer(model, hardwareConcurrency = 0, deviceMemory = 0) {
  if (!model || hardwareConcurrency < 4 || deviceMemory < 8 || (model.regions?.length || 0) < 256) {
    return null;
  }
  const costs = new Map();
  for (const region of model.regions) {
    for (const segment of region.stack || []) {
      if (!costs.has(segment.layerId)) {
        costs.set(segment.layerId, { count: 0, polygons: 0, levels: new Set() });
      }
      const entry = costs.get(segment.layerId);
      entry.count++;
      entry.polygons += region.geom?.length || 0;
      entry.levels.add(segment.z0);
      entry.levels.add(segment.z1);
    }
  }
  if (costs.size < 2) return null;
  const orderedIds = [...costs.keys()];
  if ([...costs.values()].reduce((sum, entry) => sum + entry.count, 0) < 768) return null;
  // Material complexity depends on how many polygons remain active across Z
  // intervals, not just how many regions refer to a material. M3D's BASE has
  // more regions than layer-26, but only one slab and negligible Union work.
  const [heavyId, heavyEntry] = [...costs].sort(
    (a, b) => b[1].polygons * (b[1].levels.size - 1) - a[1].polygons * (a[1].levels.size - 1),
  )[0];
  const heavyCount = heavyEntry.count;
  const otherCount = [...costs].reduce(
    (total, [id, entry]) => total + (id === heavyId ? 0 : entry.count),
    0,
  );
  if (heavyCount < 256 || otherCount < 256) return null;

  const heavyRegions = [];
  const otherRegions = [];
  for (const region of model.regions) {
    const heavyStack = (region.stack || []).filter((segment) => segment.layerId === heavyId);
    const otherStack = (region.stack || []).filter((segment) => segment.layerId !== heavyId);
    if (heavyStack.length) heavyRegions.push({ ...region, stack: heavyStack });
    if (otherStack.length) otherRegions.push({ ...region, stack: otherStack });
  }
  return {
    heavyId,
    orderedIds,
    heavy: { ...model, regions: heavyRegions },
    other: { ...model, regions: otherRegions },
  };
}

export function assembleParallelMaterialSolids(
  partition,
  heavy,
  other,
  { allowClippedLayers = false } = {},
) {
  const solids = [...heavy, ...other];
  const byId = new Map(solids.map((item) => [item.layerId, item]));
  const permitted = new Set(partition.orderedIds);
  // An ROI can legitimately remove every extrusion of an otherwise visible
  // material. Preserve exact source order for the remaining materials while
  // rejecting missing *unclipped* layers, duplicate IDs, and foreign results.
  if (
    heavy.length > 1 ||
    (heavy.length === 0 && !allowClippedLayers) ||
    (heavy.length === 1 && heavy[0].layerId !== partition.heavyId) ||
    other.some((item) => item.layerId === partition.heavyId) ||
    byId.size !== solids.length ||
    solids.some((item) => !permitted.has(item.layerId)) ||
    (!allowClippedLayers && byId.size !== permitted.size)
  ) {
    throw new Error('Parallel material topology has incomplete or duplicate layer results.');
  }
  return partition.orderedIds.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

export async function parallelMaterialSolids(
  model,
  clip = null,
  {
    WorkerClass = globalThis.Worker,
    hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
    deviceMemory = globalThis.navigator?.deviceMemory,
    childTimeoutMs = 30_000,
  } = {},
) {
  if (typeof WorkerClass !== 'function') return null;
  const visible = visibleMaterialModel(model);
  const partition = splitHeavyMaterialLayer(visible, hardwareConcurrency, deviceMemory);
  if (!partition) return null;

  let worker;
  let timeoutId;
  try {
    const url = new URL('./renderer-material-solids-worker.js', import.meta.url);
    url.search = new URL(import.meta.url).search;
    worker = new WorkerClass(url);
    const heavyResult = new Promise((resolve, reject) => {
      // A child may stay alive without responding (e.g. native OOM/thrashing).
      // Never strand the owning Surface Plan worker waiting indefinitely.
      const boundedTimeoutMs =
        Number.isFinite(childTimeoutMs) && childTimeoutMs > 0 ? childTimeoutMs : 30_000;
      timeoutId = setTimeout(
        () => reject(new Error('Parallel material topology worker timed out.')),
        boundedTimeoutMs,
      );
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1) return;
        if (data.type === 'done') resolve(data.solids);
        else reject(new Error(data.message || 'Parallel material topology worker failed.'));
      };
      worker.onerror = (event) =>
        reject(new Error(event.message || 'Parallel material topology worker crashed.'));
      worker.onmessageerror = () => reject(new Error('Parallel material topology clone failed.'));
      worker.postMessage({ id: 1, model: partition.heavy, clip });
    });
    // Start the expensive layer before working synchronously on the rest.
    // This parent is itself a background worker, not the interactive UI.
    const other = materialSolidsFromTopology(partition.other, clip);
    const heavy = await heavyResult;
    return assembleParallelMaterialSolids(partition, heavy, other, {
      allowClippedLayers: clip != null,
    });
  } catch (error) {
    // Never publish partial geometry. The original whole-model calculation
    // in renderer-surface-plan-worker.js remains the fallback.
    console.warn('Parallel material solids unavailable; using exact serial topology.', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
    worker?.terminate();
  }
}
