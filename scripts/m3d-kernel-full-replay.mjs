import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

await loadGeometryKernel();

const { applyOperation, createModel } = await import('../site/model.js');
const { drawMaskGeometry } = await import('../site/draw-mask-geometry.js');
const {
  difference,
  pointInMulti,
  rectMulti,
  unionGeometries,
} = await import('../site/vector-geometry.js');
const {
  prepareProjectForWorkspaceStorage,
  readProjectFile,
  serializeProject,
} = await import('../site/project-io.js');
const {
  validateProcessModel,
  validateProjectFile,
} = await import('../site/project-schema.js');

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateDir = join(repoRoot, 'examples/projects/m3d-selfpowered-2026-candidate');
const outputDir = join(repoRoot, 'examples/projects/m3d-selfpowered-2026-replay');
const artifactDir = join(repoRoot, 'test-results/m3d/kernel-full-replay');
await mkdir(artifactDir, { recursive: true });
if (process.argv.includes('--write-repo')) await mkdir(outputDir, { recursive: true });

const copy = (value) => structuredClone(value);

function svgRects(svg) {
  return [...svg.matchAll(/<rect\s([^>]+)>?/g)].map((match) => {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]),
    );
    return {
      x: Number(attrs.x),
      y: Number(attrs.y),
      w: Number(attrs.width),
      h: Number(attrs.height),
    };
  });
}

function translatedRects(rects, dx, dy) {
  return rects.map((rect) => ({
    x: rect.x + dx,
    y: rect.y + dy,
    w: rect.w,
    h: rect.h,
  }));
}

function rectShapes(rects) {
  return rects.map((rect, index) => ({
    id: 'shape-' + (index + 1),
    type: 'rect',
    a: [rect.x, rect.y],
    b: [rect.x + rect.w, rect.y + rect.h],
  }));
}

function draw(shapes) {
  return {
    nextShapeId: shapes.length + 1,
    shapes: copy(shapes),
  };
}

function geomFromRects(rects) {
  return unionGeometries(
    rects.map((rect) =>
      rectMulti(rect.w, rect.h, rect.x + rect.w / 2, rect.y + rect.h / 2),
    ),
  );
}

function ringArea(ring) {
  let area = 0;
  for (let i = 1; i < (ring || []).length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function geomArea(geom) {
  let area = 0;
  for (const polygon of geom || []) {
    if (!polygon.length) continue;
    area += Math.abs(ringArea(polygon[0]));
    for (const hole of polygon.slice(1)) area -= Math.abs(ringArea(hole));
  }
  return Math.max(0, area);
}

function layerVolumes(model) {
  const out = new Map(model.layers.map((layer) => [layer.id, 0]));
  for (const region of model.regions) {
    const area = geomArea(region.geom);
    for (const segment of region.stack) {
      out.set(
        segment.layerId,
        (out.get(segment.layerId) || 0) + area * Math.max(0, segment.z1 - segment.z0),
      );
    }
  }
  return out;
}

const maskFiles = [
  'PVM_M01_Si_channel_etch.svg',
  'PVM_M02_Cr_contact.svg',
  'PVM_M03_Pt_contact.svg',
  'M3D_M04_power_rail.svg',
  'M3D_M05_power_via_open_ILD1.svg',
  'M3D_M06_local_back_gate.svg',
  'M3D_M07_HfO2_open.svg',
  'M3D_M08_WSe2_channel.svg',
  'M3D_M09_WSe2_SD.svg',
  'M3D_M10_WSe2_cap.svg',
  'M3D_M11_MoS2_channel.svg',
  'M3D_M12_MoS2_SD_bridge.svg',
  'M3D_M13_ILD2_data_power_via_open.svg',
  'M3D_M14_graphene_channel.svg',
  'M3D_M15_graphene_SD_via_connect.svg',
  'M3D_M16_final_cap_open_sensing_windows.svg',
];

const masks = new Map();
for (const file of maskFiles) {
  const svg = await readFile(join(candidateDir, 'masks', file), 'utf8');
  const raw = svgRects(svg);
  const pvm = file.startsWith('PVM_');
  const rects = translatedRects(raw, pvm ? -30 : 2, pvm ? -15 : -9);
  masks.set(file, {
    rects,
    shapes: rectShapes(rects),
    geom: geomFromRects(rects),
  });
}

const m3dFieldShapes = rectShapes([{ x: 2, y: -9, w: 28, h: 18 }]);

function mask(file) {
  const item = masks.get(file);
  assert.ok(item, 'Missing mask ' + file);
  return item;
}

function targetLayer(model, name) {
  const layer = model.layers.find((item) => item.name === name);
  assert.ok(layer, 'Missing target layer ' + name);
  return layer;
}

function stateTemplate(model) {
  const project = projectForBenchmark({
    model,
    section: { a: [2, 0], b: [30, 0] },
  });
  project.name = 'M3D self-powered heterogeneous IC · kernel full replay';
  project.maskSourceMode = 'draw';
  project.drawMask = draw([]);
  return project;
}

const model = createModel({
  shape: 'rect',
  width: 60,
  height: 30,
  thickness: 2,
});
model.layers[0].name = 'SOI BOX SiO2 2um · handle omitted';
model.revision += 1;
model.processRevision += 1;

const root = stateTemplate(model);
const nodes = [];
const snapshots = [];
const branch = {
  id: 'main',
  name: 'M3D self-powered IC · S00-S26 kernel replay',
  parentBranchId: null,
  rootNodeId: null,
  headNodeId: null,
  rootSnapshotId: null,
  headSnapshotId: null,
  createdAt: '2026-10-08T09:30:00.000Z',
  headState: null,
};
let parentNodeId = null;
let clock = 0;
let currentShapes = [];
let currentSection = { a: [2, 0], b: [30, 0] };

function stamp() {
  clock += 1;
  return new Date(Date.UTC(2026, 9, 8, 9, 30, clock)).toISOString();
}

function captureState() {
  const value = copy(root);
  delete value.snapshots;
  delete value.snapshotBranches;
  value.model = copy(model);
  value.drawMask = draw(currentShapes);
  value.section = copy(currentSection);
  return value;
}

function appendNode(operation) {
  const id = 'm3d-step-' + String(nodes.length + 1).padStart(2, '0');
  const node = {
    id,
    branchId: branch.id,
    parentId: parentNodeId,
    createdAt: stamp(),
    processRevision: model.processRevision,
    operation,
    state: captureState(),
  };
  nodes.push(node);
  parentNodeId = id;
  if (!branch.rootNodeId) branch.rootNodeId = id;
  branch.headNodeId = id;
  branch.headState = copy(node.state);
  return node;
}

function addBookmark(name) {
  const node = nodes.at(-1);
  assert.ok(node, 'Cannot bookmark without a process node');
  const snapshot = {
    id: 'm3d-bookmark-' + String(snapshots.length + 1).padStart(2, '0'),
    name,
    createdAt: stamp(),
    branchId: branch.id,
    parentId: branch.headSnapshotId,
    historyNodeId: node.id,
    state: copy(node.state),
  };
  snapshots.unshift(snapshot);
  if (!branch.rootSnapshotId) branch.rootSnapshotId = snapshot.id;
  branch.headSnapshotId = snapshot.id;
  return snapshot;
}

function areaFor(mode, shapes) {
  if (mode === 'full') return model.boundary;
  const selected = drawMaskGeometry(draw(shapes));
  assert.ok(selected.length, 'Masked operation has empty geometry');
  return mode === 'invert' ? difference(model.boundary, selected) : selected;
}

const timings = [];
const stages = [];

function applyStep(stage, spec) {
  currentShapes = copy(spec.shapes || []);
  currentSection = copy(spec.section || currentSection);
  const params = {
    type: spec.type,
    face: 'front',
  };

  if (spec.type === 'add') {
    Object.assign(params, {
      name: spec.name,
      thickness: spec.thickness,
      growth: spec.growth || 'direct',
    });
    if (spec.growth === 'transfer') params.transferMode = spec.transferMode || 'follow';
  } else if (spec.type === 'etch') {
    const target = targetLayer(model, spec.target);
    Object.assign(params, {
      thickness: spec.thickness,
      etchProfile: 'directional',
      etchTargetLayerIds: [target.id],
    });
  } else {
    throw new Error('Unsupported geometry step type ' + spec.type);
  }

  const mode = spec.area || 'full';
  const started = performance.now();
  const result = applyOperation(model, {
    ...params,
    area: areaFor(mode, currentShapes),
  });
  const ms = performance.now() - started;
  assert.equal(result.changed, true, stage + ' · ' + spec.label + ': ' + (result.error || 'no geometry change'));
  validateProcessModel(model);

  const replay = {
    version: 1,
    params: copy(params),
    areaMode: mode,
    maskContext: {
      sourceMode: 'draw',
      layerKeys: [],
      roi: null,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      drawMask: draw(currentShapes),
    },
  };
  const operation = {
    kind: spec.type,
    label: spec.label,
    face: 'front',
    areaMode: mode,
    geometryChanged: true,
    ...(spec.type === 'add'
      ? {
          name: spec.name,
          thickness: spec.thickness,
          growth: spec.growth || 'direct',
          resultLayerId: result.layerId,
        }
      : {
          thickness: spec.thickness,
          targetLayerIds: copy(params.etchTargetLayerIds),
        }),
    replay,
  };
  appendNode(operation);
  timings.push({ stage, label: spec.label, ms });
  return result;
}

function recordStep(stage, label, detail) {
  model.revision += 1;
  model.processRevision += 1;
  validateProcessModel(model);
  appendNode({
    kind: 'record',
    label,
    processType: detail.processType || 'custom',
    geometryChanged: false,
    temperatureC: detail.temperatureC ?? null,
    durationMin: detail.durationMin ?? null,
    ambient: detail.ambient ?? null,
    note: detail.note ?? null,
    replay: { version: 1, kind: 'record' },
  });
  timings.push({ stage, label, ms: 0 });
}

function closeStage(name) {
  addBookmark(name);
  stages.push({
    name,
    processRevision: model.processRevision,
    regions: model.regions.length,
    layers: model.layers.length,
  });
}

function assertTransferZeroGap(layerName) {
  const layer = targetLayer(model, layerName);
  let count = 0;
  for (const region of model.regions) {
    const index = region.stack.findIndex((segment) => segment.layerId === layer.id);
    if (index < 0) continue;
    count += 1;
    assert.ok(index > 0, layerName + ' has an unsupported transfer segment');
    const film = region.stack[index];
    const below = region.stack[index - 1];
    assert.ok(
      Math.abs(film.z0 - below.z1) <= 1e-7,
      layerName + ' support gap is ' + String(film.z0 - below.z1) + ' um',
    );
  }
  assert.ok(count > 0, layerName + ' produced no transferred film');
}

appendNode({
  kind: 'base',
  label: 'Create 2 um BOX receiver; SOI handle omitted because paper does not specify handle thickness',
  geometryChanged: true,
  replay: { version: 1, kind: 'base' },
});
applyStep('00_SOI', {
  type: 'add',
  label: 'Add 70 nm B-doped SOI device Si',
  name: 'SOI B-doped Si 70nm',
  thickness: 0.07,
  growth: 'direct',
  area: 'full',
});
closeStage('00_SOI');

applyStep('01_PVM_Si', {
  type: 'etch',
  label: 'Etch PVM Si frame; retain 20 x 20 um active island',
  target: 'SOI B-doped Si 70nm',
  thickness: 0.07,
  area: 'mask',
  shapes: mask('PVM_M01_Si_channel_etch.svg').shapes,
  section: { a: [-30, 0], b: [0, 0] },
});
closeStage('01_PVM_Si');

for (const spec of [
  {
    type: 'add',
    label: 'Deposit PVM Cr 20 nm',
    name: 'PVM Cr contact 20nm',
    thickness: 0.02,
    growth: 'direct',
  },
  {
    type: 'add',
    label: 'Deposit PVM Au 50 nm',
    name: 'PVM Au contact 50nm',
    thickness: 0.05,
    growth: 'direct',
  },
]) {
  applyStep('02_PVM_Cr', {
    ...spec,
    area: 'mask',
    shapes: mask('PVM_M02_Cr_contact.svg').shapes,
    section: { a: [-30, 0], b: [0, 0] },
  });
}
closeStage('02_PVM_Cr');

applyStep('03_PVM_Pt', {
  type: 'add',
  label: 'Deposit PVM Pt contact/interconnect 80 nm',
  name: 'PVM Pt contact 80nm',
  thickness: 0.08,
  growth: 'direct',
  area: 'mask',
  shapes: mask('PVM_M03_Pt_contact.svg').shapes,
  section: { a: [-30, 0], b: [0, 0] },
});
closeStage('03_PVM_Pt');

applyStep('04_Power_Rails', {
  type: 'add',
  label: 'Deposit tier-1 Pt power rails 70 nm',
  name: 'M3D Pt power rails 70nm',
  thickness: 0.07,
  growth: 'direct',
  area: 'mask',
  shapes: mask('M3D_M04_power_rail.svg').shapes,
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('04_Power_Rails');

applyStep('05_ILD1', {
  type: 'add',
  label: 'Deposit conformal ILD1 Al2O3 100 nm',
  name: 'M3D ILD1 Al2O3 100nm',
  thickness: 0.1,
  growth: 'conformal',
  area: 'full',
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('05_ILD1');

applyStep('06_Power_Via_Open', {
  type: 'etch',
  label: 'Open 5 x 5 um tier-1 power vias in ILD1',
  target: 'M3D ILD1 Al2O3 100nm',
  thickness: 0.1,
  area: 'mask',
  shapes: mask('M3D_M05_power_via_open_ILD1.svg').shapes,
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('06_Power_Via_Open');

applyStep('07_Power_Via_Fill', {
  type: 'add',
  label: 'Fill tier-1 power vias with Ti 120 nm',
  name: 'M3D Ti power via 120nm',
  thickness: 0.12,
  growth: 'direct',
  area: 'mask',
  shapes: mask('M3D_M05_power_via_open_ILD1.svg').shapes,
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('07_Power_Via_Fill');

for (const spec of [
  {
    label: 'Deposit local back-gate Ti 2 nm',
    name: 'M3D back gate Ti 2nm',
    thickness: 0.002,
  },
  {
    label: 'Deposit local back-gate Pt 18 nm',
    name: 'M3D back gate Pt 18nm',
    thickness: 0.018,
  },
]) {
  applyStep('08_Back_Gates', {
    type: 'add',
    ...spec,
    growth: 'direct',
    area: 'mask',
    shapes: mask('M3D_M06_local_back_gate.svg').shapes,
    section: { a: [2, 2.65], b: [30, 2.65] },
  });
}
closeStage('08_Back_Gates');

applyStep('09_HfO2', {
  type: 'add',
  label: 'Deposit conformal HfO2 gate dielectric 10 nm',
  name: 'M3D HfO2 gate dielectric 10nm',
  thickness: 0.01,
  growth: 'conformal',
  area: 'full',
  section: { a: [2, 2.65], b: [30, 2.65] },
});
closeStage('09_HfO2');

applyStep('10_HfO2_Open', {
  type: 'etch',
  label: 'Open HfO2 gate/contact windows',
  target: 'M3D HfO2 gate dielectric 10nm',
  thickness: 0.01,
  area: 'mask',
  shapes: mask('M3D_M07_HfO2_open.svg').shapes,
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('10_HfO2_Open');

applyStep('11_WSe2_Transfer', {
  type: 'add',
  label: 'Transfer bilayer WSe2 using Follow surface',
  name: 'M3D WSe2 transfer surrogate 0.7nm',
  thickness: 0.0007,
  growth: 'transfer',
  transferMode: 'follow',
  area: 'mask',
  shapes: m3dFieldShapes,
  section: { a: [2, 2.65], b: [30, 2.65] },
});
assertTransferZeroGap('M3D WSe2 transfer surrogate 0.7nm');
closeStage('11_WSe2_Transfer');

applyStep('12_WSe2_Pattern', {
  type: 'etch',
  label: 'Pattern WSe2 to 0.2 x 0.5 um channels',
  target: 'M3D WSe2 transfer surrogate 0.7nm',
  thickness: 0.0007,
  area: 'invert',
  shapes: mask('M3D_M08_WSe2_channel.svg').shapes,
  section: { a: [2, 2.65], b: [30, 2.65] },
});
closeStage('12_WSe2_Pattern');

for (const spec of [
  {
    label: 'Deposit WSe2 source/drain Pd 10 nm',
    name: 'M3D WSe2 SD Pd 10nm',
    thickness: 0.01,
  },
  {
    label: 'Deposit WSe2 source/drain Pt 30 nm',
    name: 'M3D WSe2 SD Pt 30nm',
    thickness: 0.03,
  },
]) {
  applyStep('13_WSe2_SD', {
    type: 'add',
    ...spec,
    growth: 'direct',
    area: 'mask',
    shapes: mask('M3D_M09_WSe2_SD.svg').shapes,
    section: { a: [2, 2.65], b: [30, 2.65] },
  });
}
closeStage('13_WSe2_SD');

recordStep('14_WSe2_Anneal', 'WSe2 NO anneal 100 C x 30 min', {
  processType: 'anneal',
  temperatureC: 100,
  durationMin: 30,
  ambient: 'NO',
  note: 'Record-only process metadata from the paper.',
});
closeStage('14_WSe2_Anneal');

applyStep('15_WSe2_Cap', {
  type: 'add',
  label: 'Deposit local WSe2 Al2O3 cap 20 nm',
  name: 'M3D WSe2 Al2O3 cap 20nm',
  thickness: 0.02,
  growth: 'conformal',
  area: 'mask',
  shapes: mask('M3D_M10_WSe2_cap.svg').shapes,
  section: { a: [2, 2.65], b: [30, 2.65] },
});
closeStage('15_WSe2_Cap');

applyStep('16_MoS2_Transfer', {
  type: 'add',
  label: 'Transfer monolayer MoS2 using Follow surface',
  name: 'M3D MoS2 monolayer 0.7nm',
  thickness: 0.0007,
  growth: 'transfer',
  transferMode: 'follow',
  area: 'mask',
  shapes: m3dFieldShapes,
  section: { a: [2, -2.45], b: [30, -2.45] },
});
assertTransferZeroGap('M3D MoS2 monolayer 0.7nm');
closeStage('16_MoS2_Transfer');

applyStep('17_MoS2_Pattern', {
  type: 'etch',
  label: 'Pattern MoS2 to 0.2 x 0.5 um channels',
  target: 'M3D MoS2 monolayer 0.7nm',
  thickness: 0.0007,
  area: 'invert',
  shapes: mask('M3D_M11_MoS2_channel.svg').shapes,
  section: { a: [2, -2.45], b: [30, -2.45] },
});
closeStage('17_MoS2_Pattern');

for (const spec of [
  {
    label: 'Deposit MoS2 source/drain and comparator bridge Ni 30 nm',
    name: 'M3D MoS2 bridge Ni 30nm',
    thickness: 0.03,
  },
  {
    label: 'Deposit MoS2 source/drain and comparator bridge Au 10 nm',
    name: 'M3D MoS2 bridge Au 10nm',
    thickness: 0.01,
  },
]) {
  applyStep('18_MoS2_SD_Bridge', {
    type: 'add',
    ...spec,
    growth: 'direct',
    area: 'mask',
    shapes: mask('M3D_M12_MoS2_SD_bridge.svg').shapes,
    section: { a: [16, -9], b: [16, 9] },
  });
}
closeStage('18_MoS2_SD_Bridge');

applyStep('19_ILD2', {
  type: 'add',
  label: 'Deposit conformal ILD2 Al2O3 50 nm',
  name: 'M3D ILD2 Al2O3 50nm',
  thickness: 0.05,
  growth: 'conformal',
  area: 'full',
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('19_ILD2');

applyStep('20_Data_Power_Via_Open', {
  type: 'etch',
  label: 'Open tier-3 data/power vias in ILD2',
  target: 'M3D ILD2 Al2O3 50nm',
  thickness: 0.05,
  area: 'mask',
  shapes: mask('M3D_M13_ILD2_data_power_via_open.svg').shapes,
  section: { a: [16, -9], b: [16, 9] },
});
closeStage('20_Data_Power_Via_Open');

for (const spec of [
  { label: 'Deposit via2 Ti 2 nm', name: 'M3D via2 Ti 2nm', thickness: 0.002 },
  { label: 'Deposit via2 Ni 28 nm', name: 'M3D via2 Ni 28nm', thickness: 0.028 },
  { label: 'Deposit via2 Au 30 nm', name: 'M3D via2 Au 30nm', thickness: 0.03 },
]) {
  applyStep('21_Via2_Fill', {
    type: 'add',
    ...spec,
    growth: 'direct',
    area: 'mask',
    shapes: mask('M3D_M13_ILD2_data_power_via_open.svg').shapes,
    section: { a: [16, -9], b: [16, 9] },
  });
}
closeStage('21_Via2_Fill');

applyStep('22_Graphene_Transfer', {
  type: 'add',
  label: 'Transfer graphene using Follow surface',
  name: 'M3D graphene monolayer 0.35nm',
  thickness: 0.00035,
  growth: 'transfer',
  transferMode: 'follow',
  area: 'mask',
  shapes: m3dFieldShapes,
  section: { a: [2, -0.125], b: [30, -0.125] },
});
assertTransferZeroGap('M3D graphene monolayer 0.35nm');
closeStage('22_Graphene_Transfer');

applyStep('23_Graphene_Pattern', {
  type: 'etch',
  label: 'Pattern graphene sensing channels',
  target: 'M3D graphene monolayer 0.35nm',
  thickness: 0.00035,
  area: 'invert',
  shapes: mask('M3D_M14_graphene_channel.svg').shapes,
  section: { a: [2, -0.125], b: [30, -0.125] },
});
closeStage('23_Graphene_Pattern');

for (const spec of [
  { label: 'Deposit graphene contact Ti 2 nm', name: 'M3D graphene SD Ti 2nm', thickness: 0.002 },
  { label: 'Deposit graphene contact Ni 28 nm', name: 'M3D graphene SD Ni 28nm', thickness: 0.028 },
  { label: 'Deposit graphene contact Au 30 nm', name: 'M3D graphene SD Au 30nm', thickness: 0.03 },
]) {
  applyStep('24_Graphene_SD', {
    type: 'add',
    ...spec,
    growth: 'direct',
    area: 'mask',
    shapes: mask('M3D_M15_graphene_SD_via_connect.svg').shapes,
    section: { a: [2, -0.125], b: [30, -0.125] },
  });
}
closeStage('24_Graphene_SD');

const s25Start = performance.now();
applyStep('25_Final_Al2O3', {
  type: 'add',
  label: 'Deposit final conformal Al2O3 70 nm',
  name: 'M3D final Al2O3 70nm',
  thickness: 0.07,
  growth: 'conformal',
  area: 'full',
  section: { a: [2, -0.125], b: [30, -0.125] },
});
const s25Ms = performance.now() - s25Start;
closeStage('25_Final_Al2O3');

const beforeS26Volumes = layerVolumes(model);

applyStep('26_Final_Sensing_Windows', {
  type: 'etch',
  label: 'Open graphene sensing windows in final Al2O3 only',
  target: 'M3D final Al2O3 70nm',
  thickness: 0.07,
  area: 'mask',
  shapes: mask('M3D_M16_final_cap_open_sensing_windows.svg').shapes,
  section: { a: [2, -0.125], b: [30, -0.125] },
});
closeStage('26_Final_Sensing_Windows');

const afterS26Volumes = layerVolumes(model);
const finalCap = targetLayer(model, 'M3D final Al2O3 70nm');
const graphene = targetLayer(model, 'M3D graphene monolayer 0.35nm');
assert.ok(
  (afterS26Volumes.get(finalCap.id) || 0) < (beforeS26Volumes.get(finalCap.id) || 0),
  'S26 did not remove final Al2O3 volume',
);
for (const layer of model.layers) {
  if (layer.id === finalCap.id) continue;
  const before = beforeS26Volumes.get(layer.id) || 0;
  const after = afterS26Volumes.get(layer.id) || 0;
  // Selective etch can repartition shared XY ownership on the 0.1 nm process
  // grid without physically removing another material. Accept only a
  // sub-persistence numerical volume drift.
  const tolerance = Math.max(1e-8, Math.abs(before) * 1e-9);
  assert.ok(
    Math.abs(after - before) <= tolerance,
    'S26 altered non-target layer ' + layer.name + ': ' + before + ' -> ' + after,
  );
}

const windowRects = mask('M3D_M16_final_cap_open_sensing_windows.svg').rects;
const grapheneRects = mask('M3D_M14_graphene_channel.svg').rects;
let sensingChecks = 0;
for (const a of windowRects) {
  for (const b of grapheneRects) {
    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    if (!(x1 > x0 && y1 > y0)) continue;
    const point = [(x0 + x1) / 2, (y0 + y1) / 2];
    const region = model.regions.find((item) => pointInMulti(point, item.geom));
    assert.ok(region, 'No region at sensing point ' + JSON.stringify(point));
    assert.ok(
      !region.stack.some((segment) => segment.layerId === finalCap.id),
      'Final Al2O3 remains at sensing point ' + JSON.stringify(point),
    );
    assert.ok(
      region.stack.some((segment) => segment.layerId === graphene.id),
      'Graphene missing at sensing point ' + JSON.stringify(point),
    );
    sensingChecks += 1;
  }
}
assert.ok(sensingChecks >= 2, 'Expected at least two graphene sensing-window checks');

Object.assign(root, captureState());
root.name = 'M3D self-powered heterogeneous IC · corrected kernel replay S00-S26';
root.snapshotBranches = {
  version: 3,
  activeBranchId: branch.id,
  cursorNodeId: branch.headNodeId,
  cursorSnapshotId: branch.headSnapshotId,
  nodes,
  branches: [branch],
};
root.snapshots = snapshots;
validateProjectFile(root);

let compactExportError = null;
try {
  serializeProject(root);
} catch (error) {
  compactExportError = error?.message || String(error);
}

const losslessStored = prepareProjectForWorkspaceStorage(root);
const finalText = JSON.stringify(losslessStored);
const reopened = await readProjectFile({
  size: Buffer.byteLength(finalText),
  text: async () => finalText,
});
validateProjectFile(reopened);
assert.deepEqual(reopened.model, root.model, 'Lossless round-trip model changed');
assert.equal(reopened.snapshots.length, 27, 'Expected 27 named stage bookmarks');
assert.equal(reopened.snapshotBranches.nodes.length, nodes.length, 'History node count changed');

const validation = {
  pass: true,
  branch: 'test/m3d-full-replay-20261008',
  source: 'Nature Electronics 9 (2026) 775-787 paper reconstruction; not author GDS',
  modelFieldUm: [60, 30],
  pvmFieldUm: [30, 30],
  m3dRepresentativeFieldUm: [28, 18],
  processNodes: nodes.length,
  bookmarks: snapshots.length,
  stages,
  checks: {
    correctedMasks: true,
    transferFollowSurfaceZeroGap: {
      WSe2: true,
      MoS2: true,
      graphene: true,
    },
    finalConformalAl2O3: true,
    finalConformalMs: s25Ms,
    sensingWindowsChecked: sensingChecks,
    sensingWindowEtchSelectiveToFinalAl2O3: true,
    graphenePreservedAtSensingWindows: true,
    losslessProjectRoundTripExactModel: true,
    compactExportPass: compactExportError == null,
    compactExportError,
  },
  notes: [
    'SOI handle thickness is not specified by the paper and is omitted; the 2 um BOX is used as the receiver base.',
    '2D-material geometric thicknesses are WaferCAD visualization surrogates because the paper specifies layer count rather than a modeled thickness.',
    'The corrected v2 routing masks are paper-inferred reconstruction geometry, not the authors original GDS.',
  ],
  timings,
};

const audit =
  '# M3D corrected kernel full replay - 2026-10-08\n\n' +
  'Base: fix/photodetector-reconstruction-v2\n\n' +
  'Replay branch: test/m3d-full-replay-20261008\n\n' +
  'The project was rebuilt directly through the current Process Geometry Kernel from S00 through S26 using the committed corrected v2 masks. The browser Process UI is not part of this reconstruction path.\n\n' +
  'Acceptance results:\n\n' +
  '- 27 named stage bookmarks from 00_SOI through 26_Final_Sensing_Windows.\n' +
  '- WSe2, MoS2 and graphene Follow-surface transfers have zero canonical support gap.\n' +
  '- S25 70 nm conformal Al2O3 completed successfully.\n' +
  '- S26 removes only the final Al2O3 layer; all non-target layer volumes are unchanged within numeric tolerance.\n' +
  '- Graphene remains present at every sampled sensing-window overlap.\n' +
  '- Lossless WaferCAD project storage reopens with exact canonical-model equality.\n' +
  (compactExportError
    ? '- Compact 0.1 nm export is still blocked by a persistence-grid geometry issue: ' + compactExportError + '\n\n'
    : '- Compact 0.1 nm export also passes.\n\n') +
  'Scientific boundary: the mask package is a paper-derived reconstruction. Exact unpublished routing polygons are not claimed to be the authors original layout.\n';

await writeFile(join(artifactDir, 'M3D_selfpowered_full_replay.wafercad'), finalText);
await writeFile(join(artifactDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await writeFile(join(artifactDir, 'AUDIT.md'), audit);

if (process.argv.includes('--write-repo')) {
  await writeFile(join(outputDir, 'M3D_selfpowered_full_replay.wafercad'), finalText);
  await writeFile(join(outputDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  await writeFile(join(outputDir, 'AUDIT.md'), audit);
}

console.log(
  JSON.stringify({
    pass: true,
    processNodes: nodes.length,
    bookmarks: snapshots.length,
    s25Ms,
    sensingChecks,
    outputBytes: Buffer.byteLength(finalText),
  }),
);
