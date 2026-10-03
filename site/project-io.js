import { migrateProjectFile, validateProjectFile } from './project-schema.js';

export const MAX_PROJECT_FILE_BYTES = 256 * 1024 * 1024;
export const PROJECT_LENGTH_QUANTUM_UM = 0.0001;

const STORAGE_ENCODING = 'shared-assets-v1';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function quantizeLength(value) {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value / PROJECT_LENGTH_QUANTUM_UM) * PROJECT_LENGTH_QUANTUM_UM;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toFixed(4));
}

function quantizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return;
  point[0] = quantizeLength(point[0]);
  point[1] = quantizeLength(point[1]);
}

function quantizeMultiPolygon(geometry) {
  for (const polygon of geometry || []) {
    for (const ring of polygon || []) {
      for (const point of ring || []) quantizePoint(point);
    }
  }
}

function multiBounds(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of geometry || []) {
    for (const ring of polygon || []) {
      for (const point of ring || []) {
        if (!Array.isArray(point) || point.length < 2) continue;
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite)
    ? { minX, minY, maxX, maxY }
    : null;
}

function quantizeModel(model) {
  if (!isObject(model)) return;
  quantizeMultiPolygon(model.boundary);
  for (const region of model.regions || []) {
    quantizeMultiPolygon(region.geom);
    for (const segment of region.stack || []) {
      segment.z0 = quantizeLength(segment.z0);
      segment.z1 = quantizeLength(segment.z1);
      for (const appearance of [segment.frontSurface, segment.backSurface]) {
        if (!isObject(appearance)) continue;
        appearance.featureSize = quantizeLength(appearance.featureSize);
        appearance.meanHeight = quantizeLength(appearance.meanHeight);
        if (appearance.etchDepth != null) appearance.etchDepth = quantizeLength(appearance.etchDepth);
      }
    }
  }
  for (const implant of model.implants || []) {
    implant.thickness = quantizeLength(implant.thickness);
    for (const patch of implant.patches || []) {
      quantizeMultiPolygon(patch.geom);
      patch.z = quantizeLength(patch.z);
      patch.zMin = quantizeLength(patch.zMin);
      patch.zMax = quantizeLength(patch.zMax);
      if (isObject(patch.surfaceAppearance)) {
        patch.surfaceAppearance.featureSize = quantizeLength(patch.surfaceAppearance.featureSize);
        patch.surfaceAppearance.meanHeight = quantizeLength(patch.surfaceAppearance.meanHeight);
        if (patch.surfaceAppearance.etchDepth != null) {
          patch.surfaceAppearance.etchDepth = quantizeLength(patch.surfaceAppearance.etchDepth);
        }
      }
    }
  }
  model.thickness = quantizeLength(model.thickness);
  const bounds = multiBounds(model.boundary);
  if (bounds) {
    model.width = quantizeLength(bounds.maxX - bounds.minX);
    model.height = quantizeLength(bounds.maxY - bounds.minY);
  } else {
    model.width = quantizeLength(model.width);
    model.height = quantizeLength(model.height);
  }
}

function quantizeLayout(layout) {
  if (!isObject(layout)) return;
  for (const element of [...(layout.elements || []), ...(layout.linework || [])]) {
    for (const point of element.points || []) quantizePoint(point);
    if (element.kind === 'path') element.width = quantizeLength(element.width);
  }
  if (isObject(layout.bounds)) {
    layout.bounds.minX = quantizeLength(layout.bounds.minX);
    layout.bounds.minY = quantizeLength(layout.bounds.minY);
    layout.bounds.maxX = quantizeLength(layout.bounds.maxX);
    layout.bounds.maxY = quantizeLength(layout.bounds.maxY);
    layout.bounds.width = quantizeLength(layout.bounds.maxX - layout.bounds.minX);
    layout.bounds.height = quantizeLength(layout.bounds.maxY - layout.bounds.minY);
  }
}

function quantizeProjectLengths(project) {
  if (!isObject(project)) return project;
  quantizeModel(project.model);
  quantizeLayout(project.layout);

  if (isObject(project.maskTransform)) {
    project.maskTransform.x = quantizeLength(project.maskTransform.x);
    project.maskTransform.y = quantizeLength(project.maskTransform.y);
  }

  if (isObject(project.roi)) {
    if (Array.isArray(project.roi.a)) quantizePoint(project.roi.a);
    if (Array.isArray(project.roi.b)) quantizePoint(project.roi.b);
    if (Array.isArray(project.roi.c)) quantizePoint(project.roi.c);
    if (project.roi.r != null) project.roi.r = quantizeLength(project.roi.r);
  }

  if (isObject(project.maskRoi)) {
    if (Array.isArray(project.maskRoi.c)) quantizePoint(project.maskRoi.c);
    if (project.maskRoi.size != null) project.maskRoi.size = quantizeLength(project.maskRoi.size);
    if (project.maskRoi.r != null) project.maskRoi.r = quantizeLength(project.maskRoi.r);
  }

  if (isObject(project.drawMask)) {
    for (const shape of project.drawMask.shapes || []) {
      if (Array.isArray(shape.a)) quantizePoint(shape.a);
      if (Array.isArray(shape.b)) quantizePoint(shape.b);
      if (Array.isArray(shape.c)) quantizePoint(shape.c);
      if (shape.r != null) shape.r = quantizeLength(shape.r);
      if (shape.innerR != null) shape.innerR = quantizeLength(shape.innerR);
      if (shape.outerR != null) shape.outerR = quantizeLength(shape.outerR);
      for (const point of shape.points || []) quantizePoint(point);
    }
  }

  if (isObject(project.section)) {
    quantizePoint(project.section.a);
    quantizePoint(project.section.b);
  }

  return project;
}

function deepEqual(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (Object.is(a, b)) continue;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (typeof a !== 'object') return false;

    const aArray = Array.isArray(a);
    if (aArray !== Array.isArray(b)) return false;
    if (aArray) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) pending.push([a[i], b[i]]);
      continue;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
}

function cloneCore(value, { model = true, layout = true } = {}) {
  const clone = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (key === 'snapshots' || key === 'sharedLayouts' || key === 'sharedModels' || key === 'storage')
      continue;
    if (!model && key === 'model') continue;
    if (!layout && key === 'layout') continue;
    clone[key] = structuredClone(item);
  }
  return clone;
}

function createAssetResolver(rootAsset, quantize) {
  const shared = [];
  const sources = [{ source: rootAsset, ref: 'project' }];
  const refsByIdentity = new WeakMap();
  if (isObject(rootAsset)) refsByIdentity.set(rootAsset, 'project');

  function resolve(asset) {
    if (!isObject(asset)) throw new Error('Snapshot asset is missing.');
    const known = refsByIdentity.get(asset);
    if (known !== undefined) return known;

    for (const entry of sources) {
      if (!deepEqual(asset, entry.source)) continue;
      refsByIdentity.set(asset, entry.ref);
      return entry.ref;
    }

    const stored = structuredClone(asset);
    quantize(stored);
    const ref = shared.length;
    shared.push(stored);
    sources.push({ source: asset, ref });
    refsByIdentity.set(asset, ref);
    return ref;
  }

  return { resolve, shared };
}

export function prepareProjectForWorkspaceStorage(project) {
  validateProjectFile(project);

  const stored = cloneCore(project);
  const layoutAssets = createAssetResolver(project.layout, () => {});
  const modelAssets = createAssetResolver(project.model, () => {});

  if (Array.isArray(project.snapshots)) {
    stored.snapshots = project.snapshots.map((record) => {
      const state = cloneCore(record.state, { model: false, layout: false });
      state.modelRef = modelAssets.resolve(record.state.model);
      state.layoutRef = layoutAssets.resolve(record.state.layout);
      return {
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        ...(record.branchId ? { branchId: record.branchId } : {}),
        ...(record.parentId ? { parentId: record.parentId } : {}),
        state,
      };
    });
  }

  if (layoutAssets.shared.length) stored.sharedLayouts = layoutAssets.shared;
  if (modelAssets.shared.length) stored.sharedModels = modelAssets.shared;
  stored.storage = {
    encoding: STORAGE_ENCODING,
    lossless: true,
  };
  return stored;
}

function openRingArea(points) {
  let area2 = 0;
  for (let index = 0; index < (points?.length || 0); index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    area2 += Number(a?.[0]) * Number(b?.[1]) - Number(b?.[0]) * Number(a?.[1]);
  }
  return Math.abs(area2) / 2;
}

function pathSpansDistance(points) {
  const first = points?.[0];
  return Boolean(
    first &&
      points
        .slice(1)
        .some((point) => Number(point?.[0]) !== Number(first[0]) || Number(point?.[1]) !== Number(first[1])),
  );
}

function assertLayoutGeometryPreserved(before, after, path = 'layout') {
  for (const key of ['elements', 'linework']) {
    const original = before?.[key] || [],
      stored = after?.[key] || [];
    for (let index = 0; index < original.length; index++) {
      const source = original[index],
        quantized = stored[index],
        itemPath = `${path}.${key}[${index}]`;
      if (
        source?.kind === 'path' &&
        Number(source.width) > 0 &&
        !(Number(quantized?.width) > 0)
      ) {
        throw new Error(
          `${itemPath}.width collapses to zero at ${PROJECT_LENGTH_QUANTUM_UM} µm precision.`,
        );
      }
      if (
        source?.kind === 'path' &&
        pathSpansDistance(source.points) &&
        !pathSpansDistance(quantized?.points)
      ) {
        throw new Error(
          `${itemPath}.points collapse to zero length at ${PROJECT_LENGTH_QUANTUM_UM} µm precision.`,
        );
      }
      if (
        source?.kind === 'polygon' &&
        openRingArea(source.points) > 0 &&
        !(openRingArea(quantized?.points) > 0)
      ) {
        throw new Error(
          `${itemPath}.points collapse to zero area at ${PROJECT_LENGTH_QUANTUM_UM} µm precision.`,
        );
      }
    }
  }
}

function assertQuantizedProjectGeometryPreserved(before, after) {
  assertLayoutGeometryPreserved(before?.layout, after?.layout, 'layout');
  const originalSnapshots = before?.snapshots || [],
    storedSnapshots = after?.snapshots || [];
  for (let index = 0; index < originalSnapshots.length; index++) {
    assertLayoutGeometryPreserved(
      originalSnapshots[index]?.state?.layout,
      storedSnapshots[index]?.state?.layout,
      `snapshots[${index}].state.layout`,
    );
  }
}

export function prepareProjectForStorage(project) {
  validateProjectFile(project);

  const stored = cloneCore(project);
  quantizeProjectLengths(stored);

  const layoutAssets = createAssetResolver(project.layout, quantizeLayout);
  const modelAssets = createAssetResolver(project.model, quantizeModel);

  if (Array.isArray(project.snapshots)) {
    stored.snapshots = project.snapshots.map((record) => {
      const state = cloneCore(record.state, { model: false, layout: false });
      quantizeProjectLengths(state);
      state.modelRef = modelAssets.resolve(record.state.model);
      state.layoutRef = layoutAssets.resolve(record.state.layout);
      return {
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        ...(record.branchId ? { branchId: record.branchId } : {}),
        ...(record.parentId ? { parentId: record.parentId } : {}),
        state,
      };
    });
  }

  if (layoutAssets.shared.length) stored.sharedLayouts = layoutAssets.shared;
  if (modelAssets.shared.length) stored.sharedModels = modelAssets.shared;
  stored.storage = {
    encoding: STORAGE_ENCODING,
    lengthQuantumUm: PROJECT_LENGTH_QUANTUM_UM,
  };

  const verification = structuredClone(stored);
  expandProjectStorage(verification);
  try {
    assertQuantizedProjectGeometryPreserved(project, verification);
    validateProjectFile(verification);
  } catch (error) {
    throw new Error(
      `Project cannot be stored safely at ${PROJECT_LENGTH_QUANTUM_UM} µm precision: ${error.message}`,
    );
  }
  return stored;
}

function resolveAsset(reference, rootAsset, sharedAssets, label) {
  if (reference === 'project') return rootAsset;
  if (Number.isInteger(reference) && reference >= 0 && reference < sharedAssets.length) {
    return sharedAssets[reference];
  }
  throw new Error(`Project file contains an invalid ${label} reference.`);
}

export function expandProjectStorage(project) {
  if (!isObject(project) || project.storage?.encoding !== STORAGE_ENCODING) return project;

  const sharedLayouts = Array.isArray(project.sharedLayouts) ? project.sharedLayouts : [];
  const sharedModels = Array.isArray(project.sharedModels) ? project.sharedModels : [];
  for (const record of project.snapshots || []) {
    const state = record?.state;
    if (!isObject(state)) continue;
    if (state.layout == null && state.layoutRef != null) {
      state.layout = resolveAsset(state.layoutRef, project.layout, sharedLayouts, 'layout');
    }
    if (state.model == null && state.modelRef != null) {
      state.model = resolveAsset(state.modelRef, project.model, sharedModels, 'model');
    }
    delete state.layoutRef;
    delete state.modelRef;
  }

  delete project.sharedLayouts;
  delete project.sharedModels;
  delete project.storage;
  return project;
}

function serializedProject(project, maxBytes) {
  const text = JSON.stringify(prepareProjectForStorage(project));
  const blob = new Blob([text], { type: 'application/json' });
  if (blob.size > maxBytes) {
    throw new Error(
      `Project file would be larger than the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`,
    );
  }
  return { text, blob };
}

export function serializeProject(project, maxBytes = MAX_PROJECT_FILE_BYTES) {
  return serializedProject(project, maxBytes).text;
}

export function downloadProject(project, filename = 'wafercad-project.json') {
  const { blob } = serializedProject(project, MAX_PROJECT_FILE_BYTES);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file) {
  if (!file) throw new Error('No project file selected.');
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error(
      `Project file is larger than the ${Math.round(MAX_PROJECT_FILE_BYTES / (1024 * 1024))} MB safety limit.`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Project file is not valid JSON.');
  }

  expandProjectStorage(parsed);
  return validateProjectFile(migrateProjectFile(parsed));
}
