import { visibleMaterialModel } from './model.js';
import { materialSolidsFromTopology } from './process-topology.js';
import { intersection, isEmpty } from './vector-geometry.js';

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

// Match extrusionGroupsFromTopology: clip every Region *before* selecting
// first-occurrence material order. An ROI may exclude the first Region of a
// layer while preserving a later Region of the same layer.
export function survivingMaterialLayerIds(model, clip = null) {
  const ids = new Set();
  for (const region of model?.regions || []) {
    if (!region.stack?.length) continue;
    const geom = clip == null ? region.geom : intersection(region.geom, clip);
    if (isEmpty(geom)) continue;
    for (const segment of region.stack) ids.add(segment.layerId);
  }
  return [...ids];
}

export function assembleParallelMaterialSolids(
  partition,
  heavy,
  other,
  { expectedIds = partition.orderedIds } = {},
) {
  const solids = [...heavy, ...other];
  const byId = new Map(solids.map((item) => [item.layerId, item]));
  const permitted = new Set(partition.orderedIds);
  const expected = new Set(expectedIds);
  // The worker can omit only layers proven empty by the same ROI rules as
  // serial extrusion grouping. Reject duplicates, foreign IDs, and every
  // incomplete child result instead of publishing silently missing geometry.
  if (
    expected.size !== expectedIds.length ||
    expectedIds.some((id) => !permitted.has(id)) ||
    heavy.length > 1 ||
    (heavy.length === 1 && heavy[0].layerId !== partition.heavyId) ||
    other.some((item) => item.layerId === partition.heavyId) ||
    byId.size !== solids.length ||
    byId.size !== expected.size ||
    solids.some((item) => !expected.has(item.layerId))
  ) {
    throw new Error('Parallel material topology has incomplete or duplicate layer results.');
  }
  return expectedIds.map((id) => byId.get(id));
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
    const expectedIds = survivingMaterialLayerIds(visible, clip);
    const url = new URL('./renderer-material-solids-worker.js', import.meta.url);
    url.search = new URL(import.meta.url).search;
    worker = new WorkerClass(url);
    let rejectChild;
    const heavyResult = new Promise((resolve, reject) => {
      rejectChild = reject;
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
    // The parent cannot receive messages while synchronously computing the
    // other layers (or cloning the child input for postMessage). Arm the
    // watchdog only once that blocking work ends; otherwise an expired timer
    // may win over an already-finished child and force a second serial pass.
    const other = materialSolidsFromTopology(partition.other, clip);
    const boundedTimeoutMs =
      Number.isFinite(childTimeoutMs) && childTimeoutMs > 0 ? childTimeoutMs : 30_000;
    timeoutId = setTimeout(
      () => rejectChild(new Error('Parallel material topology worker timed out.')),
      boundedTimeoutMs,
    );
    const heavy = await heavyResult;
    return assembleParallelMaterialSolids(partition, heavy, other, { expectedIds });
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
