/**
 * Build source-constrained single-unit SWX photonic MEMS WaferCAD examples.
 * The two files are geometric OFF/ON poses, not mechanically simulated frames.
 * Source: Hu et al., Nature Communications 16, 331 (2025).
 * DOI https://doi.org/10.1038/s41467-024-55528-9
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import { createSwxGeometry, SWX_ASSUMPTIONS, SWX_REPORTED, SWX_DOI } from './swx-mems-geometry.mjs';

const DATE = '2026-10-14T10:30:00.000Z';
const CELL = 'SWX_MEMS_UNIT';
const BOX = 'Buried SiO2 (BOX)';
const DEVICE = '220nm SOI device silicon';
const HANDLE = 'Si handle (5um viewing surrogate)';
const CR = 'Cr electrode';
const AU = 'Au electrode';

const clone = (value) => structuredClone(value);
function mask(layer) {
  return {
    sourceMode: 'file',
    cell: CELL,
    layerKeys: [layer + '|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
}

function readPoint(model, v, point) {
  return model.regions.find((region) => v.pointInMulti(point, region.geom)) || null;
}

export async function buildSwxMems(state = 'off') {
  if (state !== 'off') {
    throw new Error(
      'Fabrication uses only the shared OFF mask; buildSwxMemsUnified() creates ON as a post-release Variant.',
    );
  }
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const vectorApi = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { validateRecipeExecution } = await import('../site/process-recipe-preflight.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const source = createSwxGeometry(state);
  const [width, height] = SWX_ASSUMPTIONS.fieldUm;
  const BASE = {
    shape: 'rect',
    width,
    height,
    thickness: SWX_ASSUMPTIONS.handleSiUm,
    material: HANDLE,
  };
  const model = modelApi.createModel({
    shape: 'rect',
    width,
    height,
    thickness: SWX_ASSUMPTIONS.handleSiUm,
  });
  model.layers[0].name = HANDLE;
  const project = projectForBenchmark({
    model,
    section: { a: [-31, -5], b: [-31, 5] },
  });
  project.name = 'Hu 2025 split-waveguide-crossing MEMS switch · ' + state.toUpperCase();
  project.layout = source.layout;
  project.maskSourceMode = 'file';
  project.activeCell = CELL;
  project.selectedLayerKeys = ['1|0', '2|0', '3|0'];
  project.maskRoi = null;
  project.drawMask = { nextShapeId: 1, shapes: [] };
  project.display.threeOpacity = 0.7;
  project.display.threeShowBorders = true;

  const steps = [],
    nodes = [],
    bookmarks = [],
    checkpoints = [];
  const layerIds = new Map([[HANDLE, 'base']]);
  const areas = new Map();
  let parentId = null;
  const branch = {
    id: 'main',
    name: 'SWX single switch · ' + state.toUpperCase(),
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: DATE,
    headState: null,
  };
  function date(i) {
    return new Date(Date.parse(DATE) + i * 1000).toISOString();
  }
  function getArea(layer, invert = false) {
    if (!areas.has(layer)) {
      const polygons = source.maskPolygons.get(layer);
      assert.ok(polygons?.length, 'Missing mask layer ' + layer);
      const shapes = polygons.map((points) => [[[...points, points[0]]]]);
      areas.set(layer, vectorApi.unionGeometries(shapes));
    }
    return invert ? vectorApi.difference(model.boundary, areas.get(layer)) : areas.get(layer);
  }
  function capture() {
    const value = clone(project);
    delete value.snapshots;
    delete value.snapshotBranches;
    value.model = clone(model);
    value.processRecipe = normalizeProcessRecipe({
      name: 'Paper-constrained SWX SOI EBL / metallization / HF release',
      base: BASE,
      steps,
    });
    return value;
  }
  function append(operation) {
    const id = 'swx-' + state + '-' + String(nodes.length).padStart(2, '0');
    const node = {
      id,
      branchId: 'main',
      parentId,
      createdAt: date(nodes.length),
      processRevision: model.processRevision,
      operation,
      state: capture(),
    };
    nodes.push(node);
    parentId = id;
    if (!branch.rootNodeId) branch.rootNodeId = id;
    branch.headNodeId = id;
    branch.headState = clone(node.state);
  }
  function bookmark(name) {
    const node = nodes.at(-1);
    const snapshot = {
      id: 'swx-' + state + '-bookmark-' + (bookmarks.length + 1),
      name,
      createdAt: date(300 + bookmarks.length),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: clone(node.state),
    };
    bookmarks.unshift(snapshot);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = snapshot.id;
    branch.headSnapshotId = snapshot.id;
  }
  function validate(label) {
    validateProcessModel(model);
    checkpoints.push({
      stage: label,
      processRevision: model.processRevision,
      regions: model.regions.length,
      layers: model.layers.length,
    });
  }
  function execute(label, command, params, layer = null, invert = false) {
    const areaMode = layer == null ? 'full' : invert ? 'invert' : 'mask';
    const raw = {
      ...params,
      face: 'front',
      area: areaMode,
      ...(layer == null ? {} : { mask: mask(layer) }),
    };
    const op =
      command === 'deposit'
        ? {
            type: 'add',
            name: params.material,
            thickness: params.thicknessUm,
            growth: 'direct',
            face: 'front',
          }
        : {
            type: 'etch',
            thickness: params.thicknessUm,
            etchProfile: params.profile,
            face: 'front',
            etchTargetLayerIds: [layerIds.get(params.target)],
          };
    if (command === 'etch') assert.ok(op.etchTargetLayerIds[0], label + ': unknown etch target');
    const area = layer == null ? model.boundary : getArea(layer, invert);
    const result =
      applyAdvancedProcessOperation(model, op, area, modelApi, vectorApi) ||
      modelApi.applyOperation(model, { ...op, area });
    assert.equal(
      result?.changed,
      true,
      label + ': ' + (result?.error || 'did not change geometry'),
    );
    if (command === 'deposit') layerIds.set(params.material, result.layerId);
    steps.push({ command, params: raw });
    const replay = {
      version: 1,
      params: clone(op),
      areaMode,
      maskContext: layer == null ? null : mask(layer),
    };
    append({
      kind: command === 'deposit' ? 'add' : 'etch',
      label,
      geometryChanged: true,
      face: 'front',
      areaMode,
      ...(command === 'deposit'
        ? {
            name: op.name,
            thickness: op.thickness,
            growth: 'direct',
            resultLayerId: result.layerId,
          }
        : {
            thickness: op.thickness,
            targetLayerIds: op.etchTargetLayerIds,
            etchProfile: op.etchProfile,
          }),
      replay,
    });
    validate(label);
    return result;
  }
  function deposit(label, material, thicknessUm, layer = null) {
    return execute(label, 'deposit', { material, thicknessUm, coverage: 'directional' }, layer);
  }
  function etch(label, target, thicknessUm, profile, layer, invert = false) {
    return execute(label, 'etch', { target, thicknessUm, profile }, layer, invert);
  }
  function record(label, note) {
    model.revision++;
    model.processRevision++;
    const params = { label, process: 'custom', note };
    steps.push({ command: 'record', params });
    append({
      kind: 'record',
      label,
      processType: 'custom',
      note,
      geometryChanged: false,
      replay: { version: 1, kind: 'record' },
    });
    validate(label);
  }

  append({
    kind: 'base',
    label: 'Si handle / thickness illustrative',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  validate('Si handle');
  bookmark('00 SOI handle surrogate');

  deposit('SOI BOX 2um', BOX, SWX_REPORTED.boxUm);
  deposit('SOI device silicon 220nm', DEVICE, SWX_REPORTED.siliconUm);
  bookmark('01 SOI substrate / 220nm device layer');

  record(
    'EBL ridge mask / proximity correction',
    'Paper reports EBL + proximity effect correction; original mask polygons unavailable.',
  );
  etch('150nm ridge-waveguide etch', DEVICE, SWX_REPORTED.ridgeEtchUm, 'directional', 2);
  record(
    'EBL full-depth strip, MEMS, and SWT pattern',
    'Mask 1 reconstructs full-height silicon and mechanical features. SWT pitch/depth are reported; coordinates are inferred.',
  );
  etch(
    '220nm full-height Si etch outside devices',
    DEVICE,
    SWX_REPORTED.fullEtchUm,
    'directional',
    1,
    true,
  );
  bookmark('02 Patterned optical and mechanical silicon');

  record(
    'Photolithography / patterned electrodes',
    'Cr/Au lithography followed by evaporation and lift-off. Direct masked film placement is a geometric equivalent, not resist-flow simulation.',
  );
  deposit('E-beam evaporated Cr 50nm', CR, SWX_REPORTED.crUm, 3);
  deposit('E-beam evaporated Au 300nm', AU, SWX_REPORTED.auUm, 3);
  record(
    'Cr/Au lift-off',
    'The physical metal removal outside electrode openings is represented by masked deposition.',
  );
  bookmark('03 Metal contacts before release');

  const beamBefore = readPoint(model, vectorApi, source.releasedBeamTestPoint);
  assert.ok(
    beamBefore?.stack.some((item) => item.layerId === layerIds.get(BOX)),
    'A suspended beam requires pre-release BOX beneath it',
  );
  etch(
    'HF vapor BOX undercut release, illustrative 2um lateral front',
    BOX,
    SWX_ASSUMPTIONS.releaseUndercutUm,
    'undercut',
    1,
    true,
  );
  record(
    'Dry released MEMS inspection / illustrative ' + state.toUpperCase() + ' geometry',
    'Release is canonical geometric BOX removal. ON pose is an alternative mask geometry; no dynamic actuation, optical FEM/FDTD or stiction model.',
  );
  bookmark('04 Released SWX / ' + state.toUpperCase());

  const beam = readPoint(model, vectorApi, source.releasedBeamTestPoint);
  const anchor = readPoint(model, vectorApi, source.anchorTestPoint);
  const gapPoint = [-31, SWX_REPORTED.offGapUm / 2 - source.gapUm / 2];
  const gap = readPoint(model, vectorApi, gapPoint);
  assert.ok(
    beam?.stack.some((item) => item.layerId === layerIds.get(DEVICE)),
    'Released beam lost its Si device layer',
  );
  assert.ok(
    !beam?.stack.some((item) => item.layerId === layerIds.get(BOX)),
    'Suspended beam must have a real BOX void',
  );
  assert.ok(
    anchor?.stack.some((item) => item.layerId === layerIds.get(BOX)),
    'Stationary anchor lost its BOX support',
  );
  assert.ok(
    !gap?.stack.some((item) => item.layerId === layerIds.get(DEVICE)),
    'Central SWX air gap was filled with Si',
  );

  Object.assign(project, capture());
  project.name = 'SWX MEMS · ' + state.toUpperCase() + ' · paper-constrained reconstruction';
  project.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
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
  assert.deepEqual(preflight.errors, [], 'Recipe preflight failed');

  const stored = prepareProjectForWorkspaceStorage(project);
  const json = JSON.stringify(stored);
  const restored = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(restored);
  assert.deepEqual(restored.model, project.model, 'Model changed across project serialization');
  assert.equal(restored.snapshotBranches.nodes.length, nodes.length);
  assert.equal(restored.processRecipe.steps.length, steps.length);

  const validation = {
    pass: true,
    state,
    doi: SWX_DOI,
    maskProvenance: SWX_ASSUMPTIONS.maskSource,
    geometricGapUm: source.gapUm,
    movableRigidBodyTravelUm: source.travelUm,
    paperDimensions: SWX_REPORTED,
    reconstructionAssumptions: SWX_ASSUMPTIONS,
    operations: steps.length,
    historyNodes: nodes.length,
    bookmarks: bookmarks.length,
    finalLayers: model.layers.length,
    finalRegions: model.regions.length,
    outputBytes: Buffer.byteLength(json),
    checks: {
      sourceMasksEmbedded: true,
      SOIStackReconstructed: true,
      releasedBeamHasCanonicalAirGap: true,
      anchorRetainsBOX: true,
      SWXOpticalGapRemainsOpen: true,
      recipePreflight: true,
      projectIO: true,
    },
    checkpoints,
  };
  return { project, json, validation };
}

// Pose deformation is an inspection-state geometric surrogate, NOT a new
// fabrication operation. Keep the manufactured OFF Mask and released BOX
// exactly the same in both Variants. Only the released Si footprint changes.
// This currently approximates flexure through the explicit pose polygons;
// no voltage/displacement or mechanical stress is solved.
export async function makeSwxActuatedModel(released, pose = createSwxGeometry('on')) {
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const out = clone(released);
  const layer = out.layers.find((item) => item.name === DEVICE);
  assert.ok(layer, 'Missing shared-fabrication device silicon');
  const toMulti = (polygons) =>
    v.unionGeometries(polygons.map((points) => [[[...points, points[0]]]]));
  const silicon = toMulti(pose.maskPolygons.get(1));
  const ridge = toMulti(pose.maskPolygons.get(2));
  const full = v.difference(silicon, ridge);
  const shallow = v.intersection(silicon, ridge);
  const bottom = SWX_ASSUMPTIONS.handleSiUm / 2 + SWX_REPORTED.boxUm;
  const cap = bottom + SWX_REPORTED.siliconUm;
  const planarZ = bottom + SWX_REPORTED.siliconUm - SWX_REPORTED.ridgeEtchUm;
  const regions = [];
  let next = out.nextRegionId;
  for (const region of out.regions) {
    const stack = region.stack.filter((segment) => segment.layerId !== layer.id);
    for (const [scope, high] of [
      [full, cap],
      [shallow, planarZ],
      [v.difference(out.boundary, silicon), null],
    ]) {
      const clipped = v.intersection(region.geom, scope);
      if (!clipped.length) continue;
      const segments =
        high == null
          ? stack
          : modelApi.normalizeStack([...stack, { layerId: layer.id, z0: bottom, z1: high }]);
      regions.push({ id: 'region-' + next++, geom: clipped, stack: clone(segments) });
    }
  }
  out.regions = regions;
  out.nextRegionId = next;
  out.revision++;
  // Deliberately retain processRevision. This is a post-fabrication pose,
  // not a recipe step; branch restoration owns its persistence.
  const { validateProcessModel } = await import('../site/project-schema.js');
  validateProcessModel(out);
  return out;
}

export async function buildSwxMemsUnified() {
  const { project, validation: offValidation } = await buildSwxMems('off');
  const onPose = createSwxGeometry('on');
  const onModel = await makeSwxActuatedModel(project.model, onPose);
  const v = await import('../site/vector-geometry.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const deviceId = project.model.layers.find((layer) => layer.name === DEVICE).id;
  const boxId = project.model.layers.find((layer) => layer.name === BOX).id;
  const onBeam = readPoint(onModel, v, onPose.releasedBeamTestPoint);
  const onAnchor = readPoint(onModel, v, onPose.anchorTestPoint);
  assert.ok(
    onBeam?.stack.some((s) => s.layerId === deviceId),
    'ON device silicon missing',
  );
  assert.ok(!onBeam?.stack.some((s) => s.layerId === boxId), 'ON beam is not released');
  assert.ok(
    onAnchor?.stack.some((s) => s.layerId === boxId),
    'ON pose moved BOX anchor',
  );

  const common = project.snapshotBranches.nodes.at(-1);
  assert.equal(common.branchId, 'main');
  const onState = clone(project);
  delete onState.snapshots;
  delete onState.snapshotBranches;
  onState.model = onModel;
  // The manufactured lithographic layout remains identical. The moved silicon
  // is saved only as a restorable model state.
  assert.deepEqual(onState.layout, project.layout);
  assert.deepEqual(onState.processRecipe, project.processRecipe);
  const poseNode = {
    id: 'swx-actuated-on',
    branchId: 'on',
    parentId: common.id,
    processRevision: onModel.processRevision,
    createdAt: dateAt(520),
    operation: {
      kind: 'record',
      label: 'ON pose · 15nm optical gap (geometric approximation)',
      note: 'Restorable non-fabrication state. Shares the OFF mask, process Recipe and released BOX. Mechanical strain and voltages are not solved.',
      processType: 'custom',
      geometryChanged: true,
      pose: {
        kind: 'actuation-state',
        displacementUm: onPose.travelUm,
        sourceGapUm: SWX_REPORTED.offGapUm,
        targetGapUm: SWX_REPORTED.onGapUm,
      },
      // No replay metadata: a Record command would not reproduce deformation.
    },
    state: clone(onState),
  };
  const previousOffBookmark = project.snapshotBranches.branches[0].headSnapshotId;
  const onBookmark = {
    id: 'swx-on-bookmark',
    name: '05 Actuated ON · 15nm gap',
    branchId: 'on',
    parentId: previousOffBookmark,
    historyNodeId: poseNode.id,
    createdAt: dateAt(521),
    state: clone(onState),
  };
  project.snapshotBranches.nodes.push(poseNode);
  project.snapshots.unshift(onBookmark);
  project.snapshotBranches.branches[0].name = 'OFF · relaxed 900nm';
  project.snapshotBranches.branches.push({
    id: 'on',
    name: 'ON · actuated 15nm',
    parentBranchId: 'main',
    rootNodeId: common.id,
    headNodeId: poseNode.id,
    headState: clone(onState),
    rootSnapshotId: null,
    headSnapshotId: onBookmark.id,
    createdAt: dateAt(520),
  });
  project.snapshotBranches.activeBranchId = 'main';
  project.name = 'SWX photonic MEMS · one device, OFF/ON Variants';
  validateProjectFile(project);
  const stored = prepareProjectForWorkspaceStorage(project);
  const json = JSON.stringify(stored);
  const restored = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(restored);
  assert.equal(restored.snapshotBranches.branches.length, 2);
  assert.deepEqual(restored.snapshotBranches.branches[1].headState.layout, restored.layout);
  assert.deepEqual(
    restored.snapshotBranches.branches[1].headState.processRecipe,
    restored.processRecipe,
  );
  const onGap = onPose.gapUm;
  assert.ok(Math.abs(onGap - SWX_REPORTED.onGapUm) < 1e-10);
  const validation = {
    ...offValidation,
    unified: true,
    sourceMaskSharedByBothVariants: true,
    processRecipeSharedByBothVariants: true,
    independentFEMModel: false,
    branches: project.snapshotBranches.branches.map((b) => b.name),
    onGapUm: onGap,
    onPoseTravelUm: onPose.travelUm,
    onPoseRegions: onModel.regions.length,
    historyNodes: project.snapshotBranches.nodes.length,
    projectBytes: Buffer.byteLength(json),
  };
  return { project, json, validation };
}

function dateAt(index) {
  return new Date(Date.parse(DATE) + index * 1000).toISOString();
}

async function main() {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const target = process.argv.includes('--write-repo')
    ? join(repo, 'site/examples')
    : join(repo, 'test-results/swx-mems');
  await mkdir(target, { recursive: true });
  const { json, validation } = await buildSwxMemsUnified();
  await writeFile(join(target, 'swx-photonic-mems.wafercad'), json);
  const reportPath = join(repo, 'test-results/swx-mems');
  await mkdir(reportPath, { recursive: true });
  await writeFile(join(reportPath, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        pass: true,
        outputDirectory: target,
        project: 'swx-photonic-mems.wafercad',
        variants: validation.branches,
        historyNodes: validation.historyNodes,
        outputBytes: validation.projectBytes,
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
