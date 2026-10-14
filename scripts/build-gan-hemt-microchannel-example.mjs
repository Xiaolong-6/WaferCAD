/**
 * Lian et al., Microsystems & Nanoengineering 8:119 (2022).
 * DOI: 10.1038/s41378-022-00462-3
 *
 * Paper-derived GEOMETRIC surrogate. The published 2 x 400 um double-side
 * etched / direct-bonded Si process cannot currently be represented as a true
 * two-model wafer bond. Four bridge-and-open steps retain true connected voids
 * and a final 800 um interposer, but are NOT the paper's fabrication recipe.
 * All inferred mask coordinates are explicitly illustrative, not author GDS.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

export const GAN_MICROCHANNEL_DOI = '10.1038/s41378-022-00462-3';
const DATE = '2026-10-14T08:00:00.000Z';
const DIMENSIONS = Object.freeze({ x: 6000, y: 5000, base: 400, cap: 100 });
// Distinct Si process Layers share one material color; identity belongs to
// layer IDs, not an artificial multi-material rainbow in the Section.
export const GAN_SILICON_COLOR = '#BFC9D2';
const clone = structuredClone;
const rect = (x, y, w, h) => ({ x, y, w, h });
const corners = ({ x, y, w, h }) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const centered = (w, h, x = 0, y = 0) => rect(x - w / 2, y - h / 2, w, h);

const fingers = Array.from({ length: 6 }, (_, i) => centered(30, 760, (i - 2.5) * 60));
const gateFingers = Array.from({ length: 10 }, (_, i) => centered(0.5, 300, (i - 4.5) * 30));
const chip = centered(878.5, 1120);
const solder = [
  centered(30, 1120, -424.25),
  centered(30, 1120, 424.25),
  centered(818.5, 30, 0, -545),
  centered(818.5, 30, 0, 545),
];
export const GAN_MICROCHANNEL_MASKS = Object.freeze([
  { id: 10, name: 'Bottom cavity 700 x 900 um', rectangles: [centered(700, 900)] },
  { id: 11, name: 'Lower transition 600 x 860 um (inferred)', rectangles: [centered(600, 860)] },
  { id: 12, name: 'Upper transition 480 x 820 um (inferred)', rectangles: [centered(480, 820)] },
  { id: 13, name: 'Six 30 um parallel channels (count inferred)', rectangles: fingers },
  {
    id: 14,
    name: 'Four representative electrical TSV bores (inferred)',
    rectangles: [
      centered(70, 70, -1450, -950),
      centered(70, 70, 1450, -950),
      centered(70, 70, -1450, 950),
      centered(70, 70, 1450, 950),
    ],
  },
  {
    id: 21,
    name: 'Rear coolant inlet and outlet bores (inferred)',
    rectangles: [centered(100, 60, 0, -415), centered(100, 60, 0, 415)],
  },
  { id: 15, name: 'Peripheral AuSn solder supports (inferred)', rectangles: solder },
  { id: 16, name: 'GaN HEMT die 878.5 x 1120 um', rectangles: [chip] },
  { id: 17, name: 'HEMT active footprint 303 x 393 um', rectangles: [centered(303, 393)] },
  { id: 18, name: 'Ten 0.5 x 300 um gate fingers', rectangles: gateFingers },
  {
    id: 19,
    name: 'Illustrative source and drain contact pads',
    rectangles: [centered(60, 370, -225), centered(60, 370, 225)],
  },
  {
    id: 20,
    name: 'Illustrative GSG chip pads',
    rectangles: [centered(220, 350, -1250), centered(220, 350, 1250)],
  },
]);
const byId = new Map(GAN_MICROCHANNEL_MASKS.map((mask) => [mask.id, mask]));

function makeLayout() {
  const cell = 'GAN_MICROCHANNEL_2022_PAPER_DERIVED';
  return {
    name: 'Lian 2022 inferred geometrical masks - NOT original author GDS',
    root: cell,
    elements: GAN_MICROCHANNEL_MASKS.flatMap((mask) =>
      mask.rectangles.map((r) => ({
        kind: 'polygon',
        sourceCell: cell,
        layer: mask.id,
        datatype: 0,
        points: corners(r),
      })),
    ),
    linework: [],
    hierarchy: {},
    combos: GAN_MICROCHANNEL_MASKS.map((mask) => ({
      key: cell + '|' + mask.id + '|0',
      cell,
      layer: mask.id,
      datatype: 0,
      count: mask.rectangles.length,
    })),
    bounds: {
      minX: -DIMENSIONS.x / 2,
      minY: -DIMENSIONS.y / 2,
      maxX: DIMENSIONS.x / 2,
      maxY: DIMENSIONS.y / 2,
      width: DIMENSIONS.x,
      height: DIMENSIONS.y,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}

function maskContext(id) {
  return {
    sourceMode: 'file',
    cell: 'GAN_MICROCHANNEL_2022_PAPER_DERIVED',
    layerKeys: [id + '|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}

export async function buildGanMicrochannel() {
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const vectorApi = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');

  const model = modelApi.createModel({
    shape: 'rect',
    width: DIMENSIONS.x,
    height: DIMENSIONS.y,
    thickness: DIMENSIONS.base,
  });
  model.layers[0].name = 'High-resistivity Si lower wafer (400 um)';
  model.layers[0].color = GAN_SILICON_COLOR;
  const base = {
    shape: 'rect',
    width: DIMENSIONS.x,
    height: DIMENSIONS.y,
    thickness: DIMENSIONS.base,
    material: model.layers[0].name,
  };
  const root = projectForBenchmark({
    model,
    section: { a: [-700, 0], b: [700, 0] },
  });
  root.name = 'GaN HEMT / four-level Si microchannel (Lian 2022 surrogate)';
  root.display.threeOpacity = 0.56;
  root.display.threeShowBorders = false;
  // Saved inspection ROI is display-only: it is NOT a Process / Mask limiter.
  // Open the full structure by clearing ROI. The default view focuses on
  // microfluidic contact rather than an opaque 6 x 5 mm silicon slab.
  root.roi = { type: 'rect', a: [-800, -650], b: [800, 650] };
  root.display.threeCamera = {
    position: [1400, -1550, 1350],
    target: [0, 0, 420],
    fov: 35,
  };
  root.layout = makeLayout();
  root.maskSourceMode = 'file';
  root.activeCell = root.layout.root;
  root.selectedLayerKeys = ['10|0', '11|0', '12|0', '13|0', '18|0'];
  root.drawMask = { nextShapeId: 1, shapes: [] };
  root.maskRoi = null;

  const steps = [];
  const nodes = [];
  const bookmarks = [];
  const checkpoints = [];
  let parentId = null;
  const branch = {
    id: 'main',
    name: 'Lian 2022 microchannel geometric surrogate',
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: DATE,
    headState: null,
  };
  function snapshot() {
    const state = clone(root);
    delete state.snapshots;
    delete state.snapshotBranches;
    state.model = clone(model);
    state.processRecipe = normalizeProcessRecipe({
      name: 'GaN HEMT microchannel paper-derived geometry surrogate',
      base,
      steps,
    });
    return state;
  }
  function append(operation) {
    const id = 'gan-microchannel-step-' + String(nodes.length).padStart(2, '0');
    const node = {
      id,
      branchId: 'main',
      parentId,
      createdAt: new Date(Date.parse(DATE) + nodes.length * 1000).toISOString(),
      processRevision: model.processRevision,
      operation,
      state: snapshot(),
    };
    nodes.push(node);
    parentId = id;
    if (!branch.rootNodeId) branch.rootNodeId = id;
    branch.headNodeId = id;
    branch.headState = clone(node.state);
    validateProcessModel(model);
    checkpoints.push({
      id,
      label: operation.label,
      regions: model.regions.length,
      layers: model.layers.length,
      revision: model.processRevision,
    });
    return node;
  }
  function bookmark(name) {
    const node = nodes.at(-1);
    const id = 'gan-microchannel-bookmark-' + (bookmarks.length + 1);
    const item = {
      id,
      name,
      createdAt: new Date(Date.parse(DATE) + 200000 + bookmarks.length * 1000).toISOString(),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: clone(node.state),
    };
    bookmarks.unshift(item);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = id;
    branch.headSnapshotId = id;
  }
  function area(id) {
    if (id == null) return model.boundary;
    const shapes = byId.get(id)?.rectangles;
    assert.ok(shapes, 'Unknown mask ' + id);
    return vectorApi.unionGeometries(
      shapes.map((r) => vectorApi.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2)),
    );
  }
  function owner(point) {
    const matches = model.regions.filter((r) => vectorApi.pointInMulti(point, r.geom));
    assert.equal(matches.length, 1, 'Expected one XY owner at ' + point);
    return matches[0];
  }
  function process(label, command, params, maskId = null) {
    const kernel = { type: command === 'deposit' ? 'add' : 'etch', face: params.face || 'front' };
    if (command === 'deposit') {
      Object.assign(kernel, {
        name: params.material,
        thickness: params.thickness,
        growth: params.coverage === 'transfer' ? 'transfer' : 'direct',
        ...(params.coverage === 'transfer' ? { transferMode: 'flat' } : {}),
      });
    } else {
      Object.assign(kernel, {
        thickness: params.depth,
        etchProfile: 'directional',
        ...(params.targetId ? { etchTargetLayerIds: [params.targetId] } : {}),
      });
    }
    const result =
      applyAdvancedProcessOperation(model, kernel, area(maskId), modelApi, vectorApi) ||
      modelApi.applyOperation(model, { ...kernel, area: area(maskId) });
    assert.equal(result?.changed, true, label + ': ' + (result?.error || 'no geometry change'));
    if (command === 'deposit' && params.material.startsWith('Si geometric bridge tier ')) {
      const depositedSi = model.layers.find((layer) => layer.id === result.layerId);
      assert.ok(depositedSi, 'New Si bridge layer is missing');
      depositedSi.color = GAN_SILICON_COLOR;
    }
    const recipe = {
      ...params,
      face: kernel.face,
      area: maskId == null ? 'full' : 'mask',
      ...(maskId == null ? {} : { mask: maskContext(maskId) }),
    };
    if (command === 'deposit') {
      recipe.thicknessUm = params.thickness;
      delete recipe.thickness;
      recipe.coverage = params.coverage === 'transfer' ? 'transfer' : 'direct';
      if (params.coverage === 'transfer') recipe.placement = 'flat';
    } else {
      recipe.thicknessUm = params.depth;
      delete recipe.depth;
      delete recipe.targetId;
    }
    steps.push({ command, params: recipe });
    append({
      kind: command === 'deposit' ? 'add' : 'etch',
      label,
      face: kernel.face,
      areaMode: recipe.area,
      geometryChanged: true,
      ...(command === 'deposit'
        ? {
            name: kernel.name,
            thickness: kernel.thickness,
            growth: kernel.growth,
            resultLayerId: result.layerId,
            ...(kernel.growth === 'transfer' ? { transferMode: 'flat', transferGap: 0 } : {}),
          }
        : {
            thickness: kernel.thickness,
            etchProfile: 'directional',
            targetLayerIds: kernel.etchTargetLayerIds || [],
          }),
      replay: {
        version: 1,
        params: clone(kernel),
        areaMode: recipe.area,
        maskContext: maskId == null ? null : maskContext(maskId),
      },
    });
    return result;
  }
  function record(label, note) {
    model.revision++;
    model.processRevision++;
    steps.push({
      command: 'record',
      params: {
        label,
        process: 'custom',
        note,
        temperatureC: null,
        durationMin: null,
        ambient: null,
      },
    });
    append({
      kind: 'record',
      label,
      processType: 'custom',
      note,
      geometryChanged: false,
      replay: { version: 1, kind: 'record' },
    });
  }
  function etch(label, id, depth, targetId = null, face = 'front') {
    return process(label, 'etch', { depth, face, ...(targetId ? { targetId } : {}) }, id);
  }
  function deposit(label, material, thickness, id = null, coverage = 'direct') {
    return process(label, 'deposit', { material, thickness, coverage }, id);
  }
  append({
    kind: 'base',
    label: 'HR Si 400 um lower wafer',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  record(
    'Source fabrication: two 400 um Si wafers, double-sided DRIE, Si-Si direct bond',
    'Paper Fig. 2(a-c): two 400 um double-side-polished wafers; DRIE to 200 um on each face, stepped TSVs; wafer alignment/direct bonding. Current geometry operations cannot bond two previously processed 3D models. The following bridge-and-open sequence is an explicit single-model surrogate.',
  );
  etch('Lower chamber: 700 x 900 um, 200 um DRIE', 10, 200);
  for (const [index, maskId] of [10, 11, 12, 13].entries()) {
    const layer = deposit(
      'Flat-bridge 100 um Si cap ' + (index + 1) + ' (bonding surrogate)',
      'Si geometric bridge tier ' + (index + 1),
      DIMENSIONS.cap,
      null,
      'transfer',
    );
    etch(
      'Open bridge tier ' + (index + 1) + ' to underlying cavity',
      maskId,
      DIMENSIONS.cap,
      layer.layerId,
    );
  }
  bookmark('01 Four-level open microchannels / 800 um Si');
  // Do not draw a sealed, buried "coolant solid": the channel consists of
  // physically empty stack intervals. A fluid or CFD calculation is out of scope.
  for (const [point, cavityZ] of [
    [[30, 0], 550],
    [[200, 0], 450],
    [[280, 0], 350],
    [[340, 0], 250],
  ]) {
    const r = owner(point);
    assert.ok(
      r.stack.some((segment) => segment.layerId === 'base'),
      'Lower Si supporting region missing at ' + point,
    );
    assert.ok(
      r.stack.every((segment) => !(segment.z0 < cavityZ && segment.z1 > cavityZ)),
      'Expected real void at z=' + cavityZ + ' below step ' + point,
    );
  }
  const fingerCenter = owner([30, 0]);
  assert.equal(fingerCenter.stack.at(-1).z1, 0, 'Top straight channel must remain open');
  // Figure 2(i) depicts bottom-side fluid ports. Their aperture sizes and
  // XY placement are inferred; etching from Back reaches the real cavity
  // without placing solid "water" or drilling through the top HEMT.
  etch('Rear inlet and outlet ports opened to the lower fluid cavity', 21, 200, null, 'back');
  for (const y of [-415, 415]) {
    assert.ok(
      model.regions
        .filter((region) => vectorApi.pointInMulti([0, y], region.geom))
        .flatMap((region) => region.stack)
        .every((segment) => !(segment.z0 < -100 && segment.z1 > -100)),
      'Rear coolant port is not open at y=' + y,
    );
  }
  bookmark('02 Rear coolant inlet / outlet');
  // The published TSVs connect both sides electrically. Geometry is a real
  // through-bore; conformal Cu plating / NiPaAu barriers remain recorded,
  // rather than claiming a fully modeled metal-filled conductive via.
  etch('Four illustrative through-TSV bores (70 um inferred)', 14, 800);
  bookmark('03 TSV bores');
  record(
    'Thermal oxidation; double-side Ti/Cu 200/500 nm, Au plating and TSV Cu/NiPaAu',
    'Paper Fig. 2(c,d): continuous oxide, Ti/Cu (200/500 nm), Au; TSV electroplating Cu and NiPaAu coating. Metal/oxide placement inside bores is not modeled. No conductivity or metallurgical continuity is implied.',
  );
  const solderResult = deposit(
    'Peripheral AuSn solder support, 5 um thickness illustrative',
    'AuSn perimeter solder (5 um surrogate)',
    5,
    15,
  );
  assert.ok(solderResult.layerId);
  bookmark('04 AuSn peripheral supports');
  const sic = deposit(
    'Place thinned SiC chip as suspended flat bridge (99 um)',
    'GaN HEMT SiC substrate 99 um',
    99,
    16,
    'transfer',
  );
  assert.ok(sic.layerId);
  deposit('GaN buffer 1 um', 'GaN buffer 1 um', 1, 16);
  // AlGaN/SiN, exact passivation and contact thickness are unpublished;
  // the two metal examples below are illustrative visible pattern layers.
  deposit('Illustrative gate metal 0.2 um', 'Gate metal surrogate 0.2 um', 0.2, 18);
  deposit(
    'Illustrative source-drain contacts 0.2 um',
    'Source/drain metal surrogate 0.2 um',
    0.2,
    19,
  );
  bookmark('05 GaN-on-SiC HEMT with ten gate fingers');
  deposit('Illustrative GSG pads on interposer', 'GSG Au pads surrogate 0.5 um', 0.5, 20);
  record(
    'Au wire bonds to GSG and aluminum manifold assembly',
    'Paper Fig. 2(e,f) and SI Fig. S-5: AuSn-bonded HEMT and two GSG chips, gold wires, aluminum enclosure and coolant fittings. True curved wires, full package and coolant flow are not geometric model features.',
  );
  record(
    'Experimental thermal operating point (metadata only)',
    'Paper: DI water 3 mL/min, Vds approximately 7.5 V, Ids approximately 0.8 A, measured Tmax 93.8 C. Geometry model does not compute CFD, thermal or electrical results.',
  );
  bookmark('06 Integrated GaN HEMT / final');

  Object.assign(root, snapshot());
  root.name = 'GaN HEMT / 2.5D four-layer microchannels (paper-derived surrogate)';
  root.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: branch.headNodeId,
    cursorSnapshotId: branch.headSnapshotId,
    nodes,
    branches: [branch],
  };
  root.snapshots = bookmarks;
  validateProjectFile(root);
  const preflight = validateRecipeExecution(root.processRecipe.steps, {
    model,
    maskState: { layout: root.layout },
    base: root.processRecipe.base,
    startMode: 'new-base',
  });
  assert.deepEqual(preflight.errors, [], 'Recipe preflight failed');

  const stored = prepareProjectForWorkspaceStorage(root);
  const json = JSON.stringify(stored);
  const reopened = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(reopened);
  assert.deepEqual(reopened.model, root.model, 'Canonical geometry changed after Save/Reload');
  assert.equal(reopened.snapshotBranches.nodes.length, nodes.length);
  const validation = {
    doi: GAN_MICROCHANNEL_DOI,
    mode: 'geometry-surrogate-not-wafer-bond-simulation',
    pass: true,
    maskLayers: GAN_MICROCHANNEL_MASKS.length,
    processNodes: nodes.length,
    recipeSteps: steps.length,
    bookmarks: bookmarks.length,
    outputBytes: Buffer.byteLength(json),
    layers: model.layers.length,
    regions: model.regions.length,
    checkpoints,
  };
  return { project: root, json, validation };
}

async function main() {
  const { json, validation } = await buildGanMicrochannel();
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dir = process.argv.includes('--write-repo')
    ? join(root, 'site/examples')
    : join(root, 'test-results/gan-microchannel');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'gan-hemt-microchannel-2022.wafercad'), json);
  const reportDir = join(root, 'test-results/gan-microchannel');
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(
    JSON.stringify({
      pass: validation.pass,
      nodes: validation.processNodes,
      masks: validation.maskLayers,
      bytes: validation.outputBytes,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
