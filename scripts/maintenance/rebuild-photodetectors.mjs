// Reconstruct both detector papers through the current Process Geometry Kernel.
// Usage: node scripts/maintenance/rebuild-photodetectors.mjs --write
// Without --write the script verifies that the committed asset is reproducible.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation } = await import('../../site/model.js');
const { drawMaskGeometry } = await import('../../site/draw-mask-geometry.js');
const { difference } = await import('../../site/vector-geometry.js');
const { normalizeProcessRecipe } = await import('../../site/process-recipe.js');
const { expandProjectStorage, prepareProjectForWorkspaceStorage, readProjectFile } =
  await import('../../site/project-io.js');
const { validateProjectFile } = await import('../../site/project-schema.js');

const target = new URL('../../site/examples/photodetector-literature-examples.wafercad', import.meta.url);
const legacy = expandProjectStorage(JSON.parse(await readFile(target, 'utf8')));
const copy = (value) => structuredClone(value);
const root = copy(legacy);
for (const key of ['snapshots', 'snapshotBranches', 'sharedModels', 'sharedGeometries',
  'sharedLayouts', 'sharedPolygonTemplates', 'sharedArrayInstances', 'storage']) delete root[key];
root.name = 'Photodetectors · Black-Si 2023 / Ge 2025 · kernel reconstruction';
root.maskSourceMode = 'draw';
root.selectedLayerKeys = [];
root.activeCell = null;
root.roi = null;
root.maskRoi = null;
root.display.sectionCollapse = null;

const circle = (r) => ({ type: 'circle', c: [0, 0], r });
const ring = (innerR, outerR) => ({ type: 'ring', c: [0, 0], innerR, outerR });
const masks = {
  activeOpening: [circle(2600)],
  blackSi: [circle(2500)],
  anode: [ring(2500, 2600)],
  guard: [ring(3000, 3100)],
  contacts: [ring(2500, 2600), ring(3000, 3100)],
  frontImplant: [circle(2600), ring(3000, 3100)],
  inactiveExcluded: [circle(2500), ring(2500, 2600), ring(3000, 3100)],
};
function draw(shapes = []) {
  return { nextShapeId: shapes.length + 1, shapes: shapes.map((item, i) => ({ id: 'shape-' + (i + 1), ...item })) };
}
function regionArea(model, area, shapes) {
  if (area === 'full') return model.boundary;
  assert.ok(shapes?.length, 'Masked operation requires explicit shapes');
  const selected = drawMaskGeometry(draw(shapes));
  return area === 'invert' ? difference(model.boundary, selected) : selected;
}
function makeBase(material, thickness) {
  const model = createModel({ shape: 'rect', width: 7000, height: 7000, thickness });
  model.layers[0].name = material;
  return model;
}
function state(model, shapes, face, recipe) {
  const value = copy(root);
  value.model = copy(model);
  value.drawMask = draw(shapes);
  value.activeFace = face;
  value.processRecipe = normalizeProcessRecipe(recipe);
  return value;
}
const nodes = [];
const snapshots = [];
const branches = [];
const branchData = new Map();
let clock = 0;
function date() {
  clock += 1;
  return new Date(Date.UTC(2026, 9, 8, 9, 0, clock)).toISOString();
}
function branch(id, name, parentId, parentNodeId, initialModel, recipeName) {
  const info = {
    id, name, parentBranchId: parentId, rootNodeId: parentNodeId,
    headNodeId: parentNodeId, rootSnapshotId: null, headSnapshotId: null,
    createdAt: date(), headState: null,
  };
  const current = {
    info, model: copy(initialModel), parentNodeId, face: 'front', shapes: [],
    recipe: { version: 1, name: recipeName, steps: [], activeStepId: null },
  };
  branches.push(info);
  branchData.set(id, current);
  return current;
}
function commit(current, operation, { shapes = current.shapes, face = current.face, bookmark = false } = {}) {
  const id = current.info.id + '-step-' + String(nodes.filter((item) => item.branchId === current.info.id).length + 1).padStart(2, '0');
  current.face = face;
  current.shapes = shapes;
  const currentState = state(current.model, shapes, face, current.recipe);
  const node = {
    id, branchId: current.info.id, parentId: current.parentNodeId,
    createdAt: date(), processRevision: current.model.processRevision,
    operation, state: currentState,
  };
  nodes.push(node);
  current.parentNodeId = id;
  current.info.headNodeId = id;
  if (!current.info.rootNodeId) current.info.rootNodeId = id;
  current.info.headState = copy(currentState);
  if (bookmark) {
    const snapshot = {
      id: 'bookmark-' + id, name: operation.label, createdAt: date(),
      branchId: current.info.id, parentId: current.info.headSnapshotId,
      historyNodeId: id, state: copy(currentState),
    };
    // SnapshotManager displays newest bookmarks first; preserve that file contract.
    snapshots.unshift(snapshot);
    if (!current.info.rootSnapshotId) current.info.rootSnapshotId = snapshot.id;
    current.info.headSnapshotId = snapshot.id;
  }
  return node;
}
function step(current, spec) {
  const { type, name, thickness, face = 'front', area = 'full',
    shapes = [], growth = 'direct', targets = [], surface = null,
    electricalRegionType, electricalRegionSource, bookmark = false,
    recipeName, tilt = 0 } = spec;
  const params = {
    type, name, thickness, face, growth,
    ...(type === 'etch' ? { etchProfile: 'directional', etchTargetLayerIds: targets.map((target) => {
      const layer = current.model.layers.find((item) => item.name === target);
      assert.ok(layer, 'Cannot find target ' + target);
      return layer.id;
    }), surface } : {}),
    ...(type === 'implant' ? { tilt } : {}),
    ...(type === 'electrical' ? { electricalRegionType, electricalRegionSource } : {}),
  };
  const result = applyOperation(current.model, { ...params, area: regionArea(current.model, area, shapes) });
  assert.equal(result.changed, true, (recipeName || name) + ': ' + (result.error || 'no geometry change'));
  const mask = { sourceMode: 'draw', layerKeys: [], roi: null,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 }, drawMask: draw(shapes) };
  const recipeParams = { face, area, ...(area === 'full' ? {} : { mask }) };
  let command;
  if (type === 'add') {
    command = 'deposit';
    Object.assign(recipeParams, { material: name, thicknessUm: thickness, coverage: growth });
  } else if (type === 'etch') {
    command = 'etch';
    Object.assign(recipeParams, {
      target: targets[0] || '', thicknessUm: thickness, profile: 'directional',
      surface: surface || 'smooth',
    });
  } else if (type === 'implant') {
    command = 'implant';
    Object.assign(recipeParams, { name, depthUm: thickness, tilt });
  } else if (type === 'electrical') {
    command = 'electrical';
    Object.assign(recipeParams, {
      name, depthUm: thickness, regionType: electricalRegionType, source: electricalRegionSource,
    });
  } else throw new Error('Unsupported build step ' + type);
  const id = 'recipe-step-' + (current.recipe.steps.length + 1);
  current.recipe.steps.push({ id, command, params: recipeParams });
  current.recipe.activeStepId = id;
  const label = recipeName || ({ add: 'Deposit ', etch: 'Etch ', implant: 'Implant ', electrical: 'Electrical ' }[type] + name);
  return commit(current, {
    kind: type, label, face, areaMode: area, thickness, name,
    ...(type === 'add' ? { growth } : {}),
    ...(type === 'etch' ? { surface } : {}),
    ...(type === 'electrical' ? { electricalRegionType, electricalRegionSource } : {}),
    replay: { version: 1, params: copy(params), areaMode: area, maskContext: mask },
  }, { shapes, face, bookmark });
}
function record(current, processType, label, {
  temperatureC = null, durationMin = null, ambient = null, note = null, bookmark = false,
} = {}) {
  current.model.revision += 1;
  current.model.processRevision += 1;
  const id = 'recipe-step-' + (current.recipe.steps.length + 1);
  current.recipe.steps.push({ id, command: 'record', params: {
    process: processType, label, temperatureC, durationMin, ambient, note,
  } });
  current.recipe.activeStepId = id;
  return commit(current, {
    kind: 'record', label, processType, geometryChanged: false,
    temperatureC, durationMin, ambient, note, replay: { version: 1, kind: 'record' },
  }, { bookmark });
}

const si = makeBase('n- Si (111) · 350 µm', 350);
root.model = copy(si);
const main = branch('main', 'Photodetector families · choose substrate', null, null, si, 'Select a detector variant');
record(main, 'example-root', 'Detector families (Si and Ge begin from different Bases)', {
  note: 'This root contains no common fabrication. Ge begins with a genuine Base replacement.',
});
const mainId = main.info.headNodeId;
const black = branch('black-si-fig1a', 'Black-Si Fig. 1a · source-order process', 'main', mainId, main.model,
  'Setälä et al. 2023 · Black-Si photodiode');
step(black, { type: 'add', name: 'Thermal SiO2 650 nm', thickness: 0.65, bookmark: true });
step(black, { type: 'etch', name: 'Open active SiO2 mask', thickness: 0.65, area: 'mask',
  shapes: masks.activeOpening, targets: ['Thermal SiO2 650 nm'] });
step(black, { type: 'etch', name: 'ICP-RIE black-Si', thickness: 0.7,
  area: 'mask', shapes: masks.blackSi, targets: ['n- Si (111) · 350 µm'], bookmark: true,
  surface: { kind: 'rough', morphology: 'stochastic', polarity: 'normal', featureSize: 0.3,
    meanHeight: 0.5, featureCv: 0.25, heightCv: 0.25, seed: 3668339987, profileId: 'rough-black-si-acs-2023', geometryMode: 'ideal' },
  recipeName: 'Rough ICP-RIE b-Si · 700 nm relief surrogate (morphology assumed)' });
step(black, { type: 'etch', name: 'Open guard-ring SiO2', thickness: 0.65,
  targets: ['Thermal SiO2 650 nm'], area: 'mask', shapes: masks.guard });
step(black, { type: 'implant', name: 'B p+ · 10 keV, 3e15 cm^-2; ~1.5 µm illustrative junction depth',
  thickness: 1.5, area: 'mask', shapes: masks.frontImplant, bookmark: true });
step(black, { type: 'implant', name: 'P n+ rear · schematic depth 1 µm (dose not specified)',
  thickness: 1, face: 'back' });
record(black, 'anneal', 'Drive-in · 1050°C · 20 min · O2', { temperatureC: 1050,
  durationMin: 20, ambient: 'O2', bookmark: true });
record(black, 'clean', 'Remove drive-in oxide from implanted areas (thickness unspecified)', {
  note: 'Process note only. Kernel does not generate oxide during anneal; no artificial oxide etch inserted.' });
step(black, { type: 'add', name: 'ALD Al2O3 · 50 nm', thickness: 0.05,
  growth: 'conformal', bookmark: true });
step(black, { type: 'etch', name: 'Contact windows in Al2O3 (assumed)', thickness: 0.05,
  area: 'mask', shapes: masks.contacts, targets: ['ALD Al2O3 · 50 nm'] });
step(black, { type: 'add', name: 'Front sputtered Al · 300 nm', thickness: 0.3 });
step(black, { type: 'add', name: 'Rear cathode Al · 1000 nm', thickness: 1, face: 'back' });
step(black, { type: 'etch', name: 'Remove Al above active area before forming-gas anneal',
  thickness: 0.3, area: 'mask', shapes: masks.blackSi,
  targets: ['Front sputtered Al · 300 nm'] });
record(black, 'anneal', 'Forming gas · 425°C · 30 min (ALD, contacts and Al-nealing)', {
  temperatureC: 425, durationMin: 30, ambient: 'forming gas', bookmark: true });
const finalSi = branch('black-si-fig1a-final', 'FINAL · protected active ALD',
  'black-si-fig1a', black.info.headNodeId, black.model, black.recipe.name);
finalSi.recipe = copy(black.recipe);
step(finalSi, { type: 'etch', name: 'Selective strip Al above SiO2; retain contacts',
  thickness: 0.3, targets: ['Front sputtered Al · 300 nm'],
  area: 'invert', shapes: masks.contacts, bookmark: true });
const qa = branch('black-si-fig1a-qa', 'QA · intentional nonselective overetch',
  'black-si-fig1a', black.info.headNodeId, black.model, black.recipe.name);
qa.recipe = copy(black.recipe);
step(qa, { type: 'etch', name: 'Nonselective Al overetch — destructive QA only',
  thickness: 0.3, area: 'invert', shapes: masks.contacts, bookmark: true });

const ge = branch('ge-fig15-common', 'Ge Fig. 15 · fabrication common process',
  'main', mainId, makeBase('n-Ge Sb · 302 µm · 29.1 Ωcm', 302),
  'Liu et al. 2025 · Ge photodiode · start from Ge Base');
commit(ge, {
  kind: 'base', label: 'Create n-Ge (Sb) Base · 302 µm, ⟨100⟩',
  geometryChanged: true, note: 'Ge is a separate physical substrate from Black-Si.',
}, { bookmark: true });
step(ge, { type: 'add', name: 'PECVD SiNx implant mask · 300 nm', thickness: 0.3 });
step(ge, { type: 'etch', name: 'Pattern SiNx for front B contact implantation',
  thickness: 0.3, targets: ['PECVD SiNx implant mask · 300 nm'],
  area: 'mask', shapes: masks.contacts });
step(ge, { type: 'implant', name: 'B p+ front · 30 keV, 1e15 cm^-2 (depth illustrative)',
  thickness: 0.5, area: 'mask', shapes: masks.contacts, bookmark: true });
step(ge, { type: 'implant', name: 'P n+ rear · 60 keV, 1e15 cm^-2 (depth illustrative)',
  thickness: 0.5, face: 'back' });
record(ge, 'anneal', 'Activate B/P implants · 500°C · 5 min · N2',
  { temperatureC: 500, durationMin: 5, ambient: 'N2' });
step(ge, { type: 'etch', name: 'Strip SiNx implantation mask in BHF', thickness: 0.3,
  targets: ['PECVD SiNx implant mask · 300 nm'] });
step(ge, { type: 'add', name: 'Temporary ALD Al2O3 etch mask · 100 nm (assumed)',
  thickness: 0.1 });
step(ge, { type: 'etch', name: 'Open 5 mm active area in temporary Al2O3',
  thickness: 0.1, targets: ['Temporary ALD Al2O3 etch mask · 100 nm (assumed)'],
  area: 'mask', shapes: masks.blackSi });
step(ge, { type: 'etch', name: 'ICP-RIE Ge · 200 nm XY / 700 nm height surrogate',
  thickness: 1, targets: ['n-Ge Sb · 302 µm · 29.1 Ωcm'],
  area: 'mask', shapes: masks.blackSi, bookmark: true,
  surface: { kind: 'rough', morphology: 'stochastic', polarity: 'normal',
    featureSize: 0.2, meanHeight: 0.7, featureCv: 0.25, heightCv: 0.25,
    seed: 3668339987, profileId: 'rough-ge-lsa-2025', geometryMode: 'ideal' } });
record(ge, 'surface-treatment', 'H2O2 etch-back · 3% v/v, 15 s (journal; thesis says 30 s)', {
  durationMin: 0.25, ambient: '3% H2O2',
  note: 'Literature conflict: 2025 journal Methods 15 s; 2026 thesis section 4.1 30 s. No removal rate; topography is a surrogate.' });
step(ge, { type: 'etch', name: 'Strip temporary Al2O3 mask in BHF',
  thickness: 0.1, targets: ['Temporary ALD Al2O3 etch mask · 100 nm (assumed)'] });
record(ge, 'clean', 'HCl clean · 31.6% v/v · 5 min',
  { durationMin: 5, ambient: '31.6% HCl', bookmark: true });

function geBranch(id, label, isB) {
  const v = branch(id, label, 'ge-fig15-common', ge.info.headNodeId, ge.model,
    'Liu et al. · Ge Fig. 15' + (isB ? 'b SiO2/Al2O3 inactive' : 'a full-area Al2O3'));
  v.recipe = copy(ge.recipe);
  // Pre-film annotation is intentional: Electrical Regions attach to the Ge
  // semiconductor, whereas the current Kernel's Electrical command selects
  // the *exposed* material. ALD itself then activates this expected region.
  step(v, { type: 'electrical', name: 'Induced p-type inversion (predicted; activated after ALD)',
    thickness: 0.05, area: isB ? 'mask' : 'full',
    shapes: isB ? masks.blackSi : [], electricalRegionType: 'p-inversion',
    electricalRegionSource: 'induced' });
  if (isB) {
    step(v, { type: 'electrical', name: 'Induced n-type accumulation (predicted; activated after dielectric)',
      thickness: 0.05, area: 'invert', shapes: masks.inactiveExcluded,
      electricalRegionType: 'n-accumulation', electricalRegionSource: 'induced' });
    step(v, { type: 'add', name: 'Inactive PEALD SiO2 · 45 nm (study assumption)',
      thickness: 0.045, growth: 'conformal', area: 'invert', shapes: masks.inactiveExcluded });
  }
  step(v, { type: 'add', name: 'Passivation ALD Al2O3 · 20 nm · Qf -2.3e12 cm^-2',
    thickness: 0.02, growth: 'conformal', bookmark: true });
  step(v, { type: 'etch', name: 'Open contact windows in passivation ALD',
    thickness: 0.02, targets: ['Passivation ALD Al2O3 · 20 nm · Qf -2.3e12 cm^-2'],
    area: 'mask', shapes: masks.contacts });
  record(v, 'anneal', 'Activate Al2O3 passivation and induced field · 400°C, 30 min, N2',
    { temperatureC: 400, durationMin: 30, ambient: 'N2', bookmark: true });
  step(v, { type: 'add', name: 'Rear Al cathode · 300 nm',
    thickness: 0.3, face: 'back' });
  step(v, { type: 'add', name: 'Front Al anode and guard ring · 500 nm (thesis)',
    thickness: 0.5, area: 'mask', shapes: masks.contacts, bookmark: true });
  record(v, 'anneal', 'Final sputter-damage healing · 350°C, 30 min, N2',
    { temperatureC: 350, durationMin: 30, ambient: 'N2', bookmark: true });
  return v;
}
geBranch('ge-fig15-a', 'A · full-area Al2O3 (Fig. 15a)', false);
geBranch('ge-fig15-b', 'B · inactive SiO2/Al2O3 (Fig. 15b)', true);

// The default Welcome state is the final, not the deliberate QA overetch.
const head = branchData.get('black-si-fig1a-final');
const finalState = state(head.model, masks.contacts, 'front', head.recipe);
Object.assign(root, finalState);
root.section = { a: [-3400, 0], b: [3400, 0] };
root.snapshotBranches = {
  version: 3, activeBranchId: head.info.id,
  cursorNodeId: head.info.headNodeId, cursorSnapshotId: head.info.headSnapshotId,
  nodes, branches,
};
root.snapshots = snapshots;
validateProjectFile(root);
const packed = prepareProjectForWorkspaceStorage(root, { geometryTemplates: false });
const data = JSON.stringify(packed);
const opened = await readProjectFile({ size: Buffer.byteLength(data), text: async () => data });
assert.equal(opened.snapshotBranches.nodes.length, nodes.length);
assert.deepEqual(opened.model, root.model, 'Round-trip geometry changed');
assert.equal(opened.snapshotBranches.branches.length, branches.length);
if (process.argv.includes('--write')) await writeFile(target, data);
else assert.equal(await readFile(target, 'utf8'), data, 'Photodetector example is stale; run with --write');
console.log(JSON.stringify({
  bytes: Buffer.byteLength(data),
  nodes: nodes.length, snapshots: snapshots.length, variants: branches.length,
  finalRevision: root.model.processRevision,
  variantHeads: branches.map((b) => ({ id: b.id, revision: b.headState.model.processRevision })),
}, null, 2));
