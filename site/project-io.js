import { isArrayModel, storedModelParts } from './model-array.js';
import { migrateProjectFile, validateProjectFile } from './project-schema.js';
import { compactGeometryDictionary, expandGeometryDictionary } from './project-geometry-storage.js';

export const MAX_PROJECT_FILE_BYTES = 256 * 1024 * 1024;
export const PROJECT_LENGTH_QUANTUM_UM = 0.0001;
export const DOWNLOAD_URL_REVOKE_DELAY_MS = 30_000;

const LEGACY_STORAGE_ENCODING = 'shared-assets-v1';
const STORAGE_ENCODING = 'shared-assets-v2';
const TEMPLATE_STORAGE_ENCODING = 'shared-assets-v3';
const ARRAY_STORAGE_ENCODING = 'shared-assets-v4';

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
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
}

function quantizeModel(model) {
  if (!isObject(model)) return;
  if (isArrayModel(model)) {
    for (const t of model.array.templates) quantizeModel(t.model);
    for (const i of model.array.instances) {
      i.x = quantizeLength(i.x);
      i.y = quantizeLength(i.y);
    }
  }
  quantizeMultiPolygon(model.boundary);
  for (const region of model.regions || []) {
    quantizeMultiPolygon(region.geom);
    for (const segment of region.stack || []) {
      segment.z0 = quantizeLength(segment.z0);
      segment.z1 = quantizeLength(segment.z1);
      for (const appearance of [segment.frontSurface, segment.backSurface]) {
        if (!isObject(appearance)) continue;
        if (appearance.sampleOrigin) quantizePoint(appearance.sampleOrigin);
        appearance.featureSize = quantizeLength(appearance.featureSize);
        appearance.meanHeight = quantizeLength(appearance.meanHeight);
        if (appearance.etchDepth != null)
          appearance.etchDepth = quantizeLength(appearance.etchDepth);
      }
    }
  }
  const quantizeAnnotationVolume = (annotation) => {
    annotation.thickness = quantizeLength(annotation.thickness);
    for (const patch of annotation.patches || []) {
      quantizeMultiPolygon(patch.geom);
      patch.z = quantizeLength(patch.z);
      patch.zMin = quantizeLength(patch.zMin);
      patch.zMax = quantizeLength(patch.zMax);
      if (isObject(patch.surfaceAppearance)) {
        if (patch.surfaceAppearance.sampleOrigin)
          quantizePoint(patch.surfaceAppearance.sampleOrigin);
        patch.surfaceAppearance.featureSize = quantizeLength(patch.surfaceAppearance.featureSize);
        patch.surfaceAppearance.meanHeight = quantizeLength(patch.surfaceAppearance.meanHeight);
        if (patch.surfaceAppearance.etchDepth != null) {
          patch.surfaceAppearance.etchDepth = quantizeLength(patch.surfaceAppearance.etchDepth);
        }
      }
    }
  };
  for (const implant of model.implants || []) quantizeAnnotationVolume(implant);
  for (const electrical of model.electricalRegions || []) quantizeAnnotationVolume(electrical);
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

function cloneCore(value, { model = true, layout = true, snapshotBranches = true } = {}) {
  const clone = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (
      key === 'snapshots' ||
      key === 'sharedLayouts' ||
      key === 'sharedModels' ||
      key === 'sharedGeometries' ||
      key === 'sharedPolygonTemplates' ||
      key === 'sharedArrayInstances' ||
      key === 'storage'
    )
      continue;
    if (!model && key === 'model') continue;
    if (!layout && key === 'layout') continue;
    if (!snapshotBranches && key === 'snapshotBranches') continue;
    clone[key] = structuredClone(item);
  }
  return clone;
}

function cloneRecordMetadata(record, stateKey) {
  const metadata = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== stateKey) metadata[key] = structuredClone(value);
  }
  return metadata;
}

function forEachStoredGeometry(project, visit) {
  for (const model of [project.model, ...(project.sharedModels || [])].flatMap(storedModelParts)) {
    if (!isObject(model)) continue;
    visit(model, 'boundary');
    for (const region of model.regions || []) visit(region, 'geom');
    for (const annotation of [...(model.implants || []), ...(model.electricalRegions || [])]) {
      for (const patch of annotation.patches || []) visit(patch, 'geom');
    }
  }
}

function packProjectGeometry(project, { geometryTemplates = true } = {}) {
  const geometries = [];
  const candidates = new Map();
  const identities = new WeakMap();
  forEachStoredGeometry(project, (owner, key) => {
    const geometry = owner[key];
    let reference = identities.get(geometry);
    if (reference === undefined) {
      const text = JSON.stringify(geometry);
      const bucket = candidates.get(text) || [];
      reference = bucket.find((index) => deepEqual(geometries[index], geometry));
      if (reference === undefined) {
        reference = geometries.length;
        geometries.push(geometry);
        bucket.push(reference);
        candidates.set(text, bucket);
      }
      identities.set(geometry, reference);
    }
    owner[`${key}Ref`] = reference;
    delete owner[key];
  });
  project.sharedGeometries = geometries;
  return geometryTemplates && compactGeometryDictionary(project)
    ? TEMPLATE_STORAGE_ENCODING
    : STORAGE_ENCODING;
}

function packArrayAssets(project, modelAssets) {
  const instances = [],
    byContent = new Map();
  let found = false;
  // resolve() can append leaf models; array models never nest.
  for (const model of [project.model, ...modelAssets.shared]) {
    if (!isArrayModel(model)) continue;
    found = true;
    for (const t of model.array.templates) {
      t.modelRef = modelAssets.resolve(t.model);
      delete t.model;
    }
    const key = JSON.stringify(model.array.instances);
    let ref = byContent.get(key);
    if (ref === undefined) {
      ref = instances.length;
      instances.push(model.array.instances);
      byContent.set(key, ref);
    }
    model.array.instancesRef = ref;
    delete model.array.instances;
  }
  if (found) project.sharedArrayInstances = instances;
  return found;
}
function expandArrayAssets(project, sharedModels) {
  const instances = project.sharedArrayInstances || [];
  if (!Array.isArray(instances) || instances.length > 1000)
    throw new Error('Invalid shared array instance dictionary.');
  for (const model of [project.model, ...sharedModels]) {
    if (!isArrayModel(model)) continue;
    if (!model.array || !Array.isArray(model.array.templates))
      throw new Error('Invalid model array template dictionary.');
    for (const t of model.array.templates) {
      if (!isObject(t)) throw new Error('Invalid model array template.');
      if (t.model == null)
        t.model = resolveAsset(t.modelRef, project.model, sharedModels, 'array model');
      delete t.modelRef;
    }
    if (model.array.instances == null) {
      const ref = model.array.instancesRef;
      if (
        !Number.isInteger(ref) ||
        ref < 0 ||
        ref >= instances.length ||
        !Array.isArray(instances[ref])
      )
        throw new Error('Invalid array instance dictionary reference.');
      model.array.instances = instances[ref];
    }
    delete model.array.instancesRef;
  }
  delete project.sharedArrayInstances;
}

function expandProjectGeometry(project) {
  const geometries = project.sharedGeometries;
  if (!Array.isArray(geometries) || geometries.length > 250000) {
    throw new Error('Project file contains an invalid shared geometry dictionary.');
  }
  forEachStoredGeometry(project, (owner, key) => {
    if (!isObject(owner)) throw new Error('Project file contains an invalid geometry owner.');
    const referenceKey = `${key}Ref`;
    if (!Object.hasOwn(owner, referenceKey)) return;
    const reference = owner[referenceKey];
    if (
      Object.hasOwn(owner, key) ||
      !Number.isInteger(reference) ||
      reference < 0 ||
      reference >= geometries.length ||
      !Array.isArray(geometries[reference])
    ) {
      throw new Error(`Project file contains an invalid ${key} geometry reference.`);
    }
    owner[key] = geometries[reference];
    delete owner[referenceKey];
  });
  delete project.sharedGeometries;
}

function createAssetResolver(rootAsset, quantize, keyOf = () => '') {
  const shared = [];
  const sourcesByKey = new Map();
  const refsByIdentity = new WeakMap();

  const keyFor = (asset) => {
    try {
      return String(keyOf(asset) ?? '');
    } catch {
      return '';
    }
  };
  const addSource = (source, ref) => {
    const key = keyFor(source);
    const bucket = sourcesByKey.get(key) || [];
    bucket.push({ source, ref });
    sourcesByKey.set(key, bucket);
  };

  if (isObject(rootAsset)) {
    refsByIdentity.set(rootAsset, 'project');
    addSource(rootAsset, 'project');
  }

  function resolve(asset) {
    if (!isObject(asset)) throw new Error('Snapshot asset is missing.');
    const known = refsByIdentity.get(asset);
    if (known !== undefined) return known;

    const key = keyFor(asset);
    for (const entry of sourcesByKey.get(key) || []) {
      if (!deepEqual(asset, entry.source)) continue;
      refsByIdentity.set(asset, entry.ref);
      return entry.ref;
    }

    const stored = structuredClone(asset);
    quantize(stored);
    const ref = shared.length;
    shared.push(stored);
    addSource(asset, ref);
    refsByIdentity.set(asset, ref);
    return ref;
  }

  return { resolve, shared };
}

function modelAssetKey(model) {
  if (!isObject(model)) return '';
  return [
    model.kernel || '',
    Number(model.revision) || 0,
    Number(model.processRevision) || 0,
    Number(model.nextLayerId) || 0,
    Number(model.nextRegionId) || 0,
    Number(model.nextImplantId) || 0,
    Number(model.nextElectricalRegionId) || 0,
    Array.isArray(model.layers) ? model.layers.length : 0,
    Array.isArray(model.regions) ? model.regions.length : 0,
    Array.isArray(model.implants) ? model.implants.length : 0,
    Array.isArray(model.electricalRegions) ? model.electricalRegions.length : 0,
  ].join('|');
}

function packWorkspaceState(state, modelAssets, layoutAssets, { quantize = false } = {}) {
  if (!isObject(state)) return null;
  const packed = cloneCore(state, { model: false, layout: false });
  if (quantize) quantizeProjectLengths(packed);
  packed.modelRef = modelAssets.resolve(state.model);
  packed.layoutRef = layoutAssets.resolve(state.layout);
  return packed;
}

export function prepareProjectForWorkspaceStorage(project, options = {}) {
  validateProjectFile(project);

  const stored = cloneCore(project, { snapshotBranches: false });
  const layoutAssets = createAssetResolver(project.layout, () => {});
  const modelAssets = createAssetResolver(project.model, () => {}, modelAssetKey);

  if (Array.isArray(project.snapshots)) {
    stored.snapshots = project.snapshots.map((record) => {
      const state = packWorkspaceState(record.state, modelAssets, layoutAssets);
      return { ...cloneRecordMetadata(record, 'state'), state };
    });
  }

  if (isObject(project.snapshotBranches)) {
    const { nodes = [], branches = [], ...branchMetadata } = project.snapshotBranches;
    stored.snapshotBranches = structuredClone(branchMetadata);
    stored.snapshotBranches.nodes = nodes.map((node) => {
      const storedNode = cloneRecordMetadata(node, 'state');
      if (isObject(node.state)) {
        storedNode.state = packWorkspaceState(node.state, modelAssets, layoutAssets);
      }
      return storedNode;
    });
    stored.snapshotBranches.branches = branches.map((branch) => {
      const storedBranch = cloneRecordMetadata(branch, 'headState');
      if (isObject(branch.headState)) {
        storedBranch.headState = packWorkspaceState(branch.headState, modelAssets, layoutAssets);
      }
      return storedBranch;
    });
  }

  const arrayAssets = packArrayAssets(stored, modelAssets);
  if (layoutAssets.shared.length) stored.sharedLayouts = layoutAssets.shared;
  if (modelAssets.shared.length) stored.sharedModels = modelAssets.shared;
  const encoding = packProjectGeometry(stored, options);
  stored.storage = {
    encoding: arrayAssets ? ARRAY_STORAGE_ENCODING : encoding,
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
      .some(
        (point) =>
          Number(point?.[0]) !== Number(first[0]) || Number(point?.[1]) !== Number(first[1]),
      ),
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
      if (source?.kind === 'path' && Number(source.width) > 0 && !(Number(quantized?.width) > 0)) {
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

  const originalNodes = before?.snapshotBranches?.nodes || [],
    storedNodes = after?.snapshotBranches?.nodes || [];
  for (let index = 0; index < originalNodes.length; index++) {
    if (!originalNodes[index]?.state) continue;
    assertLayoutGeometryPreserved(
      originalNodes[index]?.state?.layout,
      storedNodes[index]?.state?.layout,
      `snapshotBranches.nodes[${index}].state.layout`,
    );
  }

  const originalBranches = before?.snapshotBranches?.branches || [],
    storedBranches = after?.snapshotBranches?.branches || [];
  for (let index = 0; index < originalBranches.length; index++) {
    if (!originalBranches[index]?.headState) continue;
    assertLayoutGeometryPreserved(
      originalBranches[index]?.headState?.layout,
      storedBranches[index]?.headState?.layout,
      `snapshotBranches.branches[${index}].headState.layout`,
    );
  }
}

export function prepareProjectForStorage(project) {
  validateProjectFile(project);

  const stored = cloneCore(project, { snapshotBranches: false });
  quantizeProjectLengths(stored);

  const layoutAssets = createAssetResolver(project.layout, quantizeLayout);
  const modelAssets = createAssetResolver(project.model, quantizeModel, modelAssetKey);

  if (Array.isArray(project.snapshots)) {
    stored.snapshots = project.snapshots.map((record) => {
      const state = packWorkspaceState(record.state, modelAssets, layoutAssets, { quantize: true });
      return { ...cloneRecordMetadata(record, 'state'), state };
    });
  }

  if (isObject(project.snapshotBranches)) {
    const { nodes = [], branches = [], ...branchMetadata } = project.snapshotBranches;
    stored.snapshotBranches = structuredClone(branchMetadata);
    stored.snapshotBranches.nodes = nodes.map((node) => {
      const storedNode = cloneRecordMetadata(node, 'state');
      if (isObject(node.state)) {
        storedNode.state = packWorkspaceState(node.state, modelAssets, layoutAssets, {
          quantize: true,
        });
      }
      return storedNode;
    });
    stored.snapshotBranches.branches = branches.map((branch) => {
      const storedBranch = cloneRecordMetadata(branch, 'headState');
      if (isObject(branch.headState)) {
        storedBranch.headState = packWorkspaceState(branch.headState, modelAssets, layoutAssets, {
          quantize: true,
        });
      }
      return storedBranch;
    });
  }

  const arrayAssets = packArrayAssets(stored, modelAssets);
  if (layoutAssets.shared.length) stored.sharedLayouts = layoutAssets.shared;
  if (modelAssets.shared.length) stored.sharedModels = modelAssets.shared;
  const encoding = packProjectGeometry(stored);
  stored.storage = {
    encoding: arrayAssets ? ARRAY_STORAGE_ENCODING : encoding,
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
  if (!isObject(project) || !project.storage?.encoding) return project;
  const encoding = project.storage.encoding;
  if (
    encoding !== STORAGE_ENCODING &&
    encoding !== TEMPLATE_STORAGE_ENCODING &&
    encoding !== ARRAY_STORAGE_ENCODING &&
    encoding !== LEGACY_STORAGE_ENCODING
  ) {
    throw new Error(`Project file storage encoding is not supported: ${encoding}.`);
  }
  if (
    encoding === TEMPLATE_STORAGE_ENCODING ||
    (encoding === ARRAY_STORAGE_ENCODING && project.sharedPolygonTemplates)
  )
    expandGeometryDictionary(project);
  if (
    encoding === STORAGE_ENCODING ||
    encoding === TEMPLATE_STORAGE_ENCODING ||
    encoding === ARRAY_STORAGE_ENCODING
  )
    expandProjectGeometry(project);

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

  const expandState = (state) => {
    if (!isObject(state)) return;
    if (state.layout == null && state.layoutRef != null) {
      state.layout = resolveAsset(state.layoutRef, project.layout, sharedLayouts, 'layout');
    }
    if (state.model == null && state.modelRef != null) {
      state.model = resolveAsset(state.modelRef, project.model, sharedModels, 'model');
    }
    delete state.layoutRef;
    delete state.modelRef;
  };

  for (const node of project.snapshotBranches?.nodes || []) expandState(node?.state);
  for (const branch of project.snapshotBranches?.branches || []) expandState(branch?.headState);

  if (encoding === ARRAY_STORAGE_ENCODING) expandArrayAssets(project, sharedModels);
  delete project.sharedLayouts;
  delete project.sharedModels;
  delete project.storage;
  return project;
}

// Compact storage remains strict: it must reject geometries whose physical
// meaning changes on the 0.1 nm persistence grid. Export can instead preserve
// the exact, already-validated canonical model in the supported lossless codec.
export function prepareProjectForExport(project) {
  try {
    return { stored: prepareProjectForStorage(project), mode: 'compact' };
  } catch (error) {
    if (!/^Project cannot be stored safely at .* precision:/.test(String(error?.message || ''))) {
      throw error;
    }
    return { stored: prepareProjectForWorkspaceStorage(project), mode: 'lossless' };
  }
}

function serializedProject(project, maxBytes, { allowLosslessFallback = false } = {}) {
  const result = allowLosslessFallback
    ? prepareProjectForExport(project)
    : { stored: prepareProjectForStorage(project), mode: 'compact' };
  const text = JSON.stringify(result.stored);
  const blob = new Blob([text], { type: 'application/json' });
  if (blob.size > maxBytes) {
    throw new Error(
      `Project file would be larger than the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`,
    );
  }
  return { text, blob, mode: result.mode };
}

export function serializeProject(project, maxBytes = MAX_PROJECT_FILE_BYTES) {
  return serializedProject(project, maxBytes).text;
}

export function downloadProject(project, filename = 'wafercad-project.wafercad') {
  const { blob, mode } = serializedProject(project, MAX_PROJECT_FILE_BYTES, {
    allowLosslessFallback: true,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking synchronously can invalidate the Blob URL before the browser has
  // actually started consuming it. Keep it alive long enough for the download
  // handoff, then release it to avoid leaking object URLs.
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);

  return { requested: true, filename, bytes: blob.size, mode };
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
