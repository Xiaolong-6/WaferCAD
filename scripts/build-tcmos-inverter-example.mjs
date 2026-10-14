/**
 * Paper-derived structural reconstruction of a 130 nm tunnelling-based ternary CMOS inverter.
 * J. W. Jeong et al., Nature Electronics 2, 307-312 (2019),
 * https://doi.org/10.1038/s41928-019-0272-8
 *
 * The paper does not provide the foundry GDS, a complete process traveller,
 * exact implantation doses/energies, or measured Z profiles.
 * Masks and unspecified thicknesses are illustrative. Implant is an annotation.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

export const TCMOS_DOI = '10.1038/s41928-019-0272-8';
export const FIELD_UM = [14, 8];
export const GATE_LENGTH_UM = 0.13;
const BASE_THICKNESS_UM = 2;
const FIXED_DATE = '2026-10-14T08:00:00.000Z';
const CELL = 'TCMOS_130NM_LOCAL';
const copy = (value) => structuredClone(value);
const rect = (x, y, w, h) => ({ x, y, w, h });
const rectanglePolygon = (r) => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];
// Fig. 1b is a schematic, NOT a released foundry layout. Use its mask topology:
// two horizontal ACTIVE bars, complementary enclosing LVT/HVT windows, nested
// U-shaped body-tap contact arrays and four separate METAL1 electrical nets.
const P_ACTIVE = rect(-5, -0.65, 4, 1.3);
const N_ACTIVE = rect(1, -0.65, 4, 1.3);
const gateLeft = -3;
const gateRight = 3;
const sd = (minX, maxX) => rect(minX, -0.65, maxX - minX, 1.3);
const U_CENTERS = [-3, 3];
function bodyTapActive(cx) {
  // U-shaped diffusion / substrate-well tie, isolated from the channel ACTIVE.
  return [
    rect(cx - 2.55, -2.3, 5.1, 0.4),
    rect(cx - 2.55, -2.3, 0.4, 1.6),
    rect(cx + 2.15, -2.3, 0.4, 1.6),
  ];
}
function bodyTapContacts(cx) {
  const contacts = [];
  for (let i = 0; i < 10; i++) {
    contacts.push(rect(cx - 2.25 + i * 0.5 - 0.09, -2.19, 0.18, 0.18));
  }
  for (const x of [cx - 2.35, cx + 2.35]) {
    for (const y of [-1.65, -1.2, -0.85]) {
      contacts.push(rect(x - 0.09, y - 0.09, 0.18, 0.18));
    }
  }
  return contacts;
}
function bodyTapMetal(cx) {
  return [
    rect(cx - 2.55, -2.3, 5.1, 0.4),
    rect(cx - 2.55, -2.3, 0.4, 1.6),
    rect(cx + 2.15, -2.3, 0.4, 1.6),
  ];
}
export const TCMOS_METAL_NETS = Object.freeze([
  {
    name: 'VDD',
    rectangles: [rect(-4.52, -2.16, 0.36, 2.36), ...bodyTapMetal(-3)],
  },
  {
    name: 'VOUT',
    rectangles: [rect(-1.84, -0.16, 3.68, 0.32)],
  },
  {
    name: 'GND',
    rectangles: [rect(4.16, -2.16, 0.36, 2.36), ...bodyTapMetal(3)],
  },
  {
    name: 'VIN',
    rectangles: [
      rect(-3.18, 1.0, 0.36, 1.65),
      rect(2.82, 1.0, 0.36, 1.65),
      rect(-3.18, 2.41, 6.36, 0.24),
    ],
  },
]);

export const TCMOS_MASKS = Object.freeze([
  {
    id: 1,
    name: 'ACTIVE / STI complement, transistor plus isolated U-shaped body ties',
    rectangles: [P_ACTIVE, N_ACTIVE, ...U_CENTERS.flatMap(bodyTapActive)],
  },
  { id: 2, name: 'NWELL (pMOS + body tie)', rectangles: [P_ACTIVE, ...bodyTapActive(-3)] },
  { id: 3, name: 'PWELL (nMOS + body tie)', rectangles: [N_ACTIVE, ...bodyTapActive(3)] },
  // Fig. 1b explicitly labels left pMOS as HVTN, right nMOS as HVTP.
  // HVTN corresponds to As+ n-type doping in n-well / pMOS.
  {
    id: 4,
    name: 'HVTN As+ pMOS buried body implant window',
    rectangles: [rect(-4.08, -0.92, 2.48, 1.85)],
  },
  {
    id: 5,
    name: 'HVTP BF2+ nMOS buried body implant window',
    rectangles: [rect(1.6, -0.92, 2.48, 1.85)],
  },
  {
    id: 6,
    name: 'POLY 130nm separate gates (VIN joined via METAL1)',
    rectangles: [
      rect(gateLeft - GATE_LENGTH_UM / 2, -0.83, GATE_LENGTH_UM, 2.2),
      rect(gateRight - GATE_LENGTH_UM / 2, -0.83, GATE_LENGTH_UM, 2.2),
    ],
  },
  {
    id: 7,
    name: 'P source/drain openings',
    rectangles: [sd(-5, gateLeft - 0.09), sd(gateLeft + 0.09, -1)],
  },
  {
    id: 8,
    name: 'N source/drain openings',
    rectangles: [sd(1, gateRight - 0.09), sd(gateRight + 0.09, 5)],
  },
  {
    id: 9,
    name: 'Silicide exposed source/drain',
    rectangles: [
      sd(-5, gateLeft - 0.09),
      sd(gateLeft + 0.09, -1),
      sd(1, gateRight - 0.09),
      sd(gateRight + 0.09, 5),
    ],
  },
  {
    id: 10,
    name: 'CNT transistor / POLY contacts and U-shaped body tie arrays',
    rectangles: [
      rect(-4.52, -0.18, 0.36, 0.36),
      rect(-1.84, -0.18, 0.36, 0.36),
      rect(1.48, -0.18, 0.36, 0.36),
      rect(4.16, -0.18, 0.36, 0.36),
      rect(-3.13, 1.02, 0.26, 0.26),
      rect(2.87, 1.02, 0.26, 0.26),
      ...U_CENTERS.flatMap(bodyTapContacts),
    ],
  },
  {
    id: 11,
    name: 'METAL1 VDD / VOUT / GND / VIN (isolated nets)',
    rectangles: TCMOS_METAL_NETS.flatMap((net) => net.rectangles),
  },
  {
    id: 12,
    name: 'LVTN reference CMOS channel implant window (not applied to T-CMOS)',
    rectangles: [rect(-5.7, -2.72, 5.4, 3.65)],
  },
  {
    id: 13,
    name: 'LVTP reference CMOS channel implant window (not applied to T-CMOS)',
    rectangles: [rect(0.3, -2.72, 5.4, 3.65)],
  },
]);
const BY_ID = new Map(TCMOS_MASKS.map((mask) => [mask.id, mask]));

export function tcmosLayout() {
  const elements = TCMOS_MASKS.flatMap((mask) =>
    mask.rectangles.map((r) => ({
      kind: 'polygon',
      sourceCell: CELL,
      layer: mask.id,
      datatype: 0,
      points: rectanglePolygon(r),
    })),
  );
  return {
    name: 'T-CMOS 130nm representative inverter; reconstructed masks, not foundry GDS',
    root: CELL,
    elements,
    linework: [],
    hierarchy: {},
    combos: TCMOS_MASKS.map((mask) => ({
      key: CELL + '|' + mask.id + '|0',
      cell: CELL,
      layer: mask.id,
      datatype: 0,
      count: mask.rectangles.length,
    })),
    bounds: {
      minX: -7,
      minY: -4,
      maxX: 7,
      maxY: 4,
      width: 14,
      height: 8,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
function maskContext(id) {
  assert.ok(BY_ID.has(id), 'Unknown mask: ' + id);
  return {
    sourceMode: 'file',
    cell: CELL,
    layerKeys: [id + '|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}

export async function buildTcmosInverter({ illustrativeTiltDeg = 0 } = {}) {
  if (![0, 18].includes(illustrativeTiltDeg)) {
    throw new Error('Only 0° source-faithful and 18° illustrative tilt diagnostic are supported.');
  }
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');

  const model = modelApi.createModel({
    shape: 'rect',
    width: FIELD_UM[0],
    height: FIELD_UM[1],
    thickness: BASE_THICKNESS_UM,
  });
  model.layers[0].name = 'Si (100) substrate; 2 µm display thickness';
  const base = {
    shape: 'rect',
    width: FIELD_UM[0],
    height: FIELD_UM[1],
    thickness: BASE_THICKNESS_UM,
    material: model.layers[0].name,
  };
  const project = projectForBenchmark({
    model,
    section: { a: [-5.5, 0], b: [5.5, 0] },
  });
  project.name = illustrativeTiltDeg
    ? 'T-CMOS 130nm TILT DEMO — 18° assumed, NOT paper'
    : 'Tunnelling-based ternary CMOS inverter (130 nm)';
  project.display.threeOpacity = 0.36;
  project.layout = tcmosLayout();
  project.maskSourceMode = 'file';
  project.activeCell = CELL;
  project.selectedLayerKeys = ['1|0', '4|0', '5|0', '6|0', '10|0', '11|0', '12|0', '13|0'];
  project.drawMask = { nextShapeId: 1, shapes: [] };
  project.maskRoi = null;

  const steps = [];
  const nodes = [];
  const bookmarks = [];
  const checkpoints = [];
  const materials = new Map();
  let parentId = null;
  const branch = {
    id: 'main',
    name: '130nm T-CMOS inverter; structural reconstruction',
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: FIXED_DATE,
    headState: null,
  };
  const stamp = (n) => new Date(Date.parse(FIXED_DATE) + n * 1000).toISOString();
  function capture() {
    const state = copy(project);
    delete state.snapshots;
    delete state.snapshotBranches;
    state.model = copy(model);
    state.processRecipe = normalizeProcessRecipe({
      name: 'Jeong et al. 2019 130nm T-CMOS (geometric approximation)',
      base,
      steps,
    });
    return state;
  }
  function append(operation) {
    const id = 'tcmos-step-' + String(nodes.length).padStart(2, '0');
    const node = {
      id,
      branchId: branch.id,
      parentId,
      createdAt: stamp(nodes.length),
      processRevision: model.processRevision,
      operation,
      state: capture(),
    };
    nodes.push(node);
    parentId = id;
    if (!branch.rootNodeId) branch.rootNodeId = id;
    branch.headNodeId = id;
    branch.headState = copy(node.state);
    return node;
  }
  function bookmark(name) {
    const node = nodes.at(-1);
    const item = {
      id: 'tcmos-bookmark-' + (bookmarks.length + 1),
      name,
      createdAt: stamp(300 + bookmarks.length),
      branchId: branch.id,
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: copy(node.state),
    };
    bookmarks.unshift(item);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = item.id;
    branch.headSnapshotId = item.id;
  }
  function areaFor(maskId, areaMode = 'mask') {
    if (maskId == null) return model.boundary;
    const mask = BY_ID.get(maskId);
    assert.ok(mask);
    const selected = v.unionGeometries(
      mask.rectangles.map((r) => v.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2)),
    );
    return areaMode === 'invert' ? v.difference(model.boundary, selected) : selected;
  }
  function pointRegion(x, y) {
    return model.regions.find((region) => v.pointInMulti([x, y], region.geom));
  }
  function topMaterial(x, y) {
    const region = pointRegion(x, y);
    const segment = region?.stack?.at(-1);
    return model.layers.find((layer) => layer.id === segment?.layerId)?.name || null;
  }
  function apply(label, command, args, maskId = null, areaMode = 'mask') {
    const p = {
      type: command === 'deposit' ? 'add' : command,
      face: 'front',
    };
    if (command === 'deposit') {
      Object.assign(p, {
        name: args.material,
        thickness: args.thickness,
        growth: args.coverage || 'direct',
      });
    } else if (command === 'etch') {
      Object.assign(p, {
        thickness: args.depth ?? args.targetZ,
        etchProfile: args.profile || 'directional',
      });
      if (args.profile === 'planarize') p.targetZ = args.targetZ;
      if (args.target) {
        assert.ok(materials.has(args.target), 'Missing target material: ' + args.target);
        p.etchTargetLayerIds = [materials.get(args.target)];
      }
    } else if (command === 'implant') {
      Object.assign(p, {
        name: args.name,
        thickness: args.depth,
        ...(args.startDepth > 0 ? { depthStart: args.startDepth } : {}),
        tilt: args.tilt || 0,
        color: args.color || '#e05d75',
      });
    } else if (command === 'electrical') {
      Object.assign(p, {
        name: args.name,
        thickness: args.depth,
        electricalRegionType: args.regionType,
        electricalRegionSource: args.source,
        color: args.color || '#738cbd',
      });
    }
    const area = areaFor(maskId, areaMode);
    const result =
      applyAdvancedProcessOperation(model, p, area, modelApi, v) ||
      modelApi.applyOperation(model, { ...p, area });
    assert.equal(result?.changed, true, label + ': ' + (result?.error || 'no change'));
    if (command === 'deposit') materials.set(args.material, result.layerId);
    const params = {
      ...args,
      area: maskId == null ? 'full' : areaMode,
      face: 'front',
    };
    if (maskId != null) params.mask = maskContext(maskId);
    if (command === 'deposit') {
      params.thicknessUm = params.thickness;
      delete params.thickness;
    } else if (command === 'etch') {
      params.thicknessUm = args.profile === 'planarize' ? args.targetZ : args.depth;
      delete params.depth;
      delete params.targetZ;
    } else if (command === 'implant' || command === 'electrical') {
      params.depthUm = params.depth;
      delete params.depth;
      if (command === 'implant' && args.startDepth > 0) {
        params.startDepthUm = args.startDepth;
        delete params.startDepth;
      }
    }
    steps.push({ command, params });
    const operation = {
      kind: command === 'deposit' ? 'add' : command,
      label,
      face: 'front',
      areaMode: maskId == null ? 'full' : areaMode,
      geometryChanged: true,
      ...(command === 'deposit'
        ? { name: p.name, thickness: p.thickness, growth: p.growth, resultLayerId: result.layerId }
        : command === 'etch'
          ? {
              thickness: p.thickness,
              etchProfile: p.etchProfile,
              etchTargetLayerIds: p.etchTargetLayerIds || [],
              ...(p.targetZ != null ? { targetZ: p.targetZ } : {}),
            }
          : { name: p.name, thickness: p.thickness }),
      replay: {
        version: 1,
        params: copy(p),
        areaMode: maskId == null ? 'full' : areaMode,
        maskContext: maskId == null ? null : maskContext(maskId),
      },
    };
    append(operation);
    validateProcessModel(model);
    checkpoints.push({
      label,
      command,
      regions: model.regions.length,
      layers: model.layers.length,
    });
    return result;
  }
  function record(label, process, note, temperatureC = null, durationMin = null) {
    model.revision++;
    model.processRevision++;
    steps.push({
      command: 'record',
      params: { process, label, note, temperatureC, durationMin },
    });
    append({
      kind: 'record',
      label,
      processType: process,
      note,
      temperatureC,
      durationMin,
      geometryChanged: false,
      replay: { version: 1, kind: 'record' },
    });
    validateProcessModel(model);
  }
  const deposit = (label, material, thickness, maskId = null, coverage = 'direct') =>
    apply(label, 'deposit', { material, thickness, coverage }, maskId);
  const etch = (label, target, depth, maskId, mode = 'mask') =>
    apply(label, 'etch', { target, depth, profile: 'directional' }, maskId, mode);
  const implant = (label, name, depth, maskId, color, startDepth = 0, tilt = 0) =>
    apply(label, 'implant', { name, depth, tilt, color, startDepth }, maskId);
  const electrical = (label, name, regionType, depth, maskId, color) =>
    apply(label, 'electrical', { name, regionType, depth, source: 'doped', color }, maskId);

  append({
    kind: 'base',
    label: 'Si(100) Base; 2µm illustrative cross-sectional handle',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  // STI is a physical 2.5D trench: remove Si outside ACTIVE, fill oxide,
  // then planarize to the original surface. Do not call a blanket field oxide STI.
  etch('STI shallow trench 230nm (illustrative)', '', 0.23, 1, 'invert');
  deposit('STI oxide fill 280nm overburden (illustrative)', 'STI SiO2 fill', 0.28);
  apply('STI CMP to original Si surface', 'etch', { profile: 'planarize', targetZ: 1 });
  assert.equal(topMaterial(-4, 0), model.layers[0].name, 'STI removed active Si surface');
  assert.equal(topMaterial(0, 0), 'STI SiO2 fill', 'STI field oxide not retained');
  bookmark('S01 - STI isolated ACTIVE');

  electrical('N-well marker', 'N-well pMOS (schematic)', 'n-type', 0.6, 2, '#71a3e7');
  electrical('P-well marker', 'P-well nMOS (schematic)', 'p-type', 0.6, 3, '#e6a07c');
  record(
    'Well formation/drive in',
    'anneal',
    'Foundry well implant and activation details not disclosed; no diffusion model.',
  );
  bookmark('S02 - complementary well regions');

  implant(
    'HVTN As body implant',
    'HVTN As+ pMOS / buried HVT body interval (illustrative)',
    0.24,
    4,
    '#d9668a',
    0.08,
    illustrativeTiltDeg,
  );
  implant(
    'HVTP BF2 body implant',
    'HVTP BF2+ nMOS / buried HVT body interval (illustrative)',
    0.24,
    5,
    '#5d8ce0',
    0.08,
    illustrativeTiltDeg,
  );
  record(
    'Body implant rapid thermal anneal',
    'anneal',
    'Reported deeper HVT body implants have unspecified energy/dose. The illustrated 80–240 nm buried intervals are geometry markers, not dopant concentration predictions.',
  );
  bookmark('S03 - HVT body implant annotations');

  deposit('Gate dielectric SiO2 5nm (illustrative)', 'Gate SiO2 (5nm surrogate)', 0.005);
  deposit('Pattern separate 130nm POLY gates (VIN via METAL1)', 'POLY gate', 0.2, 6);
  // Expose the source/drain Si before placing implant annotations. Actual foundry
  // dielectric-window and spacer sequence is abstracted here; no implant physics.
  for (const id of [7, 8]) {
    etch(
      'Expose Si in ' + (id === 7 ? 'pMOS' : 'nMOS') + ' S/D regions (surrogate)',
      'Gate SiO2 (5nm surrogate)',
      0.005,
      id,
    );
  }
  implant('pMOS LDD structural marker', 'pMOS LDD anticipated profile', 0.08, 7, '#cf6785');
  implant('nMOS LDD structural marker', 'nMOS LDD anticipated profile', 0.08, 8, '#4c93c6');
  record(
    'Spacer formation',
    'custom',
    'Self-aligned dielectric spacers recorded only: dimensions and etch recipe unreported.',
  );
  implant('pMOS HDD structural marker', 'p+ HDD anticipated profile', 0.18, 7, '#bd4d68');
  implant('nMOS HDD structural marker', 'n+ HDD anticipated profile', 0.18, 8, '#3978b3');
  record(
    'Dopant activation / RTA',
    'anneal',
    'Geometry does not model dopant redistribution or activation.',
  );
  bookmark('S04 - POLY / annotated source-drain');

  deposit('Silicide S/D contacts (reaction surrogate)', 'S/D silicide surrogate', 0.025, 9);
  deposit('SiO2 interlayer dielectric 450nm (illustrative)', 'Interlayer SiO2', 0.45);
  etch('CNT contact openings through ILD', 'Interlayer SiO2', 0.45, 10);
  deposit('Pattern W contact plugs (illustrative)', 'W contacts', 0.47, 10);
  deposit('Pattern METAL1 interconnects', 'METAL1 Al', 0.2, 11);
  bookmark('S05 - inverter / METAL1 final');

  Object.assign(project, capture());
  project.name = illustrativeTiltDeg
    ? 'T-CMOS 130nm · TILT DEMO 18° (NOT REPORTED IN PAPER)'
    : 'T-CMOS 130nm · tunnelling-based ternary inverter (illustrative)';
  if (illustrativeTiltDeg) project.section = { a: [-3.75, 0], b: [-2.25, 0] };
  project.layout = tcmosLayout();
  project.selectedLayerKeys = ['1|0', '4|0', '5|0', '6|0', '10|0', '11|0', '12|0', '13|0'];
  project.snapshotBranches = {
    version: 3,
    activeBranchId: branch.id,
    cursorNodeId: branch.headNodeId,
    cursorSnapshotId: branch.headSnapshotId,
    nodes,
    branches: [branch],
  };
  project.snapshots = bookmarks;
  validateProjectFile(project);
  const preflight = validateRecipeExecution(project.processRecipe.steps, {
    model,
    maskState: { layout: project.layout },
    base: project.processRecipe.base,
    startMode: 'new-base',
  });
  assert.deepEqual(preflight.errors, [], 'T-CMOS recipe preflight errors');

  const stored = prepareProjectForWorkspaceStorage(project);
  const json = JSON.stringify(stored);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(loaded);
  assert.deepEqual(loaded.model, project.model, 'T-CMOS model changed on storage round-trip');
  assert.equal(loaded.snapshotBranches.nodes.length, nodes.length);
  assert.equal(loaded.processRecipe.steps.length, steps.length);
  const validation = {
    pass: true,
    doi: TCMOS_DOI,
    note: '130nm local layout and masks inferred; not the foundry GDS or calibrated TCAD.',
    source: 'Jeong et al. 2019 Fig.1 + Supplementary Fig.1 + Methods',
    gatesUm: GATE_LENGTH_UM,
    tiltDegrees: illustrativeTiltDeg,
    tiltSourceReported: false,
    maskLayers: TCMOS_MASKS.length,
    processNodes: nodes.length,
    recipeSteps: steps.length,
    bookmarks: bookmarks.length,
    implantMarkers: model.implants.length,
    electricalMarkers: model.electricalRegions.length,
    finalRegions: model.regions.length,
    finalMaterialLayers: model.layers.length,
    checkpoints,
    keyAssumptions: [
      'L = 130 nm follows the foundry node; remaining XY placement and contact widths are illustrative.',
      'Si handle=2um, STI depth=230nm, fill=280nm, gate oxide=5nm, POLY=200nm, ILD=450nm and METAL1=200nm are model choices, not author measurements.',
      'As+ for left pMOS (HVTN window) and BF2+ for right nMOS (HVTP window); buried interval 80–240 nm is illustrative, not calibrated concentration or tunnel-junction thickness.',
      'Well/LDD/HDD annotations are qualitative; no dopant concentration, diffusion, activation, tunnelling current or inverter transfer curve is predicted.',
      'LVTN/LVTP mask windows are reference-only and NOT executed in the T-CMOS process; U-shaped body-tie diffusion, contact arrays and metal routing are traced visually from Fig. 1b, not measured dimensions.',
      'Contact metallization is an ideal geometry surrogate; foundry silicide/etch chemistry and spacer details are not simulated.',
      illustrativeTiltDeg
        ? '18-degree tilted Implant is a DIAGNOSTIC ONLY, not the paper recipe. The paper reports no angle; 1.5um Section A-B is zoomed for geometric displacement.'
        : 'Implant tilt is 0 degrees: the paper reports energy/dose but no beam angle. Buried annotations are not tilted doping.',
    ],
  };
  return { project, stored, json, validation };
}

async function main() {
  const tiltDemo = process.argv.includes('--tilt-demo');
  const { json, validation } = await buildTcmosInverter({ illustrativeTiltDeg: tiltDemo ? 18 : 0 });
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const out = process.argv.includes('--write-repo')
    ? join(repo, 'site/examples')
    : join(repo, 'test-results/tcmos');
  await mkdir(out, { recursive: true });
  await writeFile(
    join(
      out,
      tiltDemo
        ? 'tcmos-tilt-demo-18deg-NOT-PAPER.wafercad'
        : 'tcmos-ternary-inverter-130nm.wafercad',
    ),
    json,
  );
  const reports = join(repo, 'test-results/tcmos');
  await mkdir(reports, { recursive: true });
  await writeFile(
    join(reports, tiltDemo ? 'tilt-demo-validation.json' : 'validation.json'),
    JSON.stringify(validation, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      pass: true,
      processNodes: validation.processNodes,
      recipeSteps: validation.recipeSteps,
      maskLayers: validation.maskLayers,
      outputBytes: Buffer.byteLength(json),
      out,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
