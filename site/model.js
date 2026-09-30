import {
  bufferMulti,
  circleMulti,
  cloneGeom,
  difference,
  intersection,
  isEmpty,
  rectMulti,
  unionGeometries,
} from './vector-geometry.js';

export const COLORS = [
  '#6C8EBF',
  '#82B6A6',
  '#D6A85F',
  '#C97B84',
  '#8A7CB8',
  '#6FA9B8',
  '#A98B6C',
  '#7FA178',
  '#B7799C',
  '#7590AA',
];
export const BASE_COLOR = '#C3CBD4';

function baseGeometry(shape, width, height) {
  return shape === 'circle' ? circleMulti(width, height, 192) : rectMulti(width, height);
}

export function createModel({
  shape = 'circle',
  width = 100000,
  height = 100000,
  thickness = 12,
} = {}) {
  const boundary = baseGeometry(shape, width, height);
  return {
    kernel: 'vector-2.5d-v1',
    shape,
    width,
    height,
    thickness,
    boundary,
    units: { xy: 'µm', z: 'relative' },
    layers: [{ id: 'base', name: 'Base', color: BASE_COLOR }],
    regions: [
      {
        id: 'region-1',
        geom: cloneGeom(boundary),
        stack: [{ layerId: 'base', z0: -thickness / 2, z1: thickness / 2 }],
      },
    ],
    nextLayerId: 1,
    nextRegionId: 2,
    revision: 1,
    processRevision: 0,
  };
}

export const cloneModel = (model) => structuredClone(model);
export const isVectorModel = (model) =>
  model?.kernel === 'vector-2.5d-v1' && Array.isArray(model.regions);
export const fullFaceGeometry = (model) => cloneGeom(model.boundary);

export function relativeZToXYScale(model) {
  return Math.max(model.width, model.height) / 100;
}

export function conformalCarrierXYScale(model) {
  const span = Math.max(Number(model?.width) || 0, Number(model?.height) || 0);
  return Math.min(0.5, Math.max(0.001, span * 1e-5));
}

export function layerById(model, id) {
  return model.layers.find((layer) => layer.id === id) || null;
}
export function createLayer(model, name) {
  const ordinal = model.nextLayerId++;
  const id = `layer-${ordinal}`;
  const layer = {
    id,
    name: (name || `Layer ${ordinal}`).trim(),
    color: COLORS[(ordinal - 1) % COLORS.length],
  };
  model.layers.push(layer);
  return layer;
}
export function renameLayer(model, id, name) {
  const layer = layerById(model, id);
  if (!layer) return false;
  const clean = String(name || '').trim();
  if (!clean) return false;
  layer.name = clean;
  model.revision++;
  return true;
}
export function recolorLayer(model, id, color) {
  const layer = layerById(model, id);
  if (!layer || !/^#[0-9a-f]{6}$/i.test(color || '')) return false;
  layer.color = color;
  model.revision++;
  return true;
}

export function isLayerExposed(model, id) {
  if (id === 'base' || !layerById(model, id)) return false;
  let found = false;
  for (const region of model.regions) {
    const stack = region.stack || [];
    for (let index = 0; index < stack.length; index++) {
      if (stack[index].layerId !== id) continue;
      found = true;
      if (index !== 0 && index !== stack.length - 1) return false;
    }
  }
  return found;
}

export function deleteExposedLayer(model, id) {
  if (!isLayerExposed(model, id)) return false;
  const next = [];
  for (const region of model.regions) {
    const stack = normalizeStack(region.stack.filter((segment) => segment.layerId !== id));
    if (stack.length) next.push({ id: region.id, geom: cloneGeom(region.geom), stack });
  }
  model.regions = mergeRegions(model, next);
  model.layers = model.layers.filter((layer) => layer.id !== id);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return true;
}

export function surfaceSegment(stack, face = 'front') {
  if (!stack?.length) return null;
  return face === 'front' ? stack.at(-1) : stack[0];
}
export function surfaceZ(stack, face = 'front') {
  const seg = surfaceSegment(stack, face);
  return seg ? (face === 'front' ? seg.z1 : seg.z0) : null;
}
export function normalizeStack(stack) {
  const sorted = (stack || [])
    .filter((seg) => seg.z1 > seg.z0 + 1e-9)
    .map((seg) => ({ ...seg }))
    .sort((a, b) => a.z0 - b.z0);
  const out = [];
  for (const seg of sorted) {
    const prev = out.at(-1);
    if (prev && prev.layerId === seg.layerId && Math.abs(prev.z1 - seg.z0) < 1e-8) {
      prev.z1 = seg.z1;
      if (prev.role === 'conformal-sidewall' || seg.role === 'conformal-sidewall')
        prev.role = 'conformal-sidewall';
    } else out.push(seg);
  }
  return out;
}

function stackKey(stack) {
  return (stack || [])
    .map((seg) => `${seg.layerId}:${seg.z0.toFixed(9)}:${seg.z1.toFixed(9)}:${seg.role || ''}`)
    .join('|');
}
function mergeRegions(model, regions) {
  const groups = new Map();
  for (const region of regions) {
    if (isEmpty(region.geom) || !region.stack.length) continue;
    const key = stackKey(region.stack);
    if (!groups.has(key))
      groups.set(key, { stack: region.stack.map((s) => ({ ...s })), geoms: [] });
    groups.get(key).geoms.push(region.geom);
  }
  const out = [];
  for (const group of groups.values()) {
    const geom = unionGeometries(group.geoms);
    if (isEmpty(geom)) continue;
    out.push({ id: `region-${model.nextRegionId++}`, geom, stack: group.stack });
  }
  return out;
}

function trimStack(stack, amount, face) {
  let left = amount,
    out = stack.map((seg) => ({ ...seg }));
  while (left > 1e-9 && out.length) {
    const idx = face === 'front' ? out.length - 1 : 0,
      seg = out[idx],
      height = seg.z1 - seg.z0;
    if (left >= height - 1e-9) {
      left -= height;
      out.splice(idx, 1);
    } else {
      if (face === 'front') seg.z1 -= left;
      else seg.z0 += left;
      left = 0;
    }
  }
  return normalizeStack(out);
}

function addLayerToSurface(stack, layerId, amount, face) {
  const z = surfaceZ(stack, face);
  if (z == null) return stack;
  const out = stack.map((seg) => ({ ...seg }));
  if (face === 'front') out.push({ layerId, z0: z, z1: z + amount });
  else out.unshift({ layerId, z0: z - amount, z1: z });
  return normalizeStack(out);
}

function growSurfaceLayer(stack, targetLayerId, amount, face) {
  const out = stack.map((seg) => ({ ...seg })),
    seg = surfaceSegment(out, face);
  if (!seg || seg.layerId !== targetLayerId) return out;
  if (face === 'front') seg.z1 += amount;
  else seg.z0 -= amount;
  return normalizeStack(out);
}

function mutateStack(stack, { type, layerId, targetLayerId, amount, face }) {
  if (type === 'etch') return trimStack(stack, amount, face);
  if (type === 'grow') return growSurfaceLayer(stack, targetLayerId, amount, face);
  return addLayerToSurface(stack, layerId, amount, face);
}

function splitByArea(model, area, mutator) {
  const next = [];
  for (const region of model.regions) {
    const hit = intersection(region.geom, area);
    const rest = difference(region.geom, area);
    if (!isEmpty(rest))
      next.push({ id: region.id, geom: rest, stack: region.stack.map((s) => ({ ...s })) });
    if (!isEmpty(hit)) {
      const stack = mutator(
        region.stack.map((s) => ({ ...s })),
        region,
      );
      if (stack.length) next.push({ id: `region-${model.nextRegionId++}`, geom: hit, stack });
    }
  }
  model.regions = mergeRegions(model, next);
}

function pointOnBoundary(boundary, point, tolerance = 0.05) {
  for (const poly of boundary)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1],
          [bx, by] = ring[i],
          dx = bx - ax,
          dy = by - ay,
          len2 = dx * dx + dy * dy || 1,
          t = Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / len2));
        if (Math.hypot(point[0] - (ax + t * dx), point[1] - (ay + t * dy)) < tolerance) return true;
      }
  return false;
}

function conformalSourcePatches(model, active, face, type, targetLayerId) {
  const groups = new Map();

  for (const region of model.regions) {
    const segment = surfaceSegment(region.stack, face);
    if (!segment || (type === 'grow' && segment.layerId !== targetLayerId)) continue;

    const geom = intersection(region.geom, active);
    if (isEmpty(geom)) continue;

    const z = face === 'front' ? segment.z1 : segment.z0;
    const key = z.toFixed(9);
    if (!groups.has(key)) groups.set(key, { z, geoms: [] });
    groups.get(key).geoms.push(geom);
  }

  return [...groups.values()]
    .map(({ z, geoms }) => ({ z, geom: unionGeometries(geoms) }))
    .sort((a, b) => (face === 'front' ? b.z - a.z : a.z - b.z));
}

function conformalSidewallStack(stack, layerId, targetLayerId, amount, face, sourceZ, type) {
  const local = surfaceZ(stack, face);
  if (local == null || sourceZ == null) return stack;
  const coatingLayerId = targetLayerId || layerId;
  if (!coatingLayerId) return stack;

  const out = stack.map((seg) => ({ ...seg }));
  if (face === 'front') {
    const z1 = sourceZ + amount;
    if (local >= z1 - 1e-9) return out;
    out.push({ layerId: coatingLayerId, z0: local, z1, role: 'conformal-sidewall' });
  } else {
    const z0 = sourceZ - amount;
    if (local <= z0 + 1e-9) return out;
    out.unshift({ layerId: coatingLayerId, z0, z1: local, role: 'conformal-sidewall' });
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

    const lateralAmount = amount * conformalCarrierXYScale(model);
    const coversWholeBoundary = isEmpty(difference(model.boundary, active));
    const sidewallSources =
      type === 'add' && coversWholeBoundary && sources.length ? sources.slice(0, -1) : sources;
    const keepSidewallSegment = coversWholeBoundary
      ? (a, b) =>
          !(
            pointOnBoundary(model.boundary, a) &&
            pointOnBoundary(model.boundary, b) &&
            pointOnBoundary(model.boundary, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
          )
      : null;
    for (const source of sidewallSources) {
      const expanded = intersection(
        bufferMulti(source.geom, lateralAmount, 32, keepSidewallSegment),
        model.boundary,
      );
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
      stack: region.stack,
    });
  }
  return out;
}

export function layerUsage(model, id) {
  let count = 0;
  for (const region of model.regions)
    for (const seg of region.stack) if (seg.layerId === id) count++;
  return count;
}
