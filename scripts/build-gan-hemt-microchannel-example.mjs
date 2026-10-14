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

const CHANNEL_CENTERS = Object.freeze(Array.from({ length: 6 }, (_, i) => (i - 2.5) * 60));
const fingers = CHANNEL_CENTERS.map((x) => centered(30, 760, x));

// Fig. 1(c) and Fig. 2(h) show symmetric rounded inlet/outlet fan-outs,
// connecting six straight lanes to a smaller central throat. The author GDS
// is unavailable: these contours/positions are an explicit inferred model.
// A circularly rounded polyline is approximated by deterministic short bends
// so the same source polygons can drive Kernel, Recipe replay, GDS and OAS.
export const GAN_MANIFOLD_PARAMETERS = Object.freeze({
  throatWidth: 110,
  throatLength: 50,
  throatOffset: 425,
  branchHalfWidth: 12,
  startY: 355,
  endY: 430,
});
function stripeAroundPolyline(points, halfWidth = GAN_MANIFOLD_PARAMETERS.branchHalfWidth) {
  const normals = points.map((p, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dx, dy);
    assert.ok(length > 0, 'Manifold branch contains a zero-length segment');
    return [-dy / length, dx / length];
  });
  const left = points.map(([x, y], i) => [x + normals[i][0] * halfWidth, y + normals[i][1] * halfWidth]);
  const right = points.map(([x, y], i) => [x - normals[i][0] * halfWidth, y - normals[i][1] * halfWidth]);
  return [...left, ...right.reverse()];
}
export function ganManifoldCenterline(centerX, side) {
  assert.ok(CHANNEL_CENTERS.includes(centerX) && [-1, 1].includes(side));
  return [
    [centerX, side * 355],
    [centerX, side * 370],
    [centerX * 1.03, side * 382],
    [centerX * 0.91, side * 395],
    [centerX * 0.67, side * 407],
    [centerX * 0.4, side * 419],
    [centerX * 0.22, side * 430],
  ];
}
const manifoldBranches = [-1, 1].flatMap((side) =>
  CHANNEL_CENTERS.map((x) => stripeAroundPolyline(ganManifoldCenterline(x, side))),
);

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
    id: 22,
    name: 'Inlet/outlet rounded diversion branches (inferred from Fig. 2h)',
    rectangles: [
      centered(110, 50, 0, -425),
      centered(110, 50, 0, 425),
    ],
    polygons: manifoldBranches,
  },
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
      [...mask.rectangles.map(corners), ...(mask.polygons || [])].map((points) => ({
        kind: 'polygon',
        sourceCell: cell,
        layer: mask.id,
        datatype: 0,
        points,
      })),
    ),
    linework: [],
    hierarchy: {},
    combos: GAN_MICROCHANNEL_MASKS.map((mask) => ({
      key: cell + '|' + mask.id + '|0',
      cell,
      layer: mask.id,
      datatype: 0,
      count: mask.rectangles.length + (mask.polygons?.length || 0),
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
  // Default auto Z-break hides the scientific core of this 800 um device.
  // Keep 1:1 actual Z material geometry and make all four channel tiers visible.
  // Users can explicitly enable Z-break later to collapse only lower bulk Si.
  root.display.sectionCollapse = { top: 0, bottom: -150, enabled: false };
  root.display.threeOpacity = 0.56;
  root.display.threeShowBorders = false;
  // Saved inspection ROI is display-only: it is NOT a Process / Mask limiter.
  // Open the full structure by clearing ROI. The default view focuses on
  // microfluidic contact rather than an opaque 6 x 5 mm silicon slab.
  // Open the 3D view with a physically faithful *half-device cutaway*.
  // The Y=0 ROI edge intersects the published A-B section and exposes the
  // four-level void without editing any Process model solids.
  root.roi = { type: 'rect', a: [-650, 0], b: [650, 650] };
  // Main should open with the package/chip visible at useful pixel size.
  // Mask intentionally retains the full 6 x 5 mm published-scale context.
  root.planViews.main.zoom = 2.5;
  root.display.threeCamera = {
    position: [1050, -1650, 1120],
    target: [0, 0, 370],
    fov: 36,
  };
  root.layout = makeLayout();
  root.maskSourceMode = 'file';
  root.activeCell = root.layout.root;
  root.selectedLayerKeys = ['10|0', '11|0', '12|0', '13|0', '22|0', '18|0'];
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
    const mask = byId.get(id);
    assert.ok(mask, 'Unknown mask ' + id);
    return vectorApi.unionGeometries([
      ...mask.rectangles.map((r) => vectorApi.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2)),
      ...(mask.polygons || []).map((points) => [[ [...points, points[0]] ]]),
    ]);
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
  function etch(label, id, depth, targetId = null, face = 'front', target = null) {
    return process(label, 'etch', { depth, face, ...(targetId ? { targetId } : {}), ...(target ? { target } : {}) }, id);
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
  let finalBridgeLayerId = null;
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
    if (index === 3) finalBridgeLayerId = layer.layerId;
  }
  assert.ok(finalBridgeLayerId, 'Missing top Si bridge for diversion DRIE');
  // Separate XY mask and History operation: the manifold fan-outs cross the
  // silicon ribs only at the ends of the six channels, where the curved
  // branches converge into a port-facing throat. The top cap is etched
  // through to the underlying chamber; no coolant solid is inserted.
  etch(
    'Open twin six-branch coolant diversion manifolds (Fig. 2h surrogate)',
    22,
    100,
    finalBridgeLayerId,
    'front',
    'Si geometric bridge tier 4',
  );
  bookmark('01 Four-level open microchannels / 800 um Si with diversion');
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

  // Production builder invariants: verify actual material occupancy, never
  // mistake the translucent internal walls of a TSV for a filled metal post.
  // Separate unit tests repeat these checks on the persisted project.
  function materialAt(point, z) {
    return model.regions.some(
      (region) =>
        vectorApi.pointInMulti(point, region.geom) &&
        region.stack.some((segment) => segment.z0 < z && segment.z1 > z),
    );
  }
  for (const x of [-1450, 1450]) {
    for (const y of [-950, 950]) {
      for (const z of [-150, 50, 250, 450, 550]) {
        assert.equal(materialAt([x, y], z), false, 'TSV void filled at ' + [x, y, z]);
        assert.equal(materialAt([x + 43, y], z), true, 'Missing TSV sidewall at ' + [x, y, z]);
      }
    }
  }
  // A structural fluid network requires continuous *void*, rather than two
  // isolated ports or visually touching masks. Follow every buffered branch
  // from the back-side entrance up through the stepped lower chamber and into
  // the six top channels. Interpolate each 3D segment at <=5 um intervals.
  function assertFluidPath(points, name) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const n = Math.max(1, Math.ceil(Math.hypot(...a.map((v, k) => b[k] - v)) / 5));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const [x, y, z] = a.map((v, k) => v + (b[k] - v) * t);
        assert.equal(
          materialAt([x, y], z),
          false,
          'Coolant path disconnected (' + name + ') at ' + [x, y, z],
        );
      }
    }
  }
  for (const side of [-1, 1]) {
    const upstream = [
      [0, side * 415, -150],
      [0, side * 415, 350],
      [30, side * 395, 350],
      [30, side * 395, 550],
      [0, side * 425, 550],
    ];
    assertFluidPath(upstream, 'rear port ' + side + ' to distribution throat');
    for (const channelX of CHANNEL_CENTERS) {
      const centerline = ganManifoldCenterline(channelX, side).map(([x, y]) => [x, y, 550]);
      assertFluidPath(
        [
          [channelX, side * 300, 550],
          ...centerline,
          [0, side * 425, 550],
        ],
        'fanout ' + side + ' / channel ' + channelX,
      );
    }
  }
  // The manifold is a *local* diversion, not a blanket top DRIE removal.
  assert.equal(materialAt([0, 0], 550), true, 'Inter-channel silicon ribs were erased');
  assert.equal(materialAt([220, 400], 550), true, 'Manifold etched beyond its own footprint');

  const cooledSiC = model.layers.find((layer) => layer.name === 'GaN HEMT SiC substrate 99 um');
  assert.ok(cooledSiC, 'SiC chip is missing');
  const cooledSegments = owner([30, 0]).stack.filter((segment) => segment.layerId === cooledSiC.id);
  assert.equal(cooledSegments.length, 1, 'No distinct SiC bottom over central channel');
  assert.equal(cooledSegments[0].z0, 605, 'Unexpected SiC/AuSn stand-off');
  assert.equal(cooledSegments[0].z1 - cooledSegments[0].z0, 99);
  assert.equal(materialAt([30, 0], 604.99), false, 'SiC backside is coolant-obstructed');
  const siMaterials = model.layers.filter(
    (layer) => layer.id === 'base' || layer.name.startsWith('Si geometric bridge tier '),
  );
  assert.equal(siMaterials.length, 5);
  assert.ok(siMaterials.every((layer) => layer.color === GAN_SILICON_COLOR));

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
    checks: {
      fourTSVsAreTrueVoidColumns: true,
      SiCBacksideContactsCoolantVoid: true,
      fiveDistinctSiliconLayerIdsShareMaterialColor: true,
      bothBacksidePortsConnectToAllSixTopChannels: true,
      retainedInterChannelSiRibs: true,
    },
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
