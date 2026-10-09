/**
 * MAGIC-1000 paper-derived local process reconstruction.
 * Source: Fan et al., Nature Electronics 9 (2026), DOI 10.1038/s41928-026-01641-0.
 * Physical route polygons and ILD clearance are inferred. This is NOT author GDS.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

const PAPER = '10.1038/s41928-026-01641-0';
const FIXED_DATE = '2026-10-09T08:00:00.000Z';
const MODEL_SIZE = [40, 24];
const RECEIVER_THICKNESS_UM = 2; // surrogate; silicon handle thickness not specified
const ILD_CLEARANCE_UM = 0.5; // Methods: CMP endpoint approximately 0.5 um above Al lines
const ILD_DEPOSIT_UM = 0.9; // overfill followed by CMP
const VIA_OVERFILL_UM = 0.05;
const METAL_STACK = [
  ['Ti adhesion', 0.01],
  ['TiN barrier', 0.02],
  ['Al conductor', 0.25],
  ['TiN cap barrier', 0.02],
  ['Ti capping', 0.01],
];
const copy = (obj) => structuredClone(obj);

function rect(x, y, w, h) {
  return { x, y, w, h };
}
function rectPoints(r) {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}
const MASKS = Object.freeze([
  { id: 11, name: 'M4 routing', rectangles: [rect(-15, -5.5, 30, 3), rect(-15, 2.5, 30, 3)] },
  { id: 12, name: 'V34', rectangles: [rect(-7.7, -4.7, 1.4, 1.4), rect(6.3, 3.3, 1.4, 1.4)] },
  { id: 13, name: 'M3 routing', rectangles: [rect(-8.5, -8, 3, 16), rect(5.5, -8, 3, 16)] },
  { id: 14, name: 'V23', rectangles: [rect(-7.7, -4.7, 1.4, 1.4), rect(6.3, 3.3, 1.4, 1.4)] },
  { id: 15, name: 'M2 routing', rectangles: [rect(-15, -5.5, 30, 3), rect(-15, 2.5, 30, 3)] },
  { id: 16, name: 'V12', rectangles: [rect(-7.7, -4.7, 1.4, 1.4), rect(6.3, 3.3, 1.4, 1.4)] },
  { id: 17, name: 'M1 routing', rectangles: [rect(-8.5, -8, 3, 16), rect(5.5, -8, 3, 16)] },
  {
    id: 18,
    name: 'Top via to W gates',
    rectangles: [rect(-7.6, 3.4, 1.2, 1.2), rect(6.4, 3.4, 1.2, 1.2)],
  },
  {
    id: 19,
    name: 'W gate areas',
    rectangles: [rect(-8.25, 3.2, 2.5, 1.6), rect(5.75, 3.2, 2.5, 1.6)],
  },
  {
    id: 20,
    name: 'MoS2 transfer area',
    rectangles: [rect(-8.2, 3.45, 2.4, 1.1), rect(5.8, 3.45, 2.4, 1.1)],
  },
  {
    id: 21,
    name: 'Source contact',
    rectangles: [rect(-8.1, 3.55, 0.75, 0.9), rect(5.9, 3.55, 0.75, 0.9)],
  },
  {
    id: 22,
    name: 'Drain contact',
    rectangles: [rect(-6.85, 3.55, 0.75, 0.9), rect(7.15, 3.55, 0.75, 0.9)],
  },
  { id: 23, name: 'D-mode AlOx doping', rectangles: [rect(-8.2, 3.45, 2.4, 1.1)] },
]);
const MASK_BY_ID = new Map(MASKS.map((mask) => [mask.id, mask]));

function makeLayout() {
  const elements = MASKS.flatMap((mask) =>
    mask.rectangles.map((r) => ({
      kind: 'polygon',
      sourceCell: 'MAGIC1000_LOCAL',
      layer: mask.id,
      datatype: 0,
      points: rectPoints(r),
    })),
  );
  return {
    name: 'MAGIC-1000 paper-derived local illustrative masks (not author GDS)',
    root: 'MAGIC1000_LOCAL',
    elements,
    linework: [],
    hierarchy: {},
    combos: MASKS.map((m) => ({
      key: 'MAGIC1000_LOCAL|' + m.id + '|0',
      cell: 'MAGIC1000_LOCAL',
      layer: m.id,
      datatype: 0,
      count: m.rectangles.length,
    })),
    bounds: { minX: -20, minY: -12, maxX: 20, maxY: 12, width: 40, height: 24 },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
function fileMask(id) {
  if (!MASK_BY_ID.has(id)) throw new Error('Unknown mask layer ' + id);
  return {
    sourceMode: 'file',
    cell: 'MAGIC1000_LOCAL',
    layerKeys: [id + '|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}

export async function buildMagic1000() {
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const vectorApi = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { classifyCoverageVoids } = await import('../site/process-topology.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');

  const model = modelApi.createModel({
    shape: 'rect',
    width: MODEL_SIZE[0],
    height: MODEL_SIZE[1],
    thickness: RECEIVER_THICKNESS_UM,
  });
  model.layers[0].name = 'Si handle (2um illustrated; thickness unreported)';
  const BASE = {
    shape: 'rect',
    width: MODEL_SIZE[0],
    height: MODEL_SIZE[1],
    thickness: RECEIVER_THICKNESS_UM,
    material: model.layers[0].name,
  };
  const root = projectForBenchmark({
    model,
    section: { a: [-10, 4], b: [10, 4] },
  });
  root.name = 'MAGIC-1000 MoS2 / four-level BEOL · local reconstruction';
  // Transparent inspection is essential: an opaque blanket dielectric would hide
  // every buried M1–M4 interconnect and W via in the Welcome 3D preview.
  root.display.threeOpacity = 0.36;
  root.layout = makeLayout();
  root.maskSourceMode = 'file';
  root.activeCell = root.layout.root;
  root.selectedLayerKeys = ['19|0'];
  root.drawMask = { nextShapeId: 1, shapes: [] };
  root.maskRoi = null;

  let parentId = null;
  const nodes = [];
  const bookmarks = [];
  const steps = [];
  const checkpoints = [];
  const layerIds = new Map();
  const branch = {
    id: 'main',
    name: 'MAGIC-1000 representative BEOL / MoS2',
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: FIXED_DATE,
    headState: null,
  };
  const baseBottomZ = -RECEIVER_THICKNESS_UM / 2;
  let planarTop = RECEIVER_THICKNESS_UM / 2;

  function dateAt(index) {
    return new Date(Date.parse(FIXED_DATE) + index * 1000).toISOString();
  }
  function capture() {
    const state = copy(root);
    delete state.snapshots;
    delete state.snapshotBranches;
    state.model = copy(model);
    state.processRecipe = normalizeProcessRecipe({
      name: 'MAGIC-1000 BEOL / MoS2 manufacturing sequence',
      base: BASE,
      steps,
    });
    return state;
  }
  function append(op) {
    const id = 'magic-step-' + String(nodes.length).padStart(2, '0');
    const node = {
      id,
      branchId: 'main',
      parentId,
      createdAt: dateAt(nodes.length),
      processRevision: model.processRevision,
      operation: op,
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
    const snapshot = {
      id: 'magic-bookmark-' + (bookmarks.length + 1),
      name,
      createdAt: dateAt(300 + bookmarks.length),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: copy(node.state),
    };
    bookmarks.unshift(snapshot);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = snapshot.id;
    branch.headSnapshotId = snapshot.id;
  }
  function regionAt(point) {
    return model.regions.find((r) => vectorApi.pointInMulti(point, r.geom)) || null;
  }
  function exposed(point) {
    const region = regionAt(point);
    assert.ok(region, 'No model region at ' + point);
    return region.stack.at(-1);
  }
  function areaOf(id) {
    if (id == null) return model.boundary;
    return vectorApi.unionGeometries(
      MASK_BY_ID.get(id).rectangles.map((r) =>
        vectorApi.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2),
      ),
    );
  }
  function validate(stage) {
    validateProcessModel(model);
    const bad = classifyCoverageVoids(model).all;
    assert.equal(bad.length, 0, stage + ': uncovered silicon XY footprint');
    const substrate = regionAt([0, 0]);
    assert.ok(
      substrate?.stack.some((s) => s.layerId === 'base' && s.z0 === baseBottomZ),
      stage + ': lost supporting silicon substrate',
    );
    checkpoints.push({
      stage,
      processRevision: model.processRevision,
      layers: model.layers.length,
      regions: model.regions.length,
    });
  }
  function execute(label, command, rawParams, maskId = null) {
    const area = areaOf(maskId);
    const p = {
      type:
        command === 'deposit'
          ? 'add'
          : command === 'etch'
            ? 'etch'
            : command === 'electrical'
              ? 'electrical'
              : command,
      face: 'front',
    };
    if (command === 'deposit') {
      Object.assign(p, {
        name: rawParams.material,
        thickness: rawParams.thickness,
        growth: rawParams.coverage || 'direct',
      });
      if (p.growth === 'transfer') p.transferMode = 'follow';
    } else if (command === 'etch') {
      Object.assign(p, {
        thickness: rawParams.depth ?? rawParams.targetZ,
        etchProfile: rawParams.profile || 'directional',
        ...(rawParams.profile === 'planarize' ? { targetZ: rawParams.targetZ } : {}),
      });
      if (rawParams.target) {
        assert.ok(layerIds.has(rawParams.target), 'Missing etch material ' + rawParams.target);
        p.etchTargetLayerIds = [layerIds.get(rawParams.target)];
      }
    } else if (command === 'electrical') {
      Object.assign(p, {
        name: rawParams.name,
        thickness: rawParams.depth,
        color: '#9a8de4',
        electricalRegionType: rawParams.regionType,
        electricalRegionSource: rawParams.source,
      });
    }
    const result =
      applyAdvancedProcessOperation(model, p, area, modelApi, vectorApi) ||
      modelApi.applyOperation(model, { ...p, area });
    assert.equal(result?.changed, true, label + ' failed: ' + (result?.error || 'no change'));
    if (command === 'deposit') {
      assert.ok(result.layerId);
      layerIds.set(rawParams.material, result.layerId);
    }
    const recipeParams = { ...rawParams, area: maskId == null ? 'full' : 'mask', face: 'front' };
    if (maskId != null) recipeParams.mask = fileMask(maskId);
    if (command === 'deposit') {
      recipeParams.thicknessUm = rawParams.thickness;
      delete recipeParams.thickness;
      recipeParams.coverage = rawParams.coverage || 'direct';
      if (p.growth === 'transfer') recipeParams.placement = 'follow';
    }
    if (command === 'etch') {
      recipeParams.thicknessUm = rawParams.depth ?? rawParams.targetZ;
      delete recipeParams.depth;
      delete recipeParams.targetZ;
    }
    if (command === 'electrical') {
      recipeParams.depthUm = rawParams.depth;
      delete recipeParams.depth;
    }
    steps.push({ command, params: recipeParams });
    const replay = {
      version: 1,
      params: copy(p),
      areaMode: maskId == null ? 'full' : 'mask',
      maskContext: maskId == null ? null : fileMask(maskId),
    };
    const operation = {
      kind: command === 'deposit' ? 'add' : command,
      label,
      face: 'front',
      areaMode: maskId == null ? 'full' : 'mask',
      geometryChanged: true,
      ...(command === 'deposit'
        ? {
            name: p.name,
            thickness: p.thickness,
            growth: p.growth,
            resultLayerId: result.layerId,
            ...(p.growth === 'transfer' ? { transferMode: 'follow', transferGap: 0 } : {}),
          }
        : command === 'etch'
          ? {
              thickness: p.thickness,
              targetLayerIds: p.etchTargetLayerIds || [],
              etchProfile: p.etchProfile,
              ...(p.targetZ != null ? { targetZ: p.targetZ } : {}),
            }
          : {
              name: p.name,
              thickness: p.thickness,
              regionType: p.electricalRegionType,
              source: p.electricalRegionSource,
            }),
      replay,
    };
    append(operation);
    validate(label);
    return result;
  }
  function record(label, process, note, temperatureC = null, durationMin = null, ambient = null) {
    model.revision++;
    model.processRevision++;
    const p = { label, process, note, temperatureC, durationMin, ambient };
    steps.push({ command: 'record', params: p });
    append({
      kind: 'record',
      label,
      processType: process,
      geometryChanged: false,
      note,
      temperatureC,
      durationMin,
      ambient,
      replay: { version: 1, kind: 'record' },
    });
    validate(label);
  }
  function deposit(label, material, thickness, maskId = null, coverage = 'direct') {
    return execute(label, 'deposit', { material, thickness, coverage }, maskId);
  }
  function selectiveEtch(label, target, depth, maskId) {
    return execute(label, 'etch', { target, depth, profile: 'directional' }, maskId);
  }
  function cmp(label, targetZ) {
    return execute(label, 'etch', { target: '', targetZ, profile: 'planarize' });
  }

  append({
    kind: 'base',
    label: 'Representative Si receiver; substrate thickness illustrative',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  deposit('PECVD isolation SiO2 300 nm', 'Isolation SiO2 300nm', 0.3);
  planarTop += 0.3;
  bookmark('00 Si / 300nm SiO2 isolation');

  for (const level of ['M4', 'M3', 'M2', 'M1']) {
    const index = { M4: 0, M3: 1, M2: 2, M1: 3 }[level];
    const routeMask = [11, 13, 15, 17][index];
    const viaMask = [12, 14, 16, 18][index];
    const viaName = ['V34', 'V23', 'V12', 'Via (to W gate)'][index];

    for (const [name, thickness] of METAL_STACK) {
      deposit(
        'Pattern ' + level + ' ' + name + ' ' + thickness * 1000 + 'nm',
        level + ' ' + name,
        thickness,
        routeMask,
      );
    }
    const conductorTop = planarTop + 0.31;
    const ildName = level + ' SiO2 interlayer dielectric';
    deposit('Deposit ' + level + ' SiO2 ILD overfill (surrogate)', ildName, ILD_DEPOSIT_UM);
    planarTop = Number((conductorTop + ILD_CLEARANCE_UM).toFixed(5));
    cmp('CMP above ' + level + ' to Z=' + planarTop + 'um', planarTop);

    const viaPoint = index % 2 === 0 ? [-7, -4] : [7, 4];
    // Via etch must stop on the Ti cap of the underlying metal.
    const above = exposed(viaPoint);
    assert.equal(
      above.layerId,
      layerIds.get(ildName),
      level + ' via opening does not start in SiO2',
    );
    selectiveEtch(
      'Etch ' + viaName + ' through ' + level + ' ILD',
      ildName,
      ILD_CLEARANCE_UM,
      viaMask,
    );
    const stop = exposed(viaPoint);
    assert.equal(
      stop.layerId,
      layerIds.get(level + ' Ti capping'),
      viaName + ' did not stop on underlying conductor',
    );
    const metal = deposit(
      'TiN/W fill ' + viaName + ' with deliberate overburden',
      viaName + ' W fill',
      ILD_CLEARANCE_UM + VIA_OVERFILL_UM,
      viaMask,
    );
    assert.ok(metal.layerId);
    cmp('CMP via ' + viaName + ' to Z=' + planarTop + 'um', planarTop);
    assert.equal(
      exposed(viaPoint).layerId,
      metal.layerId,
      viaName + ' metal not exposed after CMP',
    );
    bookmark('0' + (index + 1) + ' ' + level + ' metal / ILD / ' + viaName);
  }

  // Gate metal is integrated after the prefabricated four levels of Al wiring.
  // The article specifies a 400 nm W gate and <0.8 nm RMS polished surface.
  deposit('Define 400nm W bottom gates', 'W bottom gate 400nm', 0.4, 19);
  const gateTop = Number((planarTop + 0.4).toFixed(5));
  deposit('ILD overfill around W gates (illustrative)', 'Gate surround SiO2', 0.6);
  cmp('CMP W gates flat to Z=' + gateTop + 'um', gateTop);
  planarTop = gateTop;
  const gate = exposed([-7, 4]);
  assert.equal(
    gate.layerId,
    layerIds.get('W bottom gate 400nm'),
    'W gate not exposed for dielectric',
  );
  bookmark('05 Planarized W bottom gates');

  deposit('ALD HfO2 gate dielectric 10nm', 'ALD HfO2 10nm', 0.01, null, 'conformal');
  record(
    'BCl3 patterned HfO2 gate-access openings (off representative section)',
    'custom',
    'Paper reports HfO2 contact openings; not drawn through active W gate as their coordinates are unpublished.',
  );
  deposit(
    'Transfer monolayer CVD MoS2 by PMMA method',
    'Monolayer MoS2 (0.7nm illustrated)',
    0.0007,
    20,
    'transfer',
  );
  for (const point of [
    [-7, 4],
    [7, 4],
  ]) {
    const r = regionAt(point);
    const film = r?.stack.at(-1);
    assert.equal(film?.layerId, layerIds.get('Monolayer MoS2 (0.7nm illustrated)'));
    const below = r.stack.at(-2);
    assert.ok(
      Math.abs(film.z0 - below.z1) < 1e-7,
      'Transferred monolayer has artificial gap to gate dielectric',
    );
  }
  record(
    'MoS2 channel isolation by EBL and RIE',
    'custom',
    'The channel transfer mask represents the surviving MoS2 islands; original isolation GDS not provided.',
  );
  record(
    'Remove PMMA and forming-gas anneal',
    'anneal',
    'Paper: 350 C, 30 min in 5% hydrogen forming gas.',
    350,
    30,
    '5% H2 forming gas',
  );
  bookmark('06 HfO2 / MoS2 channel transferred');

  // Contact gap = 1.25 - 0.75 = 0.50 um (reported transistor channel length).
  for (const mask of [21, 22]) {
    const electrode = mask === 21 ? 'source' : 'drain';
    deposit('EBL ' + electrode + ' Sb 20nm', electrode + ' Sb 20nm', 0.02, mask);
    deposit('Lift-off ' + electrode + ' Au 40nm', electrode + ' Au 40nm', 0.04, mask);
  }
  record(
    'Controlled heating/cooling during Sb/Au evaporation',
    'custom',
    'Temperature profile during evaporation is not specified in the paper.',
  );
  bookmark('07 Completed E-mode MoS2 FETs and Sb/Au contacts');

  // ALD sub-stoichiometric AlOx locally dopes D-mode; its deposited
  // geometric thickness is not specified. Represent as a 10 nm visible
  // *surrogate*, with a separate non-electrical-physics region annotation.
  deposit(
    'Selective AlOx 10nm display surrogate on D-mode FET',
    'D-mode AlOx coating (10nm surrogate)',
    0.01,
    23,
  );
  execute(
    'D-mode n-doping electrical annotation (non-physical)',
    'electrical',
    {
      name: 'D-mode MoS2 n-doped / threshold-shift annotation',
      depth: 0.0007,
      regionType: 'n-type',
      source: 'doped',
    },
    23,
  );
  record(
    'TMA soaking cycles to adjust MoS2 D-mode threshold',
    'custom',
    'The paper tunes Vth by ALD TMA soak cycles; the exact cycles for each patterned transistor are not supplied.',
  );
  bookmark('08 D-mode and E-mode transistor pair / final');

  Object.assign(root, capture());
  root.name = 'MAGIC-1000 · four-layer Al BEOL + MoS2 D/E transistor pair';
  root.layout = makeLayout();
  root.selectedLayerKeys = ['19|0', '20|0', '21|0', '22|0', '23|0'];
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
  const loaded = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(loaded);
  assert.deepEqual(loaded.model, root.model, 'Lossless model round-trip differed');
  assert.equal(loaded.snapshotBranches.nodes.length, nodes.length);
  assert.equal(loaded.processRecipe.steps.length, steps.length);
  for (const n of loaded.snapshotBranches.nodes) {
    assert.ok(n.state?.model, 'History state was not restored: ' + n.id);
  }

  const validation = {
    pass: true,
    doi: PAPER,
    note: 'Paper-derived illustrative local BEOL masks; not author GDS.',
    modelFieldUm: MODEL_SIZE,
    siliconHandleSurrogateUm: RECEIVER_THICKNESS_UM,
    nonSourceAssumptions: [
      'A 40 x 24 um local illustrative routing window, not a measured GDS window.',
      'CMP clearance 0.5um is the approximate paper-reported endpoint; 0.9um SiO2 deposited overfill is an explicit reconstruction surrogate.',
      'Monolayer MoS2 illustrated at 0.7nm.',
      'Selective D-mode AlOx illustrated at 10nm; deposition thickness was not stated.',
      'HfO2 gate access etch is recorded but omitted from local gate stack geometry.',
      'A transistor pair and simplified interconnect topology, not a full 1433-transistor computer.',
    ],
    metalLayers: 4,
    vias: 4,
    processNodes: nodes.length,
    processRecipeSteps: steps.length,
    bookmarks: bookmarks.length,
    maskLayers: MASKS.map((m) => ({ layer: m.id, name: m.name, rectangles: m.rectangles.length })),
    checkpoints,
    finalRegions: model.regions.length,
    finalLayers: model.layers.length,
    outputBytes: Buffer.byteLength(json),
    checks: {
      kernelAfterEveryProcess: true,
      fullSiCoverageAfterEveryProcess: true,
      viaEtchStopsOnConductor: true,
      viaCMPLeavesExposedMetal: true,
      WGateExposedAfterCMP: true,
      monolayerTransferSupported: true,
      projectFileRoundTrip: true,
      recipePreflight: true,
    },
  };
  return { project: root, stored, json, validation };
}

async function main() {
  const { json, validation } = await buildMagic1000();
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const target = process.argv.includes('--write-repo')
    ? join(repo, 'site/examples')
    : join(repo, 'test-results/magic1000');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'magic-1000-mos2-beol.wafercad'), json);
  const reportDir = join(repo, 'test-results/magic1000');
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(
    JSON.stringify({
      pass: true,
      processNodes: validation.processNodes,
      maskLayers: validation.maskLayers.length,
      outputBytes: validation.outputBytes,
      output: join(target, 'magic-1000-mos2-beol.wafercad'),
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
