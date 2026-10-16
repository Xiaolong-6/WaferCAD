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
export const GATE_LENGTH_UM = 0.44;
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
// All the coordinates below are traced in PIXELS from the user-supplied
// original 713 x 498 Fig. 1b image (SHA256 prefix f39c0b4562ab2eec).
// It is a layout SCHEMATIC. All CAD µm values are for DISPLAY ONLY,
// calculated with ONE common reference frame (359,365) px / 54px per µm,
// snapped to a 0.01-µm grid (exact 1nm layout serialization). No foundry GDS is implied.
export const FIG1B_PIXEL_FRAME = Object.freeze({
  width: 713,
  height: 498,
  origin: [359, 365],
  pxPerIllustrativeUm: 54,
  gridPerUm: 100,
});
const grid = (n) => Math.round(n * 100) / 100;
const fig = (l, t, r, b) => {
  const x0 = grid((l - 359) / 54),
    x1 = grid((r - 359) / 54);
  const y0 = grid((365 - b) / 54),
    y1 = grid((365 - t) / 54);
  return rect(x0, y0, grid(x1 - x0), grid(y1 - y0));
};
const P_ACTIVE = fig(137, 356, 259, 398),
  N_ACTIVE = fig(460, 356, 582, 398);
const P_POLY = fig(186, 327, 210, 401),
  N_POLY = fig(508, 327, 532, 401);
const gateLeft = P_POLY.x + P_POLY.w / 2;
const gateRight = N_POLY.x + N_POLY.w / 2;
const sd = (minX, maxX) => rect(minX, P_ACTIVE.y, maxX - minX, P_ACTIVE.h);
const tapCentersPx = [198, 520];
function bodyTapActive(cx) {
  return [
    fig(cx - 119, 363, cx - 80, 464),
    fig(cx - 119, 425, cx + 120, 464),
    fig(cx + 81, 363, cx + 120, 464),
  ];
}
const pixelCnt = (x, y, w = 6) => fig(x - w / 2, y - w / 2, x + w / 2, y + w / 2);
function bodyTapContacts(cx) {
  const out = [];
  // Fig.1b shows three rows of CNT along the lower U and three columns
  // along each upright. Every position is specified in source-image pixels.
  for (const y of [435, 447, 459]) {
    for (let col = 0; col < 19; col++) {
      const x = cx - 112 + Math.round((col * 224) / 18);
      out.push(pixelCnt(x, y));
    }
  }
  for (const x of [cx - 112, cx - 99, cx - 86, cx + 86, cx + 99, cx + 112]) {
    for (const y of [374, 387, 400, 413, 425]) out.push(pixelCnt(x, y));
  }
  return out;
}
// First six slots are semantically stable terminals used by contact/net audit.
const terminalPixels = [
  [156, 380],
  [240, 380],
  [478, 380],
  [563, 380],
  [198, 340],
  [520, 340],
];
const extraContactPixels = [];
for (const [cx, cy] of terminalPixels.slice(0, 4))
  for (const dy of [-12, 0, 12])
    for (const dx of [-12, 0, 12])
      if (dx !== 0 || dy !== 0) extraContactPixels.push(pixelCnt(cx + dx, cy + dy, 7));
const gateExtra = [pixelCnt(198, 347, 7), pixelCnt(520, 347, 7)];
const bodyContactStart = terminalPixels.length + extraContactPixels.length + gateExtra.length;
// Four disjoint METAL1 networks retain the exact inverted-U silhouette,
// upright-U body rail and broad source/drain contact pads seen in Fig.1b.
export const TCMOS_METAL_NETS = Object.freeze([
  {
    name: 'VDD',
    rectangles: [
      fig(18, 209, 159, 248),
      fig(18, 209, 55, 464),
      fig(139, 209, 159, 356),
      fig(137, 356, 176, 398),
      fig(55, 425, 79, 464),
      ...bodyTapActive(198),
    ],
  },
  {
    name: 'VOUT',
    rectangles: [
      fig(237, 208, 483, 248),
      fig(237, 208, 258, 356),
      fig(222, 356, 259, 398),
      fig(462, 208, 483, 356),
      fig(459, 356, 499, 398),
    ],
  },
  {
    name: 'GND',
    rectangles: [
      fig(560, 209, 698, 248),
      fig(665, 209, 698, 464),
      fig(560, 209, 580, 356),
      fig(545, 356, 582, 398),
      fig(640, 425, 665, 464),
      ...bodyTapActive(520),
    ],
  },
  {
    name: 'VIN',
    rectangles: [
      fig(188, 151, 532, 191),
      fig(188, 151, 209, 326),
      fig(186, 326, 210, 350),
      fig(511, 151, 532, 326),
      fig(508, 326, 532, 350),
    ],
  },
]);
export const TCMOS_MASK_PRESENTATION = Object.freeze({
  version: 1,
  background: '#ffffff',
  showUnselected: false,
  showStructure: false,
  layers: [
    { layer: 1, datatype: 0, color: '#247b9a', mode: 'fill', opacity: 0.42 },
    { layer: 11, datatype: 0, color: '#6c71ce', mode: 'fill', opacity: 0.46 },
    { layer: 6, datatype: 0, color: '#df4d55', mode: 'hatch', opacity: 0.24 },
    { layer: 10, datatype: 0, color: '#3b7b43', mode: 'cross', opacity: 0 },
    { layer: 12, datatype: 0, color: '#e37b28', mode: 'outline', opacity: 0 },
    { layer: 13, datatype: 0, color: '#78d746', mode: 'outline', opacity: 0 },
    { layer: 4, datatype: 0, color: '#e34d86', mode: 'outline', opacity: 0 },
    { layer: 5, datatype: 0, color: '#145d1c', mode: 'outline', opacity: 0 },
  ],
});

// Display metadata only. Exported GDS/OAS remains the same geometry and
// layer/datatype mapping. In particular, inferred NWELL/PWELL/S-D/silicide
// support layers are preserved, but do not clutter the Fig. 1b visual overlay.

export const TCMOS_MASKS = Object.freeze([
  {
    id: 1,
    name: 'ACTIVE / STI complement plus two Fig1b U body ties',
    rectangles: [P_ACTIVE, N_ACTIVE, ...tapCentersPx.flatMap(bodyTapActive)],
  },
  { id: 2, name: 'NWELL (pMOS + body tie)', rectangles: [P_ACTIVE, ...bodyTapActive(198)] },
  { id: 3, name: 'PWELL (nMOS + body tie)', rectangles: [N_ACTIVE, ...bodyTapActive(520)] },
  {
    id: 4,
    name: 'HVTN As+ pMOS buried body implant window',
    rectangles: [fig(133, 307, 266, 409)],
  },
  {
    id: 5,
    name: 'HVTP BF2+ nMOS buried body implant window',
    rectangles: [fig(455, 306, 588, 409)],
  },
  {
    id: 6,
    name: 'POLY traced schematic widths (NOT 130nm gate measurement)',
    rectangles: [P_POLY, N_POLY],
  },
  {
    id: 7,
    name: 'P source/drain openings',
    rectangles: [
      sd(P_ACTIVE.x, gateLeft - P_POLY.w / 2 - 0.03),
      sd(gateLeft + P_POLY.w / 2 + 0.03, P_ACTIVE.x + P_ACTIVE.w),
    ],
  },
  {
    id: 8,
    name: 'N source/drain openings',
    rectangles: [
      sd(N_ACTIVE.x, gateRight - N_POLY.w / 2 - 0.03),
      sd(gateRight + N_POLY.w / 2 + 0.03, N_ACTIVE.x + N_ACTIVE.w),
    ],
  },
  {
    id: 9,
    name: 'Silicide exposed source/drain',
    rectangles: [
      sd(P_ACTIVE.x, gateLeft - P_POLY.w / 2 - 0.03),
      sd(gateLeft + P_POLY.w / 2 + 0.03, P_ACTIVE.x + P_ACTIVE.w),
      sd(N_ACTIVE.x, gateRight - N_POLY.w / 2 - 0.03),
      sd(gateRight + N_POLY.w / 2 + 0.03, N_ACTIVE.x + N_ACTIVE.w),
    ],
  },
  {
    id: 10,
    name: 'CNT measured S/D matrices, POLY contacts, U body arrays',
    rectangles: [
      ...terminalPixels.map(([x, y]) => pixelCnt(x, y, 7)),
      ...extraContactPixels,
      ...gateExtra,
      ...tapCentersPx.flatMap(bodyTapContacts),
    ],
  },
  {
    id: 11,
    name: 'METAL1 measured four VDD/VOUT/GND/VIN nets',
    rectangles: TCMOS_METAL_NETS.flatMap((net) => net.rectangles),
  },
  {
    id: 12,
    name: 'LVTN reference CMOS window, NOT T-CMOS implantation',
    rectangles: [fig(61, 271, 335, 483)],
  },
  {
    id: 13,
    name: 'LVTP reference CMOS window, NOT T-CMOS implantation',
    rectangles: [fig(383, 271, 657, 483)],
  },
]);

/**
 * Read-only CNT-to-METAL1 terminal provenance for the illustrative masks.
 * Fail closed on disconnected nets, shorts and ambiguous terminal assignments.
 * This geometry audit does not demonstrate physical conduction or ohmic contacts.
 */
export function auditTcmosTerminalNetProvenance(masks, metalNets) {
  const eps = 1e-12;
  const validRect = (r) =>
    r &&
    [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    r.w > 0 &&
    r.h > 0;
  const overlap = (a, b) => [
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  ];
  const connected = (a, b) => {
    const [dx, dy] = overlap(a, b);
    // A shared edge conducts, but a single-corner touch does not.
    return (dx > eps && dy >= -eps) || (dy > eps && dx >= -eps);
  };
  const inRect = ([x, y], r) =>
    x > r.x + eps && x < r.x + r.w - eps && y > r.y + eps && y < r.y + r.h - eps;
  const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const fail = (message) => {
    throw new Error('T-CMOS terminal net provenance: ' + message);
  };
  const mask = (id) => {
    const found = masks.find((item) => item.id === id);
    if (!found || !Array.isArray(found.rectangles)) fail('missing mask ' + id);
    if (found.rectangles.some((r) => !validRect(r))) fail('invalid mask ' + id);
    return found.rectangles;
  };
  const cnt = mask(10);
  const active = mask(1);
  const required = ['VDD', 'VOUT', 'GND', 'VIN'];
  if (
    metalNets.length !== required.length ||
    new Set(metalNets.map((net) => net.name)).size !== 4 ||
    required.some((name) => !metalNets.some((net) => net.name === name))
  ) {
    fail('exactly four independent named nets required');
  }
  for (const net of metalNets) {
    const rectangles = net.rectangles;
    if (!Array.isArray(rectangles) || !rectangles.length) {
      fail(net.name + ': invalid routing');
    }
    if (rectangles.some((r) => !validRect(r))) {
      fail(net.name + ': invalid routing');
    }
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const current = queue.shift();
      for (let i = 0; i < rectangles.length; i++) {
        if (!visited.has(i) && connected(rectangles[current], rectangles[i])) {
          visited.add(i);
          queue.push(i);
        }
      }
    }
    if (visited.size !== rectangles.length) fail(net.name + ': disconnected routing');
  }
  for (let i = 0; i < metalNets.length; i++) {
    for (let j = i + 1; j < metalNets.length; j++) {
      if (
        metalNets[i].rectangles.some((a) => metalNets[j].rectangles.some((b) => connected(a, b)))
      ) {
        fail('Metal1 short: ' + metalNets[i].name + ' / ' + metalNets[j].name);
      }
    }
  }
  // CNT ordering, inferred S/D direction and well association are specific to
  // this reconstructed Fig. 1b layout; they are not released foundry data.
  const sites = [
    {
      id: 'pMOS-source',
      device: 'pMOS',
      kind: 'source',
      cnt: 0,
      mask: 7,
      rect: 0,
      net: 'VDD',
    },
    {
      id: 'pMOS-drain',
      device: 'pMOS',
      kind: 'drain',
      cnt: 1,
      mask: 7,
      rect: 1,
      net: 'VOUT',
    },
    {
      id: 'nMOS-drain',
      device: 'nMOS',
      kind: 'drain',
      cnt: 2,
      mask: 8,
      rect: 0,
      net: 'VOUT',
    },
    {
      id: 'nMOS-source',
      device: 'nMOS',
      kind: 'source',
      cnt: 3,
      mask: 8,
      rect: 1,
      net: 'GND',
    },
    {
      id: 'pMOS-gate',
      device: 'pMOS',
      kind: 'gate',
      cnt: 4,
      mask: 6,
      rect: 0,
      net: 'VIN',
    },
    {
      id: 'nMOS-gate',
      device: 'nMOS',
      kind: 'gate',
      cnt: 5,
      mask: 6,
      rect: 1,
      net: 'VIN',
    },
    {
      id: 'pMOS-well-tie',
      device: 'pMOS',
      kind: 'well-tie',
      cnt: bodyContactStart + 3,
      mask: 2,
      net: 'VDD',
    },
    {
      id: 'nMOS-well-tie',
      device: 'nMOS',
      kind: 'well-tie',
      cnt: bodyContactStart + bodyTapContacts(198).length + 3,
      mask: 3,
      net: 'GND',
    },
  ];
  const terminals = sites.map((site) => {
    const contact = cnt[site.cnt];
    if (!contact) fail(site.id + ': missing CNT');
    const point = center(contact);
    if (cnt.filter((r) => inRect(point, r)).length !== 1) {
      fail(site.id + ': ambiguous CNT');
    }
    const footprints = mask(site.mask);
    const matchingIndices = footprints.map((r, i) => (inRect(point, r) ? i : -1));
    const matches = matchingIndices.filter((i) => i >= 0);
    if (matches.length !== 1 || (site.rect !== undefined && matches[0] !== site.rect)) {
      fail(site.id + ': incorrect device footprint');
    }
    if (site.kind === 'well-tie' && active.filter((r) => inRect(point, r)).length !== 1) {
      fail(site.id + ': outside isolated ACTIVE');
    }
    const owners = metalNets.filter((net) => net.rectangles.some((r) => inRect(point, r)));
    if (owners.length !== 1) fail(site.id + ': missing or ambiguous Metal1 owner');
    if (owners[0].name !== site.net) {
      fail(site.id + ': wrong net ' + owners[0].name + ', expected ' + site.net);
    }
    return {
      id: site.id,
      device: site.device,
      kind: site.kind,
      point,
      net: owners[0].name,
      provenance: 'inferred-from-reconstructed-CNT/METAL1-layout',
    };
  });
  const byId = Object.fromEntries(terminals.map((terminal) => [terminal.id, terminal]));
  for (const device of ['pMOS', 'nMOS']) {
    const gate = byId[device + '-gate'].point[0];
    if (
      (byId[device + '-source'].point[0] - gate) * (byId[device + '-drain'].point[0] - gate) >=
      0
    ) {
      fail(device + ': source and drain do not flank the gate');
    }
  }
  return {
    kind: 'illustrative-layout-terminal-net-provenance',
    sourceDocumentedFoundryRouting: false,
    physicalElectricalConnectivityVerified: false,
    ohmicContactsValidated: false,
    physicalJunctionResolved: false,
    terminals,
  };
}

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
    maskPresentation: copy(TCMOS_MASK_PRESENTATION),
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

export async function buildTcmosInverter({
  illustrativeTiltDeg = 0,
  mode = 'tcmos',
  includeComparison = true,
} = {}) {
  if (!['tcmos', 'conventional-cmos'].includes(mode)) {
    throw new Error('Unrecognized inverter process Variant.');
  }
  if (mode === 'conventional-cmos' && illustrativeTiltDeg !== 0) {
    throw new Error('The conventional CMOS Variant uses only 0° implantation.');
  }
  if (![0, 18].includes(illustrativeTiltDeg)) {
    throw new Error(
      'Only the assumed 0° baseline and 18° illustrative tilt diagnostic are supported; the paper does not report an angle.',
    );
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
  // This opt-in example stores qualitative doping intent throughout History.
  // Preserve its existing empty snapshots without changing ordinary legacy
  // examples, which never opted into the dopantRegions model extension.
  model.dopantRegions = [];
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
  project.name =
    mode === 'conventional-cmos'
      ? 'Conventional CMOS 130nm illustrative comparison'
      : illustrativeTiltDeg
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
        ...(args.dopantPolarity
          ? {
              dopantPolarity: args.dopantPolarity,
              dopantRole: args.dopantRole,
              dopantHostLayerId: args.dopantHostLayerId,
              dopantProvenance: args.dopantProvenance,
            }
          : {}),
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
  const implant = (
    label,
    name,
    depth,
    maskId,
    color,
    startDepth = 0,
    tilt = 0,
    polarity = null,
    role = 'source-drain',
  ) =>
    apply(
      label,
      'implant',
      {
        name,
        depth,
        tilt,
        color,
        startDepth,
        ...(polarity
          ? {
              dopantPolarity: polarity,
              dopantRole: role,
              dopantHostLayerId: 'base',
              dopantProvenance: 'illustrative; no concentration or electrical activation',
            }
          : {}),
      },
      maskId,
    );
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

  if (mode === 'tcmos') {
    implant(
      'HVTN As body implant',
      'HVTN As+ pMOS / buried HVT body interval (illustrative)',
      0.24,
      4,
      '#d9668a',
      0.08,
      illustrativeTiltDeg,
      'donor',
      'body',
    );
    implant(
      'HVTP BF2 body implant',
      'HVTP BF2+ nMOS / buried HVT body interval (illustrative)',
      0.24,
      5,
      '#5d8ce0',
      0.08,
      illustrativeTiltDeg,
      'acceptor',
      'body',
    );
    record(
      'Body implant rapid thermal anneal',
      'anneal',
      'Reported deeper HVT body implants have unspecified energy/dose. The illustrated 80–240 nm buried intervals are geometry markers, not dopant concentration predictions.',
    );
  } else {
    implant(
      'LVTN As+ channel reference',
      'LVTN As+ pMOS channel marker (depth illustrative)',
      0.08,
      12,
      '#d9668a',
      0,
      0,
      'donor',
      'channel',
    );
    implant(
      'LVTP BF2+ channel reference',
      'LVTP BF2+ nMOS channel marker (depth illustrative)',
      0.08,
      13,
      '#5d8ce0',
      0,
      0,
      'acceptor',
      'channel',
    );
    record(
      'Conventional LVT channel activation (illustrative)',
      'anneal',
      'Conventional CMOS comparison follows Supplementary Fig. 1 qualitatively. Implant energy, dose and concentration are unspecified, and the 80nm depth is assumed.',
    );
  }
  bookmark(
    mode === 'tcmos' ? 'S03 - HVT buried body annotations' : 'S03 - LVT surface channel comparison',
  );

  // Gate oxidation is confined to the two POLY footprints in this
  // illustrative 2.5D geometry. A blanket 5 nm oxide over STI and body ties
  // misrepresents Fig. 1a and obscures every device in Main/3D. Foundry
  // gate-oxide removal and self-aligned spacer lithography are not simulated.
  deposit(
    'Patterned gate dielectric SiO2 5nm (illustrative)',
    'Gate SiO2 (5nm surrogate)',
    0.005,
    6,
  );
  deposit('Pattern Fig1b-measured POLY gates (VIN via METAL1)', 'POLY gate', 0.2, 6);
  record(
    'Gate-oxide source/drain window surrogate',
    'custom',
    'Gate oxide is represented only beneath POLY footprints; exposed source/drain silicon requires no second geometric oxide etch. This abstracts foundry oxide patterning.',
  );
  implant(
    'pMOS LDD structural marker',
    'pMOS LDD anticipated profile',
    0.08,
    7,
    '#cf6785',
    0,
    0,
    'acceptor',
  );
  implant(
    'nMOS LDD structural marker',
    'nMOS LDD anticipated profile',
    0.08,
    8,
    '#4c93c6',
    0,
    0,
    'donor',
  );
  record(
    'Spacer formation',
    'custom',
    'Self-aligned dielectric spacers recorded only: dimensions and etch recipe unreported.',
  );
  implant(
    'pMOS HDD structural marker',
    'p+ HDD anticipated profile',
    0.18,
    7,
    '#bd4d68',
    0,
    0,
    'acceptor',
  );
  implant(
    'nMOS HDD structural marker',
    'n+ HDD anticipated profile',
    0.18,
    8,
    '#3978b3',
    0,
    0,
    'donor',
  );
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

  // The interlayer dielectric remains fully present and exportable in the
  // physical process model. Hide it only in the *final inspection state* so
  // that the default Main/Section/3D displays reveal the transistor stack.
  // Earlier History stages retain their normal visible process layers.
  const ild = model.layers.find((layer) => layer.name === 'Interlayer SiO2');
  assert.ok(ild, 'The dielectric must exist before applying the view preset.');
  assert.equal(modelApi.setLayerVisible(model, ild.id, false), true);
  project.display.threeOpacity = 0.75;
  project.display.threeCamera = {
    position: [13.3, -14.3, 10.2],
    target: [0, -0.2, 0.95],
    fov: 34,
  };
  // Preserve consistency between the final History head and the saved
  // project without creating a fictional additional fabrication step.
  const head = nodes.at(-1);
  head.state = capture();
  branch.headState = copy(head.state);
  bookmark('S05 - inverter / METAL1 final');

  Object.assign(project, capture());
  project.name =
    mode === 'conventional-cmos'
      ? 'Conventional CMOS 130nm · LVT channel reference (illustrative)'
      : illustrativeTiltDeg
        ? 'T-CMOS 130nm · TILT DEMO 18° (NOT REPORTED IN PAPER)'
        : 'T-CMOS 130nm · tunnelling-based ternary inverter (illustrative)';
  if (illustrativeTiltDeg) project.section = { a: [-4.45, 0], b: [-2.95, 0] };
  // A Variant switch restores the stored Head state, not the root project.
  // Final inspection name/section changes must therefore be reflected in the
  // head and final bookmark; otherwise Save/Recovery restores a stale name.
  const canonicalFinalState = capture();
  nodes.at(-1).state = copy(canonicalFinalState);
  branch.headState = copy(canonicalFinalState);
  bookmarks[0].state = copy(canonicalFinalState);
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

  if (includeComparison && mode === 'tcmos' && illustrativeTiltDeg === 0) {
    // Build the reference branch with the same deterministic Base/STI/wells,
    // but its own post-fork Implant recipe and replayable material states.
    // The independent builder must not recursively create another Variant.
    const reference = (
      await buildTcmosInverter({
        mode: 'conventional-cmos',
        includeComparison: false,
      })
    ).project;
    const sharedWell = bookmarks.find((item) => item.name === 'S02 - complementary well regions');
    assert.ok(sharedWell, 'Shared well-formation fork snapshot is required');
    const forkNodeId = sharedWell.historyNodeId;
    const refNodes = reference.snapshotBranches.nodes;
    const forkIndex = nodes.findIndex((node) => node.id === forkNodeId);
    assert.ok(forkIndex >= 0 && refNodes.length > forkIndex + 1);
    for (let index = 0; index <= forkIndex; index++) {
      assert.deepEqual(
        refNodes[index].state.model,
        nodes[index].state.model,
        'Conventional CMOS must share identical physical Base/STI/well states',
      );
    }
    const variantId = 'conventional-cmos';
    const idMap = new Map();
    let previousNodeId = forkNodeId;
    for (let index = forkIndex + 1; index < refNodes.length; index++) {
      const source = refNodes[index];
      const id = `cmos-step-${String(index).padStart(2, '0')}`;
      idMap.set(source.id, id);
      const node = {
        ...copy(source),
        id,
        parentId: previousNodeId,
        branchId: variantId,
      };
      nodes.push(node);
      previousNodeId = id;
    }
    const branchSnapshots = [];
    let previousSnapshotId = sharedWell.id;
    for (const source of [...reference.snapshots].reverse()) {
      const mappedHistoryNode = idMap.get(source.historyNodeId);
      if (!mappedHistoryNode) continue;
      const id = `cmos-${source.id}`;
      branchSnapshots.push({
        ...copy(source),
        id,
        parentId: previousSnapshotId,
        branchId: variantId,
        historyNodeId: mappedHistoryNode,
      });
      previousSnapshotId = id;
    }
    assert.ok(branchSnapshots.length >= 2, 'Conventional CMOS needs restorable stage bookmarks');
    project.snapshots.push(...branchSnapshots);
    project.snapshotBranches.branches.push({
      id: variantId,
      name: 'Conventional CMOS · LVT channel reference (assumed dimensions)',
      parentBranchId: branch.id,
      rootNodeId: forkNodeId,
      headNodeId: previousNodeId,
      rootSnapshotId: sharedWell.id,
      headSnapshotId: previousSnapshotId,
      createdAt: stamp(600),
      headState: copy(reference.snapshotBranches.branches[0].headState),
    });
  }

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
  assert.equal(loaded.snapshotBranches.branches.length, project.snapshotBranches.branches.length);
  assert.equal(loaded.processRecipe.steps.length, steps.length);
  // Drain vs source is inferred from terminal contact connectivity in the
  // reconstructed Fig. 1b layout. Shared source/drain implant masks alone
  // cannot identify a junction or a conducting BTBT path.
  const {
    findTerminalQualifiedDopantOverlaps,
    auditSchematicWellBodyCoverage,
    auditSchematicBodyTieContacts,
  } = await import('../site/dopant-regions.js');
  const pm = TCMOS_MASKS.find((mask) => mask.id === 7).rectangles;
  const nm = TCMOS_MASKS.find((mask) => mask.id === 8).rectangles;
  const terminals = [
    { id: 'pMOS-source', kind: 'source', rect: pm[0] },
    { id: 'pMOS-drain', kind: 'drain', rect: pm[1] },
    { id: 'nMOS-drain', kind: 'drain', rect: nm[0] },
    { id: 'nMOS-source', kind: 'source', rect: nm[1] },
  ].map(({ rect: r, ...terminal }) => ({
    ...terminal,
    geom: v.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2),
  }));
  const terminalOverlaps = findTerminalQualifiedDopantOverlaps(model, terminals, v);
  const overlapAreas = Object.fromEntries(
    terminals.map(({ id }) => {
      const geom = v.unionGeometries(
        terminalOverlaps
          .filter((overlap) => overlap.terminalId === id)
          .map((overlap) => overlap.geom),
      );
      return [id, modelApi.geometryArea(geom)];
    }),
  );
  const wellBody = auditSchematicWellBodyCoverage(model, v, modelApi.geometryArea);
  const wellBodySummary = Object.fromEntries(
    ['donor', 'acceptor'].map((polarity) => {
      const fragments = wellBody.filter((item) => item.polarity === polarity);
      const summary = {
        schematicWellPresent: fragments.every((item) => item.hasMatchingSchematicWell),
        matchingWellVolumeUm3: 0,
        outsideMatchingWellVolumeUm3: 0,
        oppositeWellVolumeUm3: 0,
      };
      for (const item of fragments) {
        summary.matchingWellVolumeUm3 += item.matchingWellVolumeUm3;
        summary.outsideMatchingWellVolumeUm3 += item.outsideMatchingWellVolumeUm3;
        summary.oppositeWellVolumeUm3 += item.oppositeWellVolumeUm3;
      }
      return [polarity, summary];
    }),
  );
  const contactSites = [
    { id: 'pMOS-nwell-tie', net: 'VDD', polarity: 'donor', point: [-4.28, -1.37] },
    { id: 'nMOS-pwell-tie', net: 'GND', polarity: 'acceptor', point: [1.69, -1.37] },
  ].map((site) => {
    const region = model.regions.find((r) => v.pointInMulti(site.point, r.geom));
    const silicon = region?.stack.find((segment) => segment.layerId === 'base');
    assert.ok(silicon, 'Well-tie validation requires an actual silicon contact site');
    return { ...site, hostLayerId: 'base', surfaceZ: silicon.z1 };
  });
  const terminalNetProvenance = auditTcmosTerminalNetProvenance(TCMOS_MASKS, TCMOS_METAL_NETS);
  const bodyTieContactEvidence = {
    provenance: 'inferred U-shaped body-tie and METAL1 nets; not a released foundry layout',
    contacts: auditSchematicBodyTieContacts(model, contactSites, v),
  };
  const validation = {
    pass: true,
    doi: TCMOS_DOI,
    note: '130nm local layout and masks inferred; not the foundry GDS or calibrated TCAD.',
    source: 'Jeong et al. 2019 Fig.1 + Supplementary Fig.1 + Methods',
    gatesUm: GATE_LENGTH_UM,
    measuredGateLengthSourceReported: false,
    tiltDegrees: illustrativeTiltDeg,
    tiltSourceReported: false,
    processVariant: mode,
    availableVariants: project.snapshotBranches.branches.map((item) => item.id),
    maskLayers: TCMOS_MASKS.length,
    processNodes: nodes.length,
    recipeSteps: steps.length,
    bookmarks: bookmarks.length,
    implantMarkers: model.implants.length,
    dopantRegionIntents: model.dopantRegions.length,
    bodyTieContactEvidence,
    terminalNetProvenance,
    qualitativeJunctionEvidence: {
      kind: 'terminal-clipped-opposite-polarity-cooccupancy',
      sourceDrainTerminals: 'inferred from POLY separation and Metal1 contact routing',
      overlapAreaUm2: overlapAreas,
      quantifiedWellDoping: model.dopantRegions.some((region) => region.role === 'well'),
      schematicWellBodyCoverage: wellBodySummary,
      oxideStoppingPowerKnown: false,
      physicalJunctionResolved: false,
      btbtCurrentComputed: false,
    },
    electricalMarkers: model.electricalRegions.length,
    finalRegions: model.regions.length,
    finalMaterialLayers: model.layers.length,
    inspectionPreset: {
      hiddenMaterial: 'Interlayer SiO2',
      camera: copy(project.display.threeCamera),
    },
    checkpoints,
    keyAssumptions: [
      'The 130 nm foundry node is not a measured gate length. The drawn POLY width 0.44 µm follows the 24-pixel schematic stroke using the documented illustrative mapping; all Mask XY positions, CNT pitches and widths are illustrative, not foundry design rules.',
      'The 5 nm gate oxide is represented only under POLY footprints, avoiding an unphysical display blanket over STI and body-tie surfaces; foundry oxidation/strip steps remain abstracted.',
      'Si handle=2um, STI depth=230nm, fill=280nm, gate oxide=5nm, POLY=200nm, ILD=450nm and METAL1=200nm are model choices, not author measurements.',
      'As+ for left pMOS (HVTN window) and BF2+ for right nMOS (HVTP window); buried interval 80–240 nm is illustrative, not calibrated concentration or tunnel-junction thickness.',
      'Well/LDD/HDD annotations are qualitative; no dopant concentration, diffusion, activation, tunnelling current or inverter transfer curve is predicted.',
      'HVT body intent intersects both source and drain HDD intent in the assumed geometry. Opposite-polarity volumetric overlaps are not electrically resolved PN boundaries or BTBT junctions.',
      'HVT mask extends beyond ACTIVE and the schematic Well under STI: a small qualitative body volume survives beneath STI in silicon; actual ion stopping/penetration is not modeled.',
      'U-shaped n-/p-well body-tie contact geometry is inferred. No separate surface n+/p+ contact-dopant intent or verified ohmic contact is present.',
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
