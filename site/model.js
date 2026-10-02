import {
  bufferPolyline,
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
    units: { xy: 'µm', z: 'µm' },
    layers: [{ id: 'base', name: 'Base', color: BASE_COLOR }],
    regions: [
      {
        id: 'region-1',
        geom: cloneGeom(boundary),
        stack: [{ layerId: 'base', z0: -thickness / 2, z1: thickness / 2 }],
      },
    ],
    implants: [],
    nextImplantId: 1,
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

export function hasMaterial(model) {
  return Boolean(
    model?.regions?.some((region) => !isEmpty(region.geom) && (region.stack || []).length > 0),
  );
}

function ringArea(ring) {
  let sum = 0;
  for (let index = 1; index < (ring || []).length; index++) {
    const a = ring[index - 1],
      b = ring[index];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function geometryArea(geometry) {
  let total = 0;
  for (const polygon of geometry || []) {
    if (!polygon.length) continue;
    let area = Math.abs(ringArea(polygon[0]));
    for (let index = 1; index < polygon.length; index++) {
      area -= Math.abs(ringArea(polygon[index]));
    }
    total += Math.max(0, area);
  }
  return total;
}

export function layerPresent(model, layerId) {
  return Boolean(
    model?.regions?.some((region) =>
      (region.stack || []).some((segment) => segment.layerId === layerId),
    ),
  );
}

export function baseCoverageState(model) {
  let baseArea = 0;
  for (const region of model?.regions || []) {
    if ((region.stack || []).some((segment) => segment.layerId === 'base')) {
      baseArea += geometryArea(region.geom);
    }
  }
  if (baseArea <= 1e-12) return 'removed';

  const domainArea = geometryArea(model.boundary),
    tolerance = Math.max(1e-9, domainArea * 1e-9);
  return baseArea >= domainArea - tolerance ? 'full' : 'partial';
}

export function exposedLayerIds(model, area = model?.boundary, face = 'front') {
  if (!model || isEmpty(area)) return [];
  const ids = new Set();
  for (const region of model.regions || []) {
    if (isEmpty(intersection(region.geom, area))) continue;
    const segment = surfaceSegment(region.stack, face);
    if (segment) ids.add(segment.layerId);
  }
  return [...ids];
}

export function zDisplayScale(model) {
  const [lo, hi] = modelBoundsZ(model);
  const zSpan = Math.max(hi - lo, 1e-12);
  const xySpan = Math.max(model.width, model.height, 1e-12);
  return (xySpan * 0.12) / zSpan;
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

export function implantById(model, id) {
  return (model?.implants || []).find((implant) => implant.id === id) || null;
}

export function renameImplant(model, id, name) {
  const implant = implantById(model, id);
  if (!implant) return false;
  const clean = String(name || '').trim();
  if (!clean) return false;
  implant.name = clean;
  model.revision++;
  return true;
}

export function recolorImplant(model, id, color) {
  const implant = implantById(model, id);
  if (!implant || !/^#[0-9a-f]{6}$/i.test(color || '')) return false;
  implant.color = color;
  model.revision++;
  return true;
}

export function setImplantVisible(model, id, visible) {
  const implant = implantById(model, id);
  if (!implant) return false;
  implant.visible = Boolean(visible);
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
function surfaceField(face = 'front') {
  return face === 'back' ? 'backSurface' : 'frontSurface';
}
export function surfaceAppearance(segment, face = 'front') {
  return segment?.[surfaceField(face)] || null;
}
function cloneAppearance(appearance) {
  return appearance ? { ...appearance } : null;
}
function normalizedRoughSurface(surface, processRevision = 0, etchDepth = null) {
  if (surface?.kind !== 'rough') return null;
  const featureSize = Math.max(1e-6, Number(surface.featureSize) || 0.5),
    meanHeight = Math.max(
      1e-6,
      Number(surface.meanHeight ?? surface.amplitude) || featureSize,
    ),
    featureCv = Math.max(0, Math.min(1, Number(surface.featureCv) || 0)),
    heightCv = Math.max(0, Math.min(1, Number(surface.heightCv) || 0)),
    morphology = ['stochastic', 'pyramid'].includes(surface.morphology)
      ? surface.morphology
      : 'stochastic',
    polarity = surface.polarity === 'normal' ? 'normal' : 'inverted',
    seed = Number.isInteger(surface.seed)
      ? Math.max(0, surface.seed)
      : ((Math.max(1, processRevision) * 2654435761) >>> 0),
    profileId =
      typeof surface.profileId === 'string' && surface.profileId
        ? surface.profileId
        : `rough-${Math.max(1, processRevision)}-${seed >>> 0}`;
  return {
    kind: 'rough',
    featureSize,
    meanHeight,
    featureCv,
    heightCv,
    morphology,
    polarity,
    seed,
    profileId,
    geometryMode: 'ideal',
    ...(Number.isFinite(etchDepth) ? { etchDepth } : {}),
  };
}
function withSurfaceAppearance(stack, face, appearance) {
  if (!stack?.length) return stack;
  const out = stack.map((segment) => ({ ...segment })),
    segment = surfaceSegment(out, face),
    field = surfaceField(face);
  if (!segment) return out;
  if (appearance) segment[field] = cloneAppearance(appearance);
  else delete segment[field];
  return out;
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
      if (seg.frontSurface) prev.frontSurface = cloneAppearance(seg.frontSurface);
      else delete prev.frontSurface;
      if (prev.role === 'conformal-sidewall' || seg.role === 'conformal-sidewall')
        prev.role = 'conformal-sidewall';
    } else out.push(seg);
  }
  return out;
}

function stackKey(stack) {
  return (stack || [])
    .map((seg) =>
      [
        seg.layerId,
        seg.z0.toFixed(9),
        seg.z1.toFixed(9),
        seg.role || '',
        seg.backSurface ? JSON.stringify(seg.backSurface) : '',
        seg.frontSurface ? JSON.stringify(seg.frontSurface) : '',
      ].join(':'),
    )
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

function trimStack(stack, amount, face, appearance = null) {
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
  return withSurfaceAppearance(normalizeStack(out), face, appearance);
}

function addLayerToSurface(stack, layerId, amount, face) {
  const z = surfaceZ(stack, face),
    inherited = cloneAppearance(surfaceAppearance(surfaceSegment(stack, face), face));
  if (z == null) return stack;
  const out = stack.map((seg) => ({ ...seg })),
    added =
      face === 'front'
        ? { layerId, z0: z, z1: z + amount }
        : { layerId, z0: z - amount, z1: z };
  if (inherited) added[surfaceField(face)] = inherited;
  if (face === 'front') out.push(added);
  else out.unshift(added);
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

function mutateStack(stack, { type, layerId, targetLayerId, amount, face, appearance }) {
  if (type === 'etch') return trimStack(stack, amount, face, appearance);
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

function exposedLayerPatches(model, active, face, layerId) {
  const patches = [];

  for (const region of model.regions) {
    const segment = surfaceSegment(region.stack, face);
    if (!segment || segment.layerId !== layerId) continue;

    const geom = intersection(region.geom, active);
    if (isEmpty(geom)) continue;

    patches.push({
      z: face === 'front' ? segment.z1 : segment.z0,
      geom,
    });
  }

  // Keep regions separate here. Unioning every same-Z patch first made complex
  // imported layouts numerically fragile. Shared partition edges are harmless:
  // conformalSidewallStack() rejects a neighbor whose exposed Z already reaches
  // the source Z, so only genuine height/void boundaries receive material.
  return patches.sort((a, b) => (face === 'front' ? b.z - a.z : a.z - b.z));
}

function conformalSidewallStack(stack, layerId, face, sourceZ) {
  const local = surfaceZ(stack, face);
  if (local == null || sourceZ == null || !layerId) return stack;

  const out = stack.map((seg) => ({ ...seg }));
  if (face === 'front') {
    if (local >= sourceZ - 1e-9) return out;
    out.push({ layerId, z0: local, z1: sourceZ, role: 'conformal-sidewall' });
  } else {
    if (local <= sourceZ + 1e-9) return out;
    out.unshift({ layerId, z0: sourceZ, z1: local, role: 'conformal-sidewall' });
  }
  return normalizeStack(out);
}

function conformalRingBands(geom, amount) {
  const bands = [];
  for (const poly of geom || [])
    for (const ring of poly || []) {
      if (!Array.isArray(ring) || ring.length < 4) continue;
      const points = ring.slice(0, -1);
      try {
        const band = bufferPolyline(points, amount, 20, true);
        if (!isEmpty(band)) bands.push(band);
      } catch {
        // Complex imported rings can make a large polygon union numerically
        // fragile. Fall back to local edge capsules so one bad ring cannot
        // cancel an otherwise valid conformal process.
        for (let index = 1; index < ring.length; index++) {
          const band = bufferPolyline([ring[index - 1], ring[index]], amount, 12, false);
          if (!isEmpty(band)) bands.push(band);
        }
      }
    }
  return bands;
}

function uncoveredGeometry(model) {
  let uncovered = cloneGeom(model.boundary);
  for (const region of model.regions) {
    if (isEmpty(uncovered)) break;
    uncovered = difference(uncovered, region.geom);
  }
  return uncovered;
}

function addVoidConformalSidewall(model, geom, layerId, face, sourceZ) {
  if (isEmpty(geom) || !layerId || sourceZ == null) return;
  const [lo, hi] = modelBoundsZ(model),
    z0 = face === 'front' ? lo : sourceZ,
    z1 = face === 'front' ? sourceZ : hi;
  if (!(z1 > z0 + 1e-9)) return;
  model.regions.push({
    id: `region-${model.nextRegionId++}`,
    geom,
    stack: [{ layerId, z0, z1, role: 'conformal-sidewall' }],
  });
}

function applyConformalCoating(model, active, layerId, amount, face) {
  // Deposit and Extend share one conformal kernel. Extend simply reuses the
  // selected layer id, so contiguous material merges during stack normalization.
  //
  // Keep the pre-coating void domain. A conformal film is allowed to occupy
  // empty trench / through-hole space next to an exposed wall; ordinary
  // splitByArea() only visits existing material regions.
  let uncovered = uncoveredGeometry(model);

  // Stage 1: coat every exposed horizontal surface in the selected area.
  splitByArea(model, active, (stack) => addLayerToSurface(stack, layerId, amount, face));

  // Stage 2: coat genuine vertical boundaries. Work ring-by-ring instead of
  // buffering the union of an entire height patch. This keeps polygon clipping
  // local and avoids the large output-ring failures seen on imported wafers with
  // many circular/nested features.
  const sources = exposedLayerPatches(model, active, face, layerId);
  for (const source of sources) {
    for (const rawBand of conformalRingBands(source.geom, amount)) {
      const band = intersection(rawBand, model.boundary);
      if (isEmpty(band)) continue;

      // The symmetric ring band touches both sides of an edge. The stack test
      // below only accepts the physically lower (front) / higher (back) side,
      // so partition edges and the source interior cannot create fake material.
      splitByArea(model, band, (stack) =>
        conformalSidewallStack(stack, layerId, face, source.z),
      );

      // A true void has no stack for splitByArea() to mutate. Add only the
      // still-uncovered part of this local sidewall band, then remove it from
      // the void domain so later source levels cannot overlap it.
      if (!isEmpty(uncovered)) {
        const voidBand = intersection(band, uncovered);
        if (!isEmpty(voidBand)) {
          addVoidConformalSidewall(model, voidBand, layerId, face, source.z);
          uncovered = difference(uncovered, voidBand);
        }
      }
    }
  }
}

function applyOperationImpl(
  model,
  {
    type,
    name,
    targetLayerId,
    thickness,
    face = 'front',
    area,
    growth = 'direct',
    surface,
    color,
    tilt = 0,
  },
) {
  const amount = Math.max(1e-5, Number(thickness) || 0);
  if (type === 'etch' && surface?.kind === 'rough') {
    const roughHeight = Number(surface.meanHeight ?? surface.amplitude),
      featureCv = Number(surface.featureCv ?? 0),
      heightCv = Number(surface.heightCv ?? 0),
      morphology = surface.morphology ?? 'stochastic',
      polarity = surface.polarity ?? 'inverted';
    if (!(roughHeight > 0)) {
      return { changed: false, error: 'Rough mean Height must be greater than zero.' };
    }
    if (roughHeight > amount + 1e-9) {
      return {
        changed: false,
        error: 'Rough mean Height cannot exceed Etch Depth.',
      };
    }
    if (!(featureCv >= 0 && featureCv <= 1) || !(heightCv >= 0 && heightCv <= 1)) {
      return {
        changed: false,
        error: 'Rough CV values must be between 0% and 100%.',
      };
    }
    if (!['stochastic', 'pyramid'].includes(morphology)) {
      return { changed: false, error: 'Unsupported surface morphology.' };
    }
    if (!['inverted', 'normal'].includes(polarity)) {
      return { changed: false, error: 'Rough polarity must be Inverted or Normal.' };
    }
  }
  const appearance =
    type === 'etch'
      ? normalizedRoughSurface(surface, (model.processRevision || 0) + 1, amount)
      : null;
  let active = intersection(area, model.boundary);
  if (isEmpty(active)) return { changed: false };
  if (!hasMaterial(model)) {
    return {
      changed: false,
      error: 'No material remains. Recreate the Base before applying another process.',
    };
  }
  const touchesMaterial = model.regions.some(
    (region) => !isEmpty(intersection(active, region.geom)),
  );
  if (!touchesMaterial) {
    return { changed: false, error: 'The selected area contains no material.' };
  }
  if (type === 'implant') {
    const patches = [];
    for (const region of model.regions) {
      const segment = surfaceSegment(region.stack, face),
        geom = intersection(region.geom, active);
      if (!segment || isEmpty(geom)) continue;
      patches.push({
        geom,
        z: face === 'front' ? segment.z1 : segment.z0,
        zMin: region.stack[0]?.z0 ?? segment.z0,
        zMax: region.stack.at(-1)?.z1 ?? segment.z1,
        layerId: segment.layerId,
        surfaceAppearance: cloneAppearance(surfaceAppearance(segment, face)),
      });
    }
    if (!patches.length) {
      return { changed: false, error: 'No exposed surface is available for Implant.' };
    }

    if (!Array.isArray(model.implants)) model.implants = [];
    if (!Number.isInteger(model.nextImplantId) || model.nextImplantId < 1) {
      model.nextImplantId = model.implants.length + 1;
    }
    const ordinal = model.nextImplantId++,
      implant = {
        id: `implant-${ordinal}`,
        name: String(name || `Implant ${ordinal}`).trim() || `Implant ${ordinal}`,
        color: /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#D65A6F',
        face,
        thickness: amount,
        tilt: Math.max(-80, Math.min(80, Number(tilt) || 0)),
        visible: true,
        patches,
      };
    model.implants.push(implant);
    model.revision++;
    model.processRevision = (model.processRevision || 0) + 1;
    return { changed: true, implantId: implant.id };
  }

  let layer = null;
  if (type === 'add') layer = createLayer(model, name);
  if (type === 'grow' && !layerById(model, targetLayerId))
    return { changed: false, error: 'Target layer is unavailable.' };

  if (type === 'grow') {
    const exposed = exposedLayerPatches(model, active, face, targetLayerId);
    if (!exposed.length) {
      return {
        changed: false,
        error: 'Target layer is not exposed in the selected area on the active face.',
      };
    }
  }

  if (type === 'etch') {
    splitByArea(model, active, (stack) =>
      mutateStack(stack, { type, amount, face, appearance }),
    );
  } else if (growth === 'conformal') {
    applyConformalCoating(model, active, layer?.id || targetLayerId, amount, face);
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
      face,
      appearance: cloneAppearance(surfaceAppearance(seg, face)),
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
