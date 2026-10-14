/**
 * M3D-LIME paper-derived, representative 3-tier RRAM/CNTFET fabrication replay.
 * Li et al., Nature Communications 14, 7140 (2023).
 * DOI: 10.1038/s41467-023-42981-1
 *
 * WARNING: Local routing polygons, CMOS foundations, pad/via footprints, CNT film
 * thickness, planarization heights and unit pitches are illustrative. The paper
 * does not provide its GDS or full transistor layouts. This example represents
 * 8 of 1024 CIM sites, 4 of 512 buffer bits and the demonstrated 5 x 1 2T2R TCAM.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

const PAPER = '10.1038/s41467-023-42981-1';
const FIXED_DATE = '2026-10-14T09:00:00.000Z';
const MODEL_SIZE = [240, 100];
const RECEIVER_THICKNESS_UM = 2; // visual surrogate for 130nm Si CMOS wafer
const copy = (obj) => structuredClone(obj);
const rect = (x, y, w, h) => ({ x, y, w, h });
function rectPoints(r) {
  return [[r.x,r.y], [r.x+r.w,r.y], [r.x+r.w,r.y+r.h], [r.x,r.y+r.h]];
}
// One physically replayable local layout, intentionally NOT the authors' GDS.
// A 20um-wide by 2um-long CNT channel matches the Methods/Supplementary width/length.
// Source/drain overlaps are reconstructed; the original contact polygons are absent.
const cimSites = Array.from({length:8}, (_, i) => rect(-108 + 10*i, -28, 5, 5));
const tcamChannels = Array.from({length:5}, (_, i) =>
  [rect(-4 + 19*i, -32, 2, 20), rect(-4 + 19*i, 8, 2, 20)]
).flat();
const bufferChannels = Array.from({length:4}, (_, i) => rect(-105 + i*19, 8, 2, 20));
const channels = [...bufferChannels, ...tcamChannels];
const drainContacts = channels.map(c => rect(c.x + 1.45, c.y, 1.2, c.h));
const sourceContacts = channels.map(c => rect(c.x - 0.65, c.y, 1.2, c.h));
const rramSites = drainContacts.map(c => rect(c.x+0.1,c.y+5,0.9,10));
const MASKS = Object.freeze([
  {id:11,name:'CMOS M4 landing pads / W vias (inferred)',rectangles:cimSites.map(c=>rect(c.x+1,c.y+1,3,3))},
  {id:12,name:'CIM 8 representative analog 1T1R sites',rectangles:cimSites},
  {id:13,name:'CIM top electrode contact holes / W vias',rectangles:cimSites.map(c=>rect(c.x+1.5,c.y+1.5,2,2))},
  {id:14,name:'CIM aluminium bit-line sample segments',rectangles:cimSites.map(c=>rect(c.x+1.5,-34,2,17))},
  {id:15,name:'BEOL CNTFET bottom gate 10 TCAM + 4 buffer',rectangles:channels.map(c=>rect(c.x-0.25,c.y,2.5,c.h))},
  {id:16,name:'Wet-transferred CNT channel / 20x2um',rectangles:channels},
  {id:17,name:'CNTFET Ti/Pd source',rectangles:sourceContacts},
  {id:18,name:'CNTFET Ti/Pd drain',rectangles:drainContacts},
  {id:19,name:'Binary RRAM Pd/TaOx/Ta2O5/Pt on drain',rectangles:rramSites},
  {id:20,name:'RRAM top contact passivation opening',rectangles:rramSites.map(c=>rect(c.x+0.1,c.y+1,0.7,8))},
  {id:21,name:'Top Ti/Pd local interconnects',rectangles:rramSites.map(c=>rect(c.x+0.1,c.y+1,0.7,8))},
]);
const MASK_BY_ID = new Map(MASKS.map(m => [m.id, m]));
function makeLayout() {
  const elements = MASKS.flatMap((mask) =>
    mask.rectangles.map((r) => ({
      kind: 'polygon',
      sourceCell: 'M3DLIME_LOCAL',
      layer: mask.id,
      datatype: 0,
      points: rectPoints(r),
    })),
  );
  return {
    name: 'M3D-LIME paper-derived local illustrative masks (not author GDS)',
    root: 'M3DLIME_LOCAL',
    elements,
    linework: [],
    hierarchy: {},
    combos: MASKS.map((m) => ({
      key: 'M3DLIME_LOCAL|' + m.id + '|0',
      cell: 'M3DLIME_LOCAL',
      layer: m.id,
      datatype: 0,
      count: m.rectangles.length,
    })),
    bounds: { minX: -120, minY: -50, maxX: 120, maxY: 50, width: 240, height: 100 },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
function fileMask(id) {
  if (!MASK_BY_ID.has(id)) throw new Error('Unknown mask layer ' + id);
  return {
    sourceMode: 'file',
    cell: 'M3DLIME_LOCAL',
    layerKeys: [id + '|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}

export async function buildM3DLime() {
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
  model.layers[0].name = '130nm CMOS silicon base (2um visual surrogate)';
  const BASE = {
    shape: 'rect',
    width: MODEL_SIZE[0],
    height: MODEL_SIZE[1],
    thickness: RECEIVER_THICKNESS_UM,
    material: model.layers[0].name,
  };
  const root = projectForBenchmark({
    model,
    section: { a: [-110, -23], b: [100, -23] },
  });
  root.name = 'M3D-LIME MoS2 / four-level BEOL · local reconstruction';
  // Transparent inspection is essential: an opaque blanket dielectric would hide
  // every buried M1–M4 interconnect and W via in the Welcome 3D preview.
  root.display.threeOpacity = 0.28;
  // Low-oblique view exposes stacked BEOL sidewalls while retaining the top FET pair.
  // Camera affects presentation only; XY and Z process geometry remain untouched.
  root.display.threeCamera = {
    position: [340, -245, 95],
    target: [0, 0, 2.3],
    fov: 34,
  };
  root.layout = makeLayout();
  root.maskSourceMode = 'file';
  root.activeCell = root.layout.root;
  root.selectedLayerKeys = ['12|0', '15|0', '19|0'];
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
    name: 'M3D-LIME representative BEOL / MoS2',
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
      name: 'M3D-LIME BEOL / MoS2 manufacturing sequence',
      base: BASE,
      steps,
    });
    return state;
  }
  function append(op) {
    const id = 'lime-step-' + String(nodes.length).padStart(2, '0');
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
      id: 'lime-bookmark-' + (bookmarks.length + 1),
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
    label: '130nm foundry CMOS substrate / exposed M4 W via landing (schematic)',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  record('130nm Si CMOS foundry processing through M4','custom',
    'Foundry logic, word-line decoder and Si access transistors are represented by the Si receiver and patterned landing pads; transistor FEOL dimensions and original GDS were not published.');
  deposit('Exposed W M4 landing structures / local geometry surrogate','CMOS M4 W contacts (surrogate)',0.10,11);
  deposit('BEOL isolation SiO2 400nm (reconstructed)','First level SiO2 400nm',0.40);
  cmp('Planarize to M4 + 150nm clearance (inferred)',1.25);
  selectiveEtch('Open CMOS via to M4 W','First level SiO2 400nm',0.15,11);
  deposit('Fill W landing vias (inferred)','M4 W via fill',0.20,11);
  cmp('CMP W via plugs to reconstructed Z 1.25um',1.25);
  bookmark('00 Si CMOS / W contact landing');

  // Tier 2 analog device: published TiN 30 / HfAlOx 8 / TaOx 45 / TiN 30nm.
  deposit('Sputter TiN bottom electrode 30nm','CIM TiN BE 30nm',0.030,12);
  deposit('ALD HfAlOx analog switching layer 8nm at 300C','CIM HfAlOx RSL 8nm',0.008,12);
  deposit('Sputter TaOx thermal enhanced layer 45nm','CIM TaOx TEL 45nm',0.045,12);
  deposit('Sputter TiN top electrode 30nm','CIM TiN TE 30nm',0.030,12);
  record('Pattern TiN/HfAlOx/TaOx/TiN using Cl RIE','etch',
    'Local RRAM column polygons represent the surviving stack; source states lithography followed by Cl-based RIE.');
  bookmark('01 Analog CIM 1T1R RRAM stack');
  deposit('PECVD SiO2 encapsulation 400nm at 300C','CIM SiO2 passivation 400nm',0.40);
  cmp('CIM passivation CMP endpoint Z 1.43um (inferred)',1.43);
  selectiveEtch('Open TiN top electrode contact through oxide','CIM SiO2 passivation 400nm',0.067,13);
  deposit('W plugs to CIM TiN TE (inferred)','CIM W top vias',0.083,13);
  cmp('Planarize CIM W plugs Z 1.43um',1.43);
  deposit('Sputter/pattern Al 500nm bit lines','CIM Al bit lines 500nm',0.500,14);
  bookmark('02 CIM passivation / W vias / Al bit lines');

  // The source deposits 100nm SiO2 + 900nm Si3N4 and planarizes before TCAM.
  deposit('PECVD SiO2 interlayer dielectric 100nm','CIM-to-TCAM SiO2 ILD 100nm',0.100);
  deposit('PECVD Si3N4 interlayer dielectric 900nm','CIM-to-TCAM Si3N4 ILD 900nm',0.900);
  cmp('ILD CMP endpoint Z 2.20um (inferred)',2.20);
  record('Open inter-layer contact holes to TCAM','etch',
    'The paper does not publish complete ILV GDS: connections to the upper memory tier are a process record, not fabricated surrogate tunnels.');
  bookmark('03 Inter-layer dielectric / planarization');

  // Tier 3 back-gated CNTFET: the metal and dielectric thicknesses are sourced.
  deposit('Pattern Ti gate adhesion 10nm','CNT gate Ti bottom 10nm',0.010,15);
  deposit('Pattern Pd gate metal 15nm','CNT gate Pd 15nm',0.015,15);
  deposit('Pattern Ti gate cap 1nm','CNT gate Ti cap 1nm',0.001,15);
  deposit('ALD HfO2 gate dielectric 10nm at 250C','CNT gate HfO2 10nm',0.010);
  record('Lithography/Cl RIE HfO2 gate access (off representative slice)','etch',
    'Gate via locations are not disclosed; the reconstructed active gate dielectric is retained intact.');
  deposit('Wet transfer / clean CNT network (1nm visual surrogate)','CNT channel 1nm SURROGATE',0.001,16,'transfer');
  record('PCz removal, solvent wash and CNT channel O2 plasma pattern','clean',
    'Wet transfer and oxygen-plasma channel isolation; individual nanotubes and PCz are not resolved in this geometric model.');
  bookmark('04 CNT channels over back gates');
  deposit('Evaporate Ti source adhesion 1nm','CNT source Ti 1nm',0.001,17);
  deposit('Evaporate Pd source 45nm','CNT source Pd 45nm',0.045,17);
  deposit('Evaporate Ti drain adhesion 1nm','CNT drain Ti 1nm',0.001,18);
  deposit('Evaporate Pd drain 45nm','CNT drain Pd 45nm',0.045,18);
  bookmark('05 CNTFET source/drain metallization');

  // Y 10nm converts in air to Y2O3; an explicit geometry surrogate, no oxidation solver.
  record('Evaporate 10nm Y / oxidize in air at 250C','oxidation',
    'Y2O3 layer geometry uses a 10nm thickness surrogate; post-oxidation thickness was not reported.');
  deposit('Y2O3 interface layer 10nm geometric surrogate','Y2O3 interface SURROGATE 10nm',0.010);
  deposit('ALD Al2O3 passivation 35nm at 250C','CNT Al2O3 passivation 35nm',0.035);
  deposit('ALD HfO2 passivation 10nm at 250C','CNT HfO2 passivation 10nm',0.010);
  selectiveEtch('Open HfO2 above digital RRAM landing','CNT HfO2 passivation 10nm',0.010,19);
  selectiveEtch('Open Al2O3 above digital RRAM landing','CNT Al2O3 passivation 35nm',0.035,19);
  selectiveEtch('Wet open Y2O3 above Pd drain','Y2O3 interface SURROGATE 10nm',0.010,19);
  bookmark('06 CNTFET passivation / Pd drain access');

  // Tier 3 binary RRAM includes TCAM 2T2R and buffer 1T1R in the same tier.
  deposit('Sputter TaOx oxygen reservoir 20nm','Digital TaOx ORL 20nm',0.020,19);
  deposit('Sputter Ta2O5 switching layer 10nm','Digital Ta2O5 RSL 10nm',0.010,19);
  deposit('Sputter Pt digital RRAM electrode 10nm','Digital Pt TE 10nm',0.010,19);
  record('Pattern Pt/Ta2O5/TaOx with 60nm Pd hard mask and dry etch','etch',
    'Pd hard-mask lithography and etch are recorded; stack footprints are already restricted to inferred sites.');
  bookmark('07 CNTFET + Ta2O5 RRAM / buffer + 2T2R TCAM');
  deposit('ALD Al2O3 RRAM protection 45nm at 150C','Digital Al2O3 passivation 45nm',0.045);
  selectiveEtch('Open top Pt contact through Al2O3','Digital Al2O3 passivation 45nm',0.045,20);
  deposit('Top Ti interconnect adhesion 20nm','Top Ti interconnect 20nm',0.020,21);
  deposit('Top Pd interconnect 120nm','Top Pd interconnect 120nm',0.120,21);
  record('Connect ML/SL/SEL externally for TCAM testing','custom',
    'Only local connection stubs are modeled; continuous ML/SL/SEL routing and test pad coordinates are not supplied. Sense amplifiers and programming/ADC circuitry were off chip in the experimental demonstration.');
  bookmark('08 3-tier M3D-LIME representative fabricated devices');
  Object.assign(root, capture());
  root.name = 'M3D-LIME · four-layer Al BEOL + MoS2 D/E transistor pair';
  root.layout = makeLayout();
  root.selectedLayerKeys = ['12|0', '15|0', '16|0', '19|0', '21|0'];
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
    reconstruction: 'representative physical local 3-tier topology; NOT the author GDS',
    modelFieldUm: MODEL_SIZE,
    siliconHandleSurrogateUm: RECEIVER_THICKNESS_UM,
    demonstratedArraySizes: { cim: 1024, buffer: 512, tcamCells: 5 },
    representedCellCounts: { cim: cimSites.length, buffer: bufferChannels.length, tcamCells: 5 },
    transistorChannelWUm: 20,
    transistorChannelLUm: 2,
    declaredAssumptions: [
      'Silicon handle thickness, CMOS FEOL devices, M4 routes and W landing footprints inferred.',
      'All local array pitches, analogue RRAM footprints, top interconnects and test routing inferred.',
      'CIM 1k-bit and buffer 512-bit arrays are sampled; five 2T2R TCAM cells are represented.',
      'All three CMP endpoints were inferred to enable geometric contact openings.',
      'CNT network rendered as 1nm surrogate rather than physical tube-level geometry.',
      'Y to Y2O3 thermal conversion is a process record with a 10nm display surrogate.',
      'Off-chip ADC, programming and TCAM sense amplifiers are intentionally absent.',
      'Inter-layer vias between CIM and buffer are recorded but not claimed physically connected.',
    ],
    processNodes: nodes.length,
    processRecipeSteps: steps.length,
    bookmarks: bookmarks.length,
    maskLayers: MASKS.map(m => ({ layer:m.id, name:m.name, rectangles:m.rectangles.length })),
    checkpoints,
    finalRegions: model.regions.length,
    finalLayers: model.layers.length,
    outputBytes: Buffer.byteLength(json),
    checks: {
      kernelAfterEveryProcess: true,
      substrateCoverage: true,
      materialStackOrder: true,
      projectFileRoundTrip: true,
      recipePreflight: true,
    },
  };
  return { project: root, stored, json, validation };
}

async function main() {
  const { json, validation } = await buildM3DLime();
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const target = process.argv.includes('--write-repo')
    ? join(repo, 'site/examples')
    : join(repo, 'test-results/m3d-lime');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'm3d-lime-rram-cntfet.wafercad'), json);
  const reportDir = join(repo, 'test-results/m3d-lime');
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(
    JSON.stringify({
      pass: true,
      processNodes: validation.processNodes,
      maskLayers: validation.maskLayers.length,
      outputBytes: validation.outputBytes,
      output: join(target, 'm3d-lime-rram-cntfet.wafercad'),
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
