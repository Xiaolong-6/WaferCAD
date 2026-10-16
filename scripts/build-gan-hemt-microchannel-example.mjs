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

export const GAN_LOWER_FEED = Object.freeze({
  portOffsetY: 1450,
  routeCenterY: 1000,
  routeLength: 1100,
  routeWidth: 110,
});
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
    const dx = after[0] - before[0],
      dy = after[1] - before[1];
    const length = Math.hypot(dx, dy);
    assert.ok(length > 0, 'Manifold branch contains a zero-length segment');
    return [-dy / length, dx / length];
  });
  const left = points.map(([x, y], i) => [
    x + normals[i][0] * halfWidth,
    y + normals[i][1] * halfWidth,
  ]);
  const right = points.map(([x, y], i) => [
    x - normals[i][0] * halfWidth,
    y - normals[i][1] * halfWidth,
  ]);
  return [...left, ...right.reverse()];
}
export function ganManifoldCenterline(centerX, side) {
  assert.ok(CHANNEL_CENTERS.includes(centerX) && [-1, 1].includes(side));
  // Nested return loops are visible in Fig. 2h. Outer lanes must travel
  // farther around the collection throat than the inner lanes do. These
  // contours are still inferred, not digitized author GDS.
  const distance = (Math.abs(centerX) - 30) / 120;
  const bend = distance ** 1.3;
  const outward = Math.sign(centerX);
  return [
    [centerX, side * 355],
    [centerX, side * 374],
    [centerX + outward * 6 * distance, side * (386 + 12 * bend)],
    [centerX + outward * 9 * distance, side * (394 + 37 * bend)],
    [centerX + outward * 4 * distance, side * (403 + 61 * bend)],
    [centerX * 0.88, side * (410 + 67 * bend)],
    [centerX * 0.7, side * (414 + 63 * bend)],
    [centerX * 0.43, side * (418 + 40 * bend)],
    [centerX * 0.24, side * (422 + 14 * bend)],
    [centerX * 0.22, side * 425],
  ];
}
const manifoldBranches = [-1, 1].flatMap((side) =>
  CHANNEL_CENTERS.map((x) => stripeAroundPolyline(ganManifoldCenterline(x, side))),
);

// Electrical heterointerface thicknesses were not reported by the article.
// Use inspectable physical-scale surrogates; 2DEG is not a solid wafer layer.
export const GAN_HEMT_STACK = Object.freeze({
  barrierUm: 0.025,
  isolationSiNUm: 0.15,
});
export const GAN_GSG_STACK = Object.freeze({
  chipWidthUm: 220,
  chipHeightUm: 350,
  substrateThicknessUm: 100, // INFERRED: source does not give GSG die thickness
  solderUm: 5, // INFERRED: original support standoff not reported
  goldPadUm: 0.5, // INFERRED: illustrative top contacts
});
const chipWidth = 878.5;
const chipHeight = 1120;
const activeWidth = 303;
const activeHeight = 393;
const isolationFrame = [
  ...[-1, 1].map((side) =>
    centered((chipWidth - activeWidth) / 2, chipHeight, (side * (chipWidth + activeWidth)) / 4, 0),
  ),
  ...[-1, 1].map((side) =>
    centered(
      activeWidth,
      (chipHeight - activeHeight) / 2,
      0,
      (side * (chipHeight + activeHeight)) / 4,
    ),
  ),
];
export const GAN_TSV_LINER = Object.freeze({
  boreWidth: 70,
  localMaskWindow: 90,
  // The source reports an outer SiO2 insulator but not its thickness.
  // This native conformal deposit is restricted to four TSV windows;
  // whole-outside-surface oxide remains explicitly UNMODELED.
  inferredLocalSiO2Um: 0.5,
  inferredExposedExteriorSiO2Um: 0.5,
  titaniumUm: 0.2,
  copperUm: 0.5,
  inferredFullCuFillUm: 35,
});
const tsvCenters = [-1450, 1450].flatMap((x) => [-950, 950].map((y) => [x, y]));
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
  {
    id: 23,
    name: 'Two inferred lower supply/return trenches (Fig. 1a surrogate)',
    rectangles: [-1, 1].map((side) =>
      centered(
        GAN_LOWER_FEED.routeWidth,
        GAN_LOWER_FEED.routeLength,
        0,
        side * GAN_LOWER_FEED.routeCenterY,
      ),
    ),
  },
  { id: 11, name: 'Lower transition 600 x 860 um (inferred)', rectangles: [centered(600, 860)] },
  { id: 12, name: 'Upper transition 480 x 820 um (inferred)', rectangles: [centered(480, 820)] },
  { id: 13, name: 'Six 30 um parallel channels (count inferred)', rectangles: fingers },
  {
    id: 22,
    name: 'Inlet/outlet rounded diversion branches (inferred from Fig. 2h)',
    rectangles: [centered(110, 50, 0, -425), centered(110, 50, 0, 425)],
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
    id: 25,
    name: 'Four local oxide/Ti/Cu coating windows with exposed TSV silicon rim',
    rectangles: tsvCenters.map(([x, y]) =>
      centered(GAN_TSV_LINER.localMaskWindow, GAN_TSV_LINER.localMaskWindow, x, y),
    ),
  },
  {
    id: 21,
    name: 'Rear coolant inlet and outlet bores (inferred)',
    rectangles: [-1, 1].map((side) => centered(100, 60, 0, side * GAN_LOWER_FEED.portOffsetY)),
  },
  { id: 15, name: 'Peripheral AuSn solder supports (inferred)', rectangles: solder },
  { id: 16, name: 'GaN HEMT die 878.5 x 1120 um', rectangles: [chip] },
  { id: 17, name: 'HEMT active footprint 303 x 393 um', rectangles: [centered(303, 393)] },
  {
    id: 24,
    name: 'Inferred peripheral SiN isolation/passivation frame',
    rectangles: isolationFrame,
  },
  { id: 18, name: 'Ten 0.5 x 300 um gate fingers', rectangles: gateFingers },
  {
    id: 19,
    name: 'Illustrative source and drain contact pads',
    rectangles: [centered(60, 370, -225), centered(60, 370, 225)],
  },
  {
    id: 26,
    name: 'Two GSG die footprints (dimensions inferred)',
    rectangles: [-1250, 1250].map((x) =>
      centered(GAN_GSG_STACK.chipWidthUm, GAN_GSG_STACK.chipHeightUm, x),
    ),
  },
  {
    id: 27,
    name: 'Independent GSG AuSn solder footprints (inferred)',
    rectangles: [-1250, 1250].map((x) => centered(200, 330, x)),
  },
  {
    id: 20,
    name: 'Three inferred Au GSG contacts on each die',
    rectangles: [-1250, 1250].flatMap((x) => [-95, 0, 95].map((y) => centered(160, 60, x, y))),
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
    section: { a: [30, -1700], b: [30, 1700] },
  });
  root.name = 'GaN HEMT / four-level Si microchannel (Lian 2022 surrogate)';
  // Default auto Z-break hides the scientific core of this 800 um device.
  // Keep 1:1 actual Z material geometry and make all four channel tiers visible.
  // Users can explicitly enable Z-break later to collapse only lower bulk Si.
  root.display.sectionCollapse = { top: 0, bottom: -150, enabled: false };
  root.display.threeOpacity = 0.56;
  root.display.threeShowBorders = false;
  // Inspect one longitudinal side of both port-fed lower channels and the
  // full stepped cavity; ROI affects only the display, not physical geometry.
  root.roi = { type: 'rect', a: [0, -1650], b: [650, 1650] };
  // Main should open with the package/chip visible at useful pixel size.
  // Mask intentionally retains the full 6 x 5 mm published-scale context.
  root.planViews.main.zoom = 2.5;
  root.display.threeCamera = {
    position: [-1700, -2250, 1500],
    target: [200, 0, 330],
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
  function bookmark(name, inspectionView = null) {
    const node = nodes.at(-1);
    const state = clone(node.state);
    // History nodes represent physical process state; an inspection bookmark
    // may deliberately use another camera/Section without mutating geometry.
    if (inspectionView) {
      state.roi = clone(inspectionView.roi);
      state.section = clone(inspectionView.section);
      state.display.threeCamera = clone(inspectionView.threeCamera);
    }
    const id = 'gan-microchannel-bookmark-' + (bookmarks.length + 1);
    const item = {
      id,
      name,
      createdAt: new Date(Date.parse(DATE) + 200000 + bookmarks.length * 1000).toISOString(),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state,
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
      ...(mask.polygons || []).map((points) => [[[...points, points[0]]]]),
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
        growth:
          params.coverage === 'transfer'
            ? 'transfer'
            : params.coverage === 'conformal'
              ? 'conformal'
              : 'direct',
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
    if (command === 'deposit' && params.material.startsWith('GSG ')) {
      const layer = model.layers.find((candidate) => candidate.id === result.layerId);
      assert.ok(layer, 'GSG deposition did not produce a material layer');
      layer.color = params.material.startsWith('GSG Au pads')
        ? '#D8A83A'
        : params.material.startsWith('GSG AuSn')
          ? '#B78F69'
          : '#8095A7';
    }
    if (
      command === 'deposit' &&
      (params.material.startsWith('TSV SiO2') ||
        params.material.startsWith('Interposer front exposed-surface SiO2') ||
        params.material.startsWith('Interposer back exposed-surface SiO2'))
    ) {
      const oxide = model.layers.find((layer) => layer.id === result.layerId);
      assert.ok(oxide, 'Local TSV oxide deposition produced no layer');
      oxide.color = '#B9DCE8';
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
      recipe.coverage =
        params.coverage === 'transfer'
          ? 'transfer'
          : params.coverage === 'conformal'
            ? 'conformal'
            : 'direct';
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
    return process(
      label,
      'etch',
      { depth, face, ...(targetId ? { targetId } : {}), ...(target ? { target } : {}) },
      id,
    );
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
  // Distinct lower feeders connect the remote inlet/outlet into the
  // existing central 700 x 900 um cavity. Dimensions are inferred.
  etch('Two lower supply/return route trenches (inferred)', 23, 200);
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
  // The complete-device default half-cut hides the other manifold behind
  // the chip. The earliest process-stage bookmark has its own fluid-only
  // camera and longitudinal Section, without changing the History node.
  bookmark('01 Four-level open microchannels / 800 um Si with diversion', {
    roi: { type: 'rect', a: [-500, -520], b: [500, 520] },
    section: { a: [30, -500], b: [30, 500] },
    threeCamera: {
      position: [650, -740, 1530],
      target: [0, 0, 440],
      fov: 36,
    },
  });
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
  for (const y of [-GAN_LOWER_FEED.portOffsetY, GAN_LOWER_FEED.portOffsetY]) {
    assert.ok(
      model.regions
        .filter((region) => vectorApi.pointInMulti([0, y], region.geom))
        .flatMap((region) => region.stack)
        .every((segment) => !(segment.z0 < -100 && segment.z1 > -100)),
      'Rear coolant port is not open at y=' + y,
    );
  }
  for (const side of [-1, 1]) {
    assert.equal(
      owner([0, side * 1200]).stack.some((segment) => segment.z0 < 100 && segment.z1 > 100),
      false,
      'Lower coolant feeder is blocked',
    );
    assert.ok(
      owner([100, side * 1200]).stack.some((segment) => segment.z0 < 100 && segment.z1 > 100),
      'Lower coolant feeder is missing its Si sidewall',
    );
  }
  bookmark('02 Rear coolant inlet / outlet');
  // The published TSVs connect both sides electrically. Geometry is a real
  // through-bore; conformal Cu plating / NiPaAu barriers remain recorded,
  // rather than claiming a fully modeled metal-filled conductive via.
  etch('Four illustrative through-TSV bores (70 um inferred)', 14, 800);
  bookmark('03 TSV bores');
  // True exposed front/back surface geometry under unchanged coolant and
  // material-coverage scientific contracts. The Kernel nodes shared XY edges
  // before 0.1 nm coordinate rounding, so thin curved contours survive.
  // Oxide thickness 0.5 um is INFERRED, not thermal-growth chemistry.
  process('Full-exposed-surface front SiO2 on interposer (inferred 0.5 um)', 'deposit', {
    material: 'Interposer front exposed-surface SiO2 0.5 um (inferred)',
    thickness: GAN_TSV_LINER.inferredExposedExteriorSiO2Um,
    coverage: 'conformal',
    face: 'front',
  });
  process('Full-exposed-surface backside SiO2 on interposer (inferred 0.5 um)', 'deposit', {
    material: 'Interposer back exposed-surface SiO2 0.5 um (inferred)',
    thickness: GAN_TSV_LINER.inferredExposedExteriorSiO2Um,
    coverage: 'conformal',
    face: 'back',
  });
  bookmark('03a Full exposed front/back SiO2 before local TSV lining');
  // The paper oxidizes the bonded silicon BEFORE Ti/Cu metallization.
  // SiO2 thickness is not reported. This SECOND local conformal oxide
  // covers the four TSV mask windows on top of the separate front/back
  // exposed-surface oxide; it is not a claim of realistic oxide growth
  // kinetics or perfect electrical isolation.
  deposit(
    'Inferred local SiO2 TSV insulation before Ti/Cu (0.5 um)',
    'TSV SiO2 local oxide surrogate 0.5 um (inferred)',
    GAN_TSV_LINER.inferredLocalSiO2Um,
    25,
    'conformal',
  );
  bookmark('03a TSV local SiO2 before metallization');
  // Fig. 2(d): separate front/back directional 200 nm Ti and 500 nm Cu
  // are published. Deep TSV seed coverage is an independently labelled
  // conformal geometry surrogate, NOT guaranteed real sputter step coverage.
  for (const [metal, thickness] of [
    ['Ti', GAN_TSV_LINER.titaniumUm],
    ['Cu', GAN_TSV_LINER.copperUm],
  ]) {
    for (const face of ['front', 'back']) {
      process('Double-sided ' + metal + ' sputter on oxide, ' + face, 'deposit', {
        material: 'Interposer ' + face + ' ' + metal + ' sputter ' + thickness + ' um',
        thickness,
        coverage: 'direct',
        face,
      });
    }
  }
  bookmark('03a Double-sided Ti/Cu before local TSV filling');
  // Local mask includes both the exposed 70 um bore and 10 um of Si rim.
  // Uniform Ti/Cu coverage down an 800 um via is a geometric assumption,
  // not a sputtering, electroplating or insulating-breakdown simulation.
  deposit(
    'Idealized conformal TSV Ti seed (200 nm)',
    'TSV Ti conformal seed surrogate 0.2 um',
    GAN_TSV_LINER.titaniumUm,
    25,
    'conformal',
  );
  deposit(
    'Idealized conformal TSV Cu seed (500 nm)',
    'TSV Cu conformal seed surrogate 0.5 um',
    GAN_TSV_LINER.copperUm,
    25,
    'conformal',
  );
  bookmark('03b Open Ti/Cu-lined TSVs (seed only)');
  // Probe-verified 35 um conformal geometric fill approximates an electroplated
  // Cu-filled column. It is NOT an electrochemical growth/cavity-free proof,
  // and its 35 um amount is inferred from the nominal 70 um square bore.
  const copperFill = deposit(
    'Idealized Cu TSV electrofill (inferred 35 um)',
    'TSV Cu electrofill surrogate 35 um',
    GAN_TSV_LINER.inferredFullCuFillUm,
    25,
    'conformal',
  );
  // Remove the geometrically artificial 35 um Cu cap from top of the vias.
  // A target-layer-only directional etch approximates CMP without removing
  // the Ti/Cu seed or Cu-filled TSV material below the upper Si surface.
  etch(
    'Planarize TSV Cu overburden (35 um CMP geometric surrogate)',
    25,
    GAN_TSV_LINER.inferredFullCuFillUm,
    copperFill.layerId,
    'front',
    'TSV Cu electrofill surrogate 35 um',
  );
  bookmark('03c Cu-filled TSV columns / after inferred planarization');
  record(
    'Electrical TSV and chip wiring finishing steps (metadata only)',
    'Paper Fig. 2(c,d): unmasked front/back exposed-surface SiO2 plus local TSV oxide precede physical double-sided directional Ti (200 nm) / Cu (500 nm) sputter and idealized deep-TSV seed/core fill. Full thermal growth, dielectric isolation, sputter step coverage, Au/NiPaAu finishing and circuit connectivity remain UNVERIFIED.',
  );
  const solderResult = deposit(
    'Peripheral AuSn solder support, 5 um thickness illustrative',
    'AuSn perimeter solder (5 um surrogate)',
    5,
    15,
  );
  assert.ok(solderResult.layerId);
  deposit(
    'Inferred AuSn solder under both separate GSG Pad chips',
    'GSG AuSn solder supports 5 um (inferred)',
    GAN_GSG_STACK.solderUm,
    27,
  );
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
  deposit(
    'Inferred AlGaN HEMT barrier (25 nm)',
    'AlGaN barrier surrogate 0.025 um',
    GAN_HEMT_STACK.barrierUm,
    16,
  );
  // A 2DEG is an electron gas confined by heterostructure band bending.
  // Do not insert a fictitious standalone 2DEG solid into the material stack.
  record(
    'AlGaN/GaN heterointerface with 2DEG (electronic metadata)',
    'Fig. 1(a) labels the AlGaN/GaN 2DEG. The interface is explicit in geometry, but its carrier concentration, confinement and transport are not simulated.',
  );
  deposit(
    'Inferred peripheral SiN isolation/passivation (150 nm)',
    'SiN isolation/passivation surrogate 0.15 um',
    GAN_HEMT_STACK.isolationSiNUm,
    24,
  );
  // Source/drain pads outside the active window are schematic top contacts;
  // no ohmic vias or verified electrical continuity are represented.
  deposit('Illustrative gate metal 0.2 um', 'Gate metal surrogate 0.2 um', 0.2, 18);
  deposit(
    'Illustrative source-drain contacts 0.2 um',
    'Source/drain metal surrogate 0.2 um',
    0.2,
    19,
  );
  bookmark('05 HEMT active AlGaN/SiN and ten gate fingers', {
    roi: { type: 'rect', a: [-470, -580], b: [470, 580] },
    section: { a: [-440, 0], b: [440, 0] },
    threeCamera: {
      position: [1650, -2150, 2350],
      target: [0, 0, 580],
      fov: 37,
    },
  });
  // Fig. 2(e,f) includes two separately soldered GSG Pad chips, not two
  // gold rectangles painted directly on the silicon interposer.
  // These substrate dimensions/composition and pad masks are INFERRED.
  deposit(
    'Transfer two independent illustrative GSG Pad die bodies',
    'GSG chip substrate surrogate (100 um inferred)',
    GAN_GSG_STACK.substrateThicknessUm,
    26,
    'transfer',
  );
  deposit(
    'Three inferred Au contacts on each separate GSG Pad die',
    'GSG Au pads surrogate 0.5 um',
    GAN_GSG_STACK.goldPadUm,
    20,
  );
  record(
    'Au wire bonds to GSG and aluminum manifold assembly',
    'Paper Fig. 2(e,f) and SI Fig. S-5: AuSn-bonded HEMT and two GSG chips, gold wires, aluminum enclosure and coolant fittings. True curved wires, full package and coolant flow are not geometric model features.',
  );
  record(
    'Experimental thermal operating point (metadata only)',
    'Paper: DI water 3 mL/min, Vds approximately 7.5 V, Ids approximately 0.8 A, measured Tmax 93.8 C. Geometry model does not compute CFD, thermal or electrical results.',
  );
  bookmark('06 Integrated GaN HEMT / full interposer and TSV inspection', {
    roi: null,
    section: { a: [-1800, 950], b: [1800, 950] },
    threeCamera: { position: [3600, -4250, 2650], target: [0, 0, 240], fov: 36 },
  });

  // Separate package inspection view keeps both GSG dies while the default
  // longitudinal half-section remains available for coolant topology.
  bookmark('07 HEMT and dual GSG die upper package inspection', {
    roi: { type: 'rect', a: [-1600, -750], b: [1600, 750] },
    section: { a: [-1500, 0], b: [1500, 0] },
    threeCamera: {
      // Symmetric oblique package inspection: both independent GSG chips
      // must be fully visible without artificially scaling their geometry.
      position: [0, -2200, 3150],
      target: [0, 0, 670],
      fov: 38,
    },
  });

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
  const exteriorFrontOxide = model.layers.find(
    (layer) => layer.name === 'Interposer front exposed-surface SiO2 0.5 um (inferred)',
  );
  const exteriorBackOxide = model.layers.find(
    (layer) => layer.name === 'Interposer back exposed-surface SiO2 0.5 um (inferred)',
  );
  assert.ok(exteriorFrontOxide && exteriorBackOxide, 'Missing native front/back exterior oxides');
  for (const [point, z, oxide] of [
    [[2000, 0], 600.25, exteriorFrontOxide],
    [[2000, 0], -200.25, exteriorBackOxide],
    [[2500, 1800], 600.25, exteriorFrontOxide],
    [[2500, 1800], -200.25, exteriorBackOxide],
    [[500, 0], 600.25, exteriorFrontOxide],
    [[500, 0], -200.25, exteriorBackOxide],
    [[150, 1000], 600.25, exteriorFrontOxide],
    [[150, 1000], -200.25, exteriorBackOxide],
    [[-400, 500], 600.25, exteriorFrontOxide],
    [[-400, 500], -200.25, exteriorBackOxide],
  ]) {
    assert.ok(
      owner(point).stack.some(
        (segment) => segment.layerId === oxide.id && segment.z0 < z && segment.z1 > z,
      ),
      'Full exterior oxide missing or not following the true front/back surface at ' + [point, z],
    );
  }
  for (const y of [-GAN_LOWER_FEED.portOffsetY, GAN_LOWER_FEED.portOffsetY]) {
    assert.equal(materialAt([0, y], -150), false, 'Global SiO2 sealed a rear coolant port');
  }
  // Occupancy checks for *separate* front and back metal material solids.
  for (const [face, tiZ, cuZ] of [
    ['front', 600.6, 601.0],
    ['back', -200.6, -201.0],
  ]) {
    for (const [metal, z, thickness] of [
      ['Ti', tiZ, GAN_TSV_LINER.titaniumUm],
      ['Cu', cuZ, GAN_TSV_LINER.copperUm],
    ]) {
      const name = 'Interposer ' + face + ' ' + metal + ' sputter ' + thickness + ' um';
      const layer = model.layers.find((item) => item.name === name);
      assert.ok(layer, 'Missing source-supported double-sided metal: ' + name);
      assert.ok(
        owner([2000, 0]).stack.some((seg) => seg.layerId === layer.id && seg.z0 < z && seg.z1 > z),
        'Front/back sputtered metal is absent at ' + [face, metal, z],
      );
    }
  }
  const tsvOxide = model.layers.find(
    (layer) => layer.name === 'TSV SiO2 local oxide surrogate 0.5 um (inferred)',
  );
  const tsvTi = model.layers.find(
    (layer) => layer.name === 'TSV Ti conformal seed surrogate 0.2 um',
  );
  const tsvCu = model.layers.find(
    (layer) => layer.name === 'TSV Cu conformal seed surrogate 0.5 um',
  );
  const tsvFill = model.layers.find((layer) => layer.name === 'TSV Cu electrofill surrogate 35 um');
  assert.ok(tsvOxide && tsvTi && tsvCu && tsvFill, 'Missing oxide or TSV Ti/Cu/Cu core');
  const copperZtops = model.regions.flatMap((region) =>
    region.stack.filter((s) => s.layerId === tsvFill.id).map((s) => s.z1),
  );
  assert.ok(copperZtops.length > 0);
  assert.ok(
    copperZtops.every(
      (z) =>
        z <=
        600 +
          GAN_TSV_LINER.inferredExposedExteriorSiO2Um +
          GAN_TSV_LINER.inferredLocalSiO2Um +
          GAN_TSV_LINER.titaniumUm +
          GAN_TSV_LINER.copperUm +
          GAN_TSV_LINER.titaniumUm +
          GAN_TSV_LINER.copperUm +
          0.000001,
    ),
    'Unremoved Cu overburden above TSV',
  );
  for (const [x, y] of tsvCenters) {
    for (const z of [-150, 50, 250, 450, 550]) {
      const centerCu = model.regions.some(
        (region) =>
          vectorApi.pointInMulti([x, y], region.geom) &&
          region.stack.some(
            (segment) => segment.layerId === tsvFill.id && segment.z0 < z && segment.z1 > z,
          ),
      );
      assert.equal(centerCu, true, 'Cu electrofill is absent at ' + [x, y, z]);
      assert.equal(materialAt([x + 43, y], z), true, 'Missing surrounding Si at ' + [x, y, z]);
      const present = new Set();
      for (let delta = 33; delta <= 37.0001; delta += 0.05) {
        for (const region of model.regions) {
          if (!vectorApi.pointInMulti([x + delta, y], region.geom)) continue;
          for (const seg of region.stack) {
            if (seg.z0 < z && seg.z1 > z) present.add(seg.layerId);
          }
        }
      }
      assert.ok(present.has(tsvOxide.id), 'SiO2 below Ti/Cu missing at ' + [x, y, z]);
      assert.ok(present.has(tsvTi.id), 'Ti coating missing at ' + [x, y, z]);
      assert.ok(present.has(tsvCu.id), 'Cu coating missing at ' + [x, y, z]);
    }
  }
  // A structural fluid network requires continuous *void*, rather than two
  // isolated ports or visually touching masks. Follow every buffered branch
  // from the back-side entrance up through the stepped lower chamber and into
  // the six top channels. Interpolate each 3D segment at <=5 um intervals.
  function assertFluidPath(points, name) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
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
      [0, side * GAN_LOWER_FEED.portOffsetY, -150],
      [0, side * GAN_LOWER_FEED.portOffsetY, 100],
      [0, side * 1200, 100],
      [0, side * 420, 100],
      [0, side * 415, 350],
      [30, side * 395, 350],
      [30, side * 395, 550],
      [0, side * 425, 550],
    ];
    assertFluidPath(upstream, 'rear port ' + side + ' to distribution throat');
    for (const channelX of CHANNEL_CENTERS) {
      const centerline = ganManifoldCenterline(channelX, side).map(([x, y]) => [x, y, 550]);
      assertFluidPath(
        [[channelX, side * 300, 550], ...centerline, [0, side * 425, 550]],
        'fanout ' + side + ' / channel ' + channelX,
      );
    }
  }
  // The manifold is a *local* diversion, not a blanket top DRIE removal.
  assert.equal(materialAt([0, 0], 550), true, 'Inter-channel silicon ribs were erased');
  assert.equal(materialAt([220, 400], 550), true, 'Manifold etched beyond its own footprint');

  const cooledSiC = model.layers.find((layer) => layer.name === 'GaN HEMT SiC substrate 99 um');
  assert.ok(cooledSiC, 'SiC chip is missing');
  const algan = model.layers.find((layer) => layer.name === 'AlGaN barrier surrogate 0.025 um');
  const sin = model.layers.find(
    (layer) => layer.name === 'SiN isolation/passivation surrogate 0.15 um',
  );
  assert.ok(algan && sin, 'Missing physical HEMT AlGaN/SiN layers');
  const activeBarrier = owner([0, 0]).stack.filter((s) => s.layerId === algan.id);
  const frameSiN = owner([350, 0]).stack.filter((s) => s.layerId === sin.id);
  assert.equal(activeBarrier.length, 1, 'Active heterointerface lacks an AlGaN barrier');
  assert.ok(
    Math.abs(activeBarrier[0].z1 - activeBarrier[0].z0 - GAN_HEMT_STACK.barrierUm) < 1e-8,
    'AlGaN barrier thickness changed during Kernel execution',
  );
  assert.equal(frameSiN.length, 1, 'Passive HEMT periphery lacks SiN isolation');
  assert.ok(
    Math.abs(frameSiN[0].z1 - frameSiN[0].z0 - GAN_HEMT_STACK.isolationSiNUm) < 1e-8,
    'SiN passivation thickness changed during Kernel execution',
  );
  assert.equal(
    owner([0, 0]).stack.some((s) => s.layerId === sin.id),
    false,
    'Peripheral isolation wrongly covers the central active HEMT window',
  );
  assert.ok(
    !model.layers.some((layer) => /(^|\\b)2DEG(\\b|$)/i.test(layer.name)),
    '2DEG electronic interface must not be modeled as a physical deposited solid',
  );
  const cooledSegments = owner([30, 0]).stack.filter((segment) => segment.layerId === cooledSiC.id);
  assert.equal(cooledSegments.length, 1, 'No distinct SiC bottom over central channel');
  assert.equal(cooledSegments[0].z0, 606.2, 'Unexpected SiC/AuSn stand-off');
  assert.equal(cooledSegments[0].z1 - cooledSegments[0].z0, 99);
  assert.equal(materialAt([30, 0], 606.19), false, 'SiC backside is coolant-obstructed');
  const gsgDie = model.layers.find(
    (layer) => layer.name === 'GSG chip substrate surrogate (100 um inferred)',
  );
  const gsgSolder = model.layers.find(
    (layer) => layer.name === 'GSG AuSn solder supports 5 um (inferred)',
  );
  const gsgPad = model.layers.find((layer) => layer.name === 'GSG Au pads surrogate 0.5 um');
  assert.ok(gsgDie && gsgSolder && gsgPad, 'Missing one or more physical GSG assembly layers');
  for (const x of [-1250, 1250]) {
    for (const [layerId, z0, z1] of [
      [gsgSolder.id, 601.2, 606.2],
      [gsgDie.id, 606.2, 706.2],
      [gsgPad.id, 706.2, 706.7],
    ]) {
      assert.ok(
        owner([x, 0]).stack.some(
          (segment) =>
            segment.layerId === layerId &&
            Math.abs(segment.z0 - z0) < 1e-8 &&
            Math.abs(segment.z1 - z1) < 1e-8,
        ),
        'Inferred GSG die material missing at ' + [x, z0, z1],
      );
    }
  }
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
      fourTSVsAreActualCuFilledColumns: true,
      SiCBacksideContactsCoolantVoid: true,
      fiveDistinctSiliconLayerIdsShareMaterialColor: true,
      bothBacksidePortsConnectToAllSixTopChannels: true,
      retainedInterChannelSiRibs: true,
      longSupplyReturnRoutesReachBothRemotePorts: true,
      physicalAlGaNAndSiNWith2DEGOnlyAsMetadata: true,
      fourTSVsWithContinuousTiCuSeedGeometry: true,
      fourCuFilledTSVsWithUnblockedCoolant: true,
      idealizedCuPlanarizationPreservesTSVConductors: true,
      localizedTsvSiO2ConformalGeometryWithoutCoolantBlockage: true,
      frontBackExteriorSiO2WithUnsealedCoolant: true,
      actualDoubleSidedTiCuSputteredMaterials: true,
      twoInferredGsgDieBodiesAndPadsAreRealGeometry: true,
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
