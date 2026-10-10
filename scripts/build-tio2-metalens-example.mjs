/**
 * Paper-derived TiO2 achromatic metalens PROCESS reconstruction.
 * Y. Wang et al., Nat. Commun. 12, 5560 (2021)
 * https://doi.org/10.1038/s41467-021-25797-9
 *
 * The article and supplement specify the stack, lithography/Cr/RIE sequence,
 * diameter and four cross-sections, but NOT the optimized 4725-site coordinate
 * and dimension table. The local demonstrator and full-aperture GDS here are
 * parameterized illustrations, NOT the authors' design/optical reconstruction.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

export const DOI = '10.1038/s41467-021-25797-9';
export const DIAMETER_UM = 30;
export const PAPER_SITES = 4725;
export const FIXED_DATE = '2026-10-09T10:00:00.000Z';
export const LOCAL_FIELD_UM = 5;
const BASE = {
  shape: 'rect',
  width: 5,
  height: 5,
  thickness: 2,
  material: 'Glass (2um illustration)',
};
const SCALE_NOTE =
  'Local 5 x 5 um four-meta-atom demonstration; sizes and placement illustrative, NOT author mask';
const names = ['circle', 'square', 'ring', 'bipolar-concentric-ring'];

function circle(cx, cy, r, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
function square(cx, cy, half) {
  return [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
  ];
}
function ringQuads(cx, cy, outer, inner, n = 24) {
  const outside = circle(cx, cy, outer, n),
    inside = circle(cx, cy, inner, n);
  return outside.map((point, i) => [point, outside[(i + 1) % n], inside[(i + 1) % n], inside[i]]);
}
export function metaAtomPolygons(type, x, y, scale = 1) {
  if (type === 'circle') return [circle(x, y, 0.125 * scale)];
  if (type === 'square') return [square(x, y, 0.115 * scale)];
  if (type === 'ring') return ringQuads(x, y, 0.157 * scale, 0.092 * scale);
  if (type === 'bipolar-concentric-ring') {
    return [...ringQuads(x, y, 0.157 * scale, 0.102 * scale), circle(x, y, 0.048 * scale)];
  }
  throw new Error('Unknown meta-atom ' + type);
}
function sitesToElements(sites, layer = 1) {
  return sites.flatMap(({ type, x, y, scale = 1 }) =>
    metaAtomPolygons(type, x, y, scale).map((points) => ({
      kind: 'polygon',
      sourceCell: 'TIO2_METALENS',
      layer,
      datatype: 0,
      points,
    })),
  );
}
function layoutForElements(elements, width, height, description) {
  return {
    name: description,
    root: 'TIO2_METALENS',
    elements,
    linework: [],
    hierarchy: {},
    combos: [
      {
        key: 'TIO2_METALENS|1|0',
        cell: 'TIO2_METALENS',
        layer: 1,
        datatype: 0,
        count: elements.length,
      },
    ],
    bounds: {
      minX: -width / 2,
      minY: -height / 2,
      maxX: width / 2,
      maxY: height / 2,
      width,
      height,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
const localSites = Object.freeze([
  { id: 'C1', type: 'circle', x: -1.1, y: -1.1, scale: 1 },
  { id: 'S1', type: 'square', x: 1.1, y: -1.1, scale: 1 },
  { id: 'R1', type: 'ring', x: -1.1, y: 1.1, scale: 1 },
  { id: 'B1', type: 'bipolar-concentric-ring', x: 1.1, y: 1.1, scale: 1 },
]);
export function makeLocalLayout() {
  return layoutForElements(sitesToElements(localSites), 5, 5, SCALE_NOTE);
}
export function makeFullApertureIllustration(count = PAPER_SITES) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Invalid site count');
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sites = [];
  for (let i = 0; i < count; i++) {
    const r = 14.72 * Math.sqrt((i + 0.5) / count),
      angle = i * goldenAngle;
    // Deterministic radial variation illustrates 4 cross-section families;
    // NOT measured/design-optimized dimensions or physical optical phase.
    const type = names[(i * 7 + Math.floor(r * 3)) % 4];
    const scale = 0.76 + 0.11 * (0.5 + 0.5 * Math.cos(i * 0.37 + r));
    sites.push({
      id: 'A' + String(i + 1).padStart(4, '0'),
      x: Number((r * Math.cos(angle)).toFixed(6)),
      y: Number((r * Math.sin(angle)).toFixed(6)),
      type,
      scale: Number(scale.toFixed(6)),
    });
  }
  // Site-to-site clearance is checked using conservative bounding circles:
  // square uses its corner radius; circular/ring families use outer radius.
  // 40 nm is the paper's reported minimum feature, not a provided site table.
  const bins = new Map(),
    cell = 0.5;
  let minClearance = Infinity;
  for (const site of sites) {
    const ix = Math.floor(site.x / cell),
      iy = Math.floor(site.y / cell);
    const radius =
      (site.type === 'square' ? Math.SQRT2 * 0.115 : site.type === 'circle' ? 0.125 : 0.157) *
      site.scale;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const old of bins.get(ix + dx + ',' + (iy + dy)) || []) {
          const gap = Math.hypot(site.x - old.x, site.y - old.y) - radius - old.radius;
          minClearance = Math.min(minClearance, gap);
        }
      }
    const key = ix + ',' + iy;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push({ ...site, radius });
  }
  assert.ok(minClearance >= 0.04, 'illustrative pillars do not meet 40 nm separation');
  assert.ok(
    sites.every((site) => Math.hypot(site.x, site.y) + 0.15 < 15),
    'Metalens site extends outside 30 um aperture',
  );
  return {
    sites,
    minClearanceUm: minClearance,
    elements: sitesToElements(sites),
    note: 'Deterministic golden-angle placeholder; no optical phase/group-delay matching; NOT original GDS',
  };
}
function fileMask() {
  return {
    sourceMode: 'file',
    cell: 'TIO2_METALENS',
    layerKeys: ['1|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}
export async function buildMetalensLocal() {
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');
  const { validateProjectFile, validateProcessModel } = await import('../site/project-schema.js');
  const { readProjectFile } = await import('../site/project-io.js');

  const model = modelApi.createModel({ shape: 'rect', width: 5, height: 5, thickness: 2 });
  model.layers[0].name = BASE.material;
  const root = projectForBenchmark({ model, section: { a: [-2.3, 1.1], b: [2.3, 1.1] } });
  root.name = 'TiO2 achromatic metalens - four meta-atoms / source-derived process';
  root.layout = makeLocalLayout();
  root.activeCell = 'TIO2_METALENS';
  root.maskSourceMode = 'file';
  root.selectedLayerKeys = ['1|0'];
  root.drawMask = { nextShapeId: 1, shapes: [] };
  root.maskRoi = null;
  root.display.threeOpacity = 0.88;
  root.display.threeShowBorders = true;
  const steps = [],
    nodes = [],
    bookmarks = [],
    checkpoints = [],
    layers = new Map();
  const stageDate = (i) => new Date(Date.parse(FIXED_DATE) + i * 1000).toISOString();
  let parentId = null;

  const branch = {
    id: 'main',
    name: 'TiO2 metalens - 4-unit process',
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: FIXED_DATE,
    headState: null,
  };
  const snapshot = () => {
    const state = structuredClone(root);
    delete state.snapshots;
    delete state.snapshotBranches;
    state.model = structuredClone(model);
    state.processRecipe = normalizeProcessRecipe({
      name: 'TiO2 metalens PMMA/Cr lift-off and etch',
      base: BASE,
      steps,
    });
    return state;
  };
  function append(operation) {
    const id = 'tio2-stage-' + String(nodes.length).padStart(2, '0');
    const state = snapshot();
    const node = {
      id,
      branchId: 'main',
      parentId,
      createdAt: stageDate(nodes.length),
      processRevision: model.processRevision,
      operation,
      state,
    };
    nodes.push(node);
    parentId = id;
    if (!branch.rootNodeId) branch.rootNodeId = id;
    branch.headNodeId = id;
    branch.headState = structuredClone(state);
  }
  function bookmark(name) {
    const node = nodes.at(-1);
    const value = {
      id: 'tio2-bookmark-' + (bookmarks.length + 1),
      name,
      createdAt: stageDate(300 + bookmarks.length),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: structuredClone(node.state),
    };
    bookmarks.unshift(value);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = value.id;
    branch.headSnapshotId = value.id;
  }
  const polys = localSites.flatMap(({ type, x, y, scale }) => metaAtomPolygons(type, x, y, scale));
  const keep = v.unionGeometries(polys.map((points) => [[[...points, points[0]]]]));
  const inverse = v.difference(model.boundary, keep);
  const areaOf = (mode) => (mode === 'mask' ? keep : mode === 'invert' ? inverse : model.boundary);

  function execute(command, label, params, mode = 'full') {
    const face = 'front',
      area = areaOf(mode);
    const operation = {
      type: command === 'deposit' ? 'add' : command === 'liftoff' ? 'liftoff' : 'etch',
      face,
    };
    if (command === 'deposit')
      Object.assign(operation, {
        name: params.material,
        thickness: params.thickness,
        growth: params.coverage || 'direct',
      });
    else if (command === 'etch')
      Object.assign(operation, {
        etchProfile: params.profile || 'directional',
        thickness: params.depth,
        etchTargetLayerIds: [layers.get(params.target)],
      });
    else
      Object.assign(operation, {
        sacrificialLayerId: layers.get(params.sacrificial),
        thickness: 0,
      });
    assert.ok(
      !(
        (command === 'etch' && !operation.etchTargetLayerIds[0]) ||
        (command === 'liftoff' && !operation.sacrificialLayerId)
      ),
      label + ' missing target',
    );
    const result =
      applyAdvancedProcessOperation(model, operation, area, modelApi, v) ||
      modelApi.applyOperation(model, { ...operation, area });
    assert.equal(
      result?.changed,
      true,
      label + ': ' + (result?.error || 'operation did not change geometry'),
    );
    if (command === 'deposit') layers.set(params.material, result.layerId);
    const recipeParams = { ...params, area: mode, face };
    if (mode !== 'full') recipeParams.mask = fileMask();
    if (command === 'deposit') {
      recipeParams.thicknessUm = recipeParams.thickness;
      delete recipeParams.thickness;
    }
    if (command === 'etch') {
      recipeParams.thicknessUm = recipeParams.depth;
      delete recipeParams.depth;
    }
    steps.push({ command, params: recipeParams });
    append({
      kind: operation.type,
      label,
      face,
      areaMode: mode,
      geometryChanged: true,
      ...(command === 'deposit'
        ? { name: params.material, thickness: params.thickness, resultLayerId: result.layerId }
        : command === 'liftoff'
          ? { sacrificialLayerId: operation.sacrificialLayerId }
          : {
              thickness: params.depth,
              etchTargetLayerIds: operation.etchTargetLayerIds,
              etchProfile: 'directional',
            }),
      replay: {
        version: 1,
        params: structuredClone(operation),
        areaMode: mode,
        maskContext: mode === 'full' ? null : fileMask(),
      },
    });
    validateProcessModel(model);
    checkpoints.push({
      label,
      command,
      regions: model.regions.length,
      layers: model.layers.length,
    });
    return result;
  }
  function record(label, note) {
    model.revision++;
    model.processRevision++;
    steps.push({ command: 'record', params: { process: 'custom', label, note } });
    append({
      kind: 'record',
      label,
      geometryChanged: false,
      note,
      replay: { version: 1, kind: 'record' },
    });
    validateProcessModel(model);
  }
  function topAt(x, y) {
    const r = model.regions.find((r) => v.pointInMulti([x, y], r.geom));
    return r?.stack?.at(-1)?.layerId ?? null;
  }
  append({
    kind: 'base',
    label: 'ITO-coated glass (2 um glass is a display surrogate)',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  record(
    'Clean 13nm ITO glass',
    'Acetone / methanol / IPA, per Supplementary Note 4; cleaning is process metadata',
  );
  execute('deposit', 'ITO film 13 nm', { material: 'ITO', thickness: 0.013 });
  bookmark('S00 · Glass / 13 nm ITO');
  execute('deposit', 'E-beam evaporate TiO2 1500 nm', { material: 'TiO2', thickness: 1.5 });
  bookmark('S01 · Blanket TiO2 1500 nm');
  execute('deposit', 'Spin coat PMMA A2 200 nm', { material: 'PMMA', thickness: 0.2 });
  execute(
    'etch',
    'Develop EBL-positive PMMA openings',
    { target: 'PMMA', depth: 0.2, profile: 'directional' },
    'mask',
  );
  assert.equal(topAt(-1.1, -1.1), layers.get('TiO2'), 'Circle opening should expose TiO2');
  bookmark('S02 · Developed PMMA positive resist');
  execute('deposit', 'Directionally evaporate Cr 30 nm', { material: 'Cr', thickness: 0.03 });
  execute('liftoff', 'Lift off PMMA and supported Cr', { sacrificial: 'PMMA' });
  assert.equal(topAt(-1.1, -1.1), layers.get('Cr'), 'Cr must survive in the pillar opening');
  assert.equal(topAt(0, 0), layers.get('TiO2'), 'Cr over resist must leave background empty');
  bookmark('S03 · Cr hard mask after lift-off');
  execute(
    'etch',
    'RIE TiO2 1500 nm in inverted Cr mask',
    { target: 'TiO2', depth: 1.5, profile: 'directional' },
    'invert',
  );
  assert.equal(topAt(-1.1, -1.1), layers.get('Cr'), 'Cr must protect circle pillar');
  assert.equal(topAt(0, 0), layers.get('ITO'), 'Etched field must stop at ITO');
  // Ring center and bipolar annular gap must be void after TiO2 etch.
  assert.equal(topAt(-1.1, 1.1), layers.get('ITO'), 'Ring hole incorrectly filled');
  assert.equal(
    topAt(1.1 + 0.077, 1.1),
    layers.get('ITO'),
    'Bipolar annular gap incorrectly filled',
  );
  assert.equal(topAt(1.1, 1.1), layers.get('Cr'), 'Bipolar center disk must remain');
  bookmark('S04 · TiO2 RIE vertical pillars');
  execute('etch', 'Strip Cr hard mask 30 nm', {
    target: 'Cr',
    depth: 0.03,
    profile: 'directional',
  });
  assert.equal(topAt(-1.1, -1.1), layers.get('TiO2'), 'TiO2 pillar vanished after strip');
  assert.equal(topAt(-1.1, 1.1), layers.get('ITO'), 'Ring hole filled after strip');
  assert.equal(topAt(0, 0), layers.get('ITO'), 'Background ITO altered after strip');
  bookmark('S05 · TiO2 metalens unit cells / final');

  Object.assign(root, snapshot());
  root.snapshots = bookmarks;
  root.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: branch.headNodeId,
    cursorSnapshotId: branch.headSnapshotId,
    nodes,
    branches: [branch],
  };
  validateProjectFile(root);
  const preflight = validateRecipeExecution(root.processRecipe.steps, {
    model,
    maskState: { layout: root.layout },
    base: root.processRecipe.base,
    startMode: 'new-base',
  });
  assert.deepEqual(preflight.errors, [], 'Recipe preflight');
  const { serializeProject } = await import('../site/project-io.js');
  const serialized = serializeProject(root);
  const reopened = await readProjectFile({
    size: Buffer.byteLength(serialized),
    text: async () => serialized,
  });
  validateProjectFile(reopened);
  // Canonical project storage quantizes XY to 0.1 nm. Polygon vertices can
  // legitimately differ from the in-memory trigonometric circle coordinates,
  // while their material stacks and feature topology remain unchanged.
  assert.equal(reopened.model.regions.length, root.model.regions.length);
  assert.deepEqual(reopened.model.layers, root.model.layers);
  for (const sample of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [-1.1 + 0.135, 1.1],
    [1.1, 1.1],
    [1.1 + 0.078, 1.1],
    [0, 0],
  ]) {
    const segments = (sampled) =>
      sampled.regions
        .find((r) => v.pointInMulti(sample, r.geom))
        ?.stack.map((item) => [
          item.layerId,
          Number(item.z0.toFixed(4)),
          Number(item.z1.toFixed(4)),
        ]);
    assert.deepEqual(
      segments(reopened.model),
      segments(root.model),
      'Saved geometry differs at probe ' + sample.join(','),
    );
  }
  assert.equal(reopened.snapshotBranches.nodes.length, nodes.length);
  assert.equal(reopened.processRecipe.steps.length, steps.length);
  return {
    project: root,
    json: serialized,
    report: {
      pass: true,
      doi: DOI,
      sourceFidelity: 'reported materials/thickness and process; XY is illustrative',
      localSites: localSites.map((s) => ({ ...s })),
      localMaskPolygons: root.layout.elements.length,
      stages: nodes.length,
      recipeSteps: steps.length,
      bookmarks: bookmarks.length,
      finalRegions: model.regions.length,
      finalLayers: model.layers.length,
      checkpoints,
      limitations: [
        'No author GDS or optimized XY dimensions available in article/supplement',
        'No simulated optical focusing, group delay, RIE chemical kinetics or real sidewall angle',
        'Glass handle 2um is display-only illustrative thickness',
      ],
    },
  };
}
export async function generateMetalensArtifacts({ outputDir, full = true } = {}) {
  const { project, json, report } = await buildMetalensLocal();
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'tio2-metalens-four-unit-process.wafercad'), json);
  const { serializeGDS } = await import('../site/layout-export.js');
  const { parseLayoutFile } = await import('../site/layout-io.js');
  const fixture = serializeGDS(project.layout.elements, { cellName: 'TIO2_UNIT_FIXTURE' });
  await writeFile(join(outputDir, 'tio2-four-unit-mask.gds'), fixture);
  const parsed = await parseLayoutFile(
    fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength),
    'unit.gds',
  );
  assert.ok(parsed.layout.elements.length > 4, 'Mask GDS did not round-trip');
  report.unitMaskGdsBytes = fixture.byteLength;
  if (full) {
    const fullMask = makeFullApertureIllustration();
    assert.equal(fullMask.sites.length, PAPER_SITES);
    const gds = serializeGDS(fullMask.elements, { cellName: 'TIO2_30UM_PAPER_DERIVED' });
    await writeFile(join(outputDir, 'tio2-30um-4725-sites-ILLUSTRATIVE.gds'), gds);
    // The separate 4725-site Mask must really re-import through the
    // product GDS decoder; a successfully written byte stream is not enough.
    const roundTrip = await parseLayoutFile(
      gds.buffer.slice(gds.byteOffset, gds.byteOffset + gds.byteLength),
      'tio2-30um-4725-sites-ILLUSTRATIVE.gds',
    );
    assert.equal(
      roundTrip.layout.elements.length,
      fullMask.elements.length,
      'Full-aperture GDS lost or duplicated polygons on import',
    );
    const head = 'id,x_um,y_um,type,scale_NOTE_illustrative\n';
    await writeFile(
      join(outputDir, 'tio2-30um-4725-sites-ILLUSTRATIVE.csv'),
      head +
        fullMask.sites.map((s) => [s.id, s.x, s.y, s.type, s.scale].join(',')).join('\n') +
        '\n',
    );
    report.fullAperture = {
      diameterUm: DIAMETER_UM,
      count: fullMask.sites.length,
      polygons: fullMask.elements.length,
      bytes: gds.byteLength,
      minConservativeClearanceUm: fullMask.minClearanceUm,
      reimportedPolygons: roundTrip.layout.elements.length,
      opticalValidity: 'NOT VALIDATED; design optimization data unavailable',
    };
  }
  await writeFile(
    join(outputDir, 'reconstruction-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
async function main() {
  const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'test-results', 'metalens');
  const report = await generateMetalensArtifacts({
    outputDir: dir,
    full: !process.argv.includes('--local-only'),
  });
  console.log(JSON.stringify({ result: 'PASS', output: dir, ...report }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
