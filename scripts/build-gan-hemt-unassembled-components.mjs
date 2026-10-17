/**
 * Four native GaN workpieces with four independent Main histories.
 * No wafer Bond, die placement, assembly or Au wire has been performed.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  buildGanMicrochannel,
  GAN_MICROCHANNEL_MASKS,
  GAN_GSG_STACK,
} from './build-gan-hemt-microchannel-example.mjs';

const STAMP = '2026-10-14T08:00:00.000Z';
const CELL = 'Lian_2022_UNASSEMBLED';
const clone = (value) => structuredClone(value);

function projectWithMain(nodes, bookmarks, recipe, name) {
  const last = nodes.at(-1);
  assert.ok(nodes.length && last?.state);
  const main = {
    id: 'main',
    name: 'Main · ' + name,
    parentBranchId: null,
    rootNodeId: nodes[0].id,
    headNodeId: last.id,
    rootSnapshotId: bookmarks.at(-1)?.id || null,
    headSnapshotId: bookmarks[0]?.id || null,
    headState: clone(last.state),
    createdAt: STAMP,
  };
  const project = clone(last.state);
  project.name = name;
  project.processRecipe = clone(recipe);
  project.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: last.id,
    cursorSnapshotId: main.headSnapshotId,
    nodes,
    branches: [main],
  };
  project.snapshots = bookmarks;
  delete project.assemblyWires;
  return project;
}

function interposerFromCheckpoint(combined) {
  const nodes = combined.snapshotBranches.nodes.slice(0, 31).map(clone);
  assert.equal(
    nodes.at(-1).operation.label,
    'Unverified TSV electrical quality and remaining wiring (metadata only)',
  );
  const maskIds = new Set([10, 11, 12, 13, 14, 21, 22, 23, 25, 29]);
  const layout = clone(combined.layout);
  layout.name = 'Si interposer: local source and inferred masks';
  layout.elements = layout.elements.filter((item) => maskIds.has(item.layer));
  layout.combos = layout.combos.filter((item) => maskIds.has(item.layer));
  const selection = ['10|0', '11|0', '12|0', '13|0', '22|0'];
  for (const node of nodes) {
    node.state.layout = clone(layout);
    node.state.selectedLayerKeys = selection;
    delete node.state.assemblyWires;
  }
  const allowed = new Set(nodes.map((node) => node.id));
  const bookmarks = combined.snapshots
    .filter((bookmark) => allowed.has(bookmark.historyNodeId))
    .map(clone);
  for (const bookmark of bookmarks) {
    bookmark.state.layout = clone(layout);
    bookmark.state.selectedLayerKeys = selection;
    delete bookmark.state.assemblyWires;
  }
  const note =
    'Paper fabrication only: separately etched Si wafers later direct-bonded (NOT SIMULATED)';
  nodes[1].operation.label = note;
  for (const node of nodes) {
    if (node.operation.label?.includes('(bonding surrogate)')) {
      node.operation.label = node.operation.label.replace(
        '(bonding surrogate)',
        '(geometric surrogate, NO Bond)',
      );
    }
    if (node.state.processRecipe?.steps?.[0]?.params?.label) {
      node.state.processRecipe.steps[0].params.label = note;
    }
  }
  for (const bookmark of bookmarks) {
    if (bookmark.state.processRecipe?.steps?.[0]?.params?.label) {
      bookmark.state.processRecipe.steps[0].params.label = note;
    }
  }
  const recipe = clone(nodes.at(-1).state.processRecipe);
  const head = clone(nodes.at(-1).state);
  head.roi = { type: 'rect', a: [-520, 0], b: [520, 650] };
  head.section = { a: [-660, 0], b: [660, 0] };
  head.display.threeOpacity = 1;
  nodes.at(-1).state = head;
  return projectWithMain(
    nodes,
    bookmarks,
    recipe,
    'HR-Si four-tier microchannel interposer — NOT BONDED',
  );
}

function localPolygons(masks) {
  return masks.flatMap((mask) => [
    ...mask.rectangles.map(({ x, y, w, h }) => ({
      kind: 'polygon',
      sourceCell: CELL,
      layer: mask.id,
      datatype: 0,
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
    })),
    ...(mask.polygons || []).map((points) => ({
      kind: 'polygon',
      sourceCell: CELL,
      layer: mask.id,
      datatype: 0,
      points: clone(points),
    })),
  ]);
}

async function dieProject({ role, width, height, thickness, masks, steps, color, label }) {
  const { createModel, applyOperation } = await import('../site/model.js');
  const { rectMulti, unionGeometries } = await import('../site/vector-geometry.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const model = createModel({ shape: 'rect', width, height, thickness });
  model.layers[0].name = label + ' substrate';
  model.layers[0].color = color;
  const project = projectForBenchmark({
    model,
    section: { a: [-width * 0.47, 0], b: [width * 0.47, 0] },
  });
  project.layout = {
    ...project.layout,
    name: label + ': inferred component-local masks',
    root: CELL,
    elements: localPolygons(masks),
    combos: masks.map((mask) => ({
      key: CELL + '|' + mask.id + '|0',
      cell: CELL,
      layer: mask.id,
      datatype: 0,
      count: mask.rectangles.length + (mask.polygons?.length || 0),
    })),
  };
  project.activeCell = CELL;
  project.maskSourceMode = 'file';
  project.selectedLayerKeys = masks.map((mask) => mask.id + '|0');
  project.display.threeOpacity = 1;
  project.display.threeShowBorders = true;
  project.display.threeCamera = {
    position: [width * 1.4, -height * 1.6, Math.max(width, height) * 1.25],
    target: [0, 0, thickness / 2],
    fov: 35,
  };
  const base = {
    shape: 'rect',
    width,
    height,
    thickness,
    material: model.layers[0].name,
  };
  const nodes = [];
  const stepsSoFar = [];
  const stamp = (index) => new Date(Date.parse(STAMP) + index * 1000).toISOString();
  function state() {
    return {
      ...clone(project),
      model: clone(model),
      processRecipe: normalizeProcessRecipe({
        name: label + ': unassembled die process',
        base,
        steps: stepsSoFar,
      }),
    };
  }
  function addNode(operation) {
    nodes.push({
      id: role + '-step-' + String(nodes.length).padStart(2, '0'),
      branchId: 'main',
      parentId: nodes.at(-1)?.id || null,
      createdAt: stamp(nodes.length),
      processRevision: model.processRevision,
      operation,
      state: state(),
    });
  }
  addNode({ kind: 'base', label: label + ': independent substrate', geometryChanged: false });
  for (const step of steps) {
    const mask = masks.find((item) => item.id === step.mask);
    assert.ok(mask, 'Missing component mask ' + step.mask);
    const regions = mask.rectangles.map(({ x, y, w, h }) => rectMulti(w, h, x + w / 2, y + h / 2));
    const result = applyOperation(model, {
      type: 'add',
      name: step.material,
      thickness: step.thickness,
      growth: 'direct',
      face: 'front',
      area: unionGeometries(regions),
    });
    assert.equal(result.changed, true, role + ': ' + step.material + ': ' + result.error);
    model.layers.find((layer) => layer.id === result.layerId).color = step.color;
    const maskContext = {
      sourceMode: 'file',
      cell: CELL,
      layerKeys: [step.mask + '|0'],
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      roi: null,
    };
    stepsSoFar.push({
      command: 'deposit',
      params: {
        material: step.material,
        thicknessUm: step.thickness,
        face: 'front',
        coverage: 'direct',
        area: 'mask',
        mask: maskContext,
      },
    });
    addNode({
      kind: 'add',
      label: step.label,
      name: step.material,
      face: 'front',
      thickness: step.thickness,
      growth: 'direct',
      geometryChanged: true,
      resultLayerId: result.layerId,
      areaMode: 'mask',
      replay: {
        version: 1,
        params: {
          type: 'add',
          name: step.material,
          thickness: step.thickness,
          growth: 'direct',
          face: 'front',
        },
        areaMode: 'mask',
        maskContext,
      },
    });
  }
  const final = nodes.at(-1);
  const bookmark = {
    id: role + '-final',
    name: label + ': independent final die',
    createdAt: stamp(nodes.length + 1),
    branchId: 'main',
    parentId: null,
    historyNodeId: final.id,
    state: clone(final.state),
  };
  return projectWithMain(nodes, [bookmark], final.state.processRecipe, label);
}

export async function buildUnassembledGanComponents() {
  await loadGeometryKernel();
  const { validateProjectFile, validateProcessModel } = await import('../site/project-schema.js');
  const { readProjectFile, prepareProjectForWorkspaceStorage } =
    await import('../site/project-io.js');
  const original = (await buildGanMicrochannel()).project;
  const hemtMasks = GAN_MICROCHANNEL_MASKS.filter((mask) => [16, 24, 18, 19].includes(mask.id));
  const pads = [-95, 0, 95].map((y) => ({ x: -80, y: y - 30, w: 160, h: 60 }));
  const gsgMask = [{ id: 20, rectangles: pads, polygons: [] }];
  const hemt = await dieProject({
    role: 'hemt',
    width: 878.5,
    height: 1120,
    thickness: 99,
    label: 'GaN HEMT die — unassembled',
    color: '#697d8d',
    masks: hemtMasks,
    steps: [
      {
        mask: 16,
        material: 'GaN buffer 1 um',
        thickness: 1,
        color: '#399cc5',
        label: 'GaN buffer',
      },
      {
        mask: 16,
        material: 'AlGaN barrier surrogate 0.025 um',
        thickness: 0.025,
        color: '#4bc6c8',
        label: 'Inferred AlGaN barrier',
      },
      {
        mask: 24,
        material: 'SiN isolation surrogate 0.15 um',
        thickness: 0.15,
        color: '#6ed0df',
        label: 'Inferred SiN isolation',
      },
      {
        mask: 18,
        material: 'Gate metal surrogate 0.2 um',
        thickness: 0.2,
        color: '#cb934e',
        label: 'Ten 0.5 x 300 um gates',
      },
      {
        mask: 19,
        material: 'S/D pads surrogate 0.2 um',
        thickness: 0.2,
        color: '#e9b23b',
        label: 'Inferred S/D pads, not 6 um lithography',
      },
    ],
  });
  const gsg = (role) =>
    dieProject({
      role,
      width: GAN_GSG_STACK.chipWidthUm,
      height: GAN_GSG_STACK.chipHeightUm,
      thickness: GAN_GSG_STACK.substrateThicknessUm,
      label: (role === 'gsg-left' ? 'Left' : 'Right') + ' GSG Pad die — unassembled',
      color: '#7d90a6',
      masks: gsgMask,
      steps: [
        {
          mask: 20,
          material: 'GSG inferred Au contacts 0.5 um',
          thickness: 0.5,
          color: '#d8a83a',
          label: 'Three inferred Au contact pads',
        },
      ],
    });
  const components = {
    interposer: interposerFromCheckpoint(original),
    hemt,
    'gsg-left': await gsg('gsg-left'),
    'gsg-right': await gsg('gsg-right'),
  };
  const names = {
    interposer: 'gan-microchannel-interposer-2022.wafercad',
    hemt: 'gan-hemt-die-2022.wafercad',
    'gsg-left': 'gan-gsg-left-die-2022.wafercad',
    'gsg-right': 'gan-gsg-right-die-2022.wafercad',
  };
  const files = {};
  for (const [role, project] of Object.entries(components)) {
    delete project.assemblyWires;
    validateProcessModel(project.model);
    validateProjectFile(project);
    assert.equal(project.snapshotBranches.branches.length, 1);
    assert.equal(project.snapshotBranches.branches[0].id, 'main');
    const text = JSON.stringify(prepareProjectForWorkspaceStorage(project));
    const reopened = await readProjectFile({
      size: Buffer.byteLength(text),
      text: async () => text,
    });
    validateProjectFile(reopened);
    assert.deepEqual(reopened.model, project.model);
    assert.ok(!('assemblyWires' in reopened));
    files[names[role]] = text;
  }
  const manifest = {
    paper: '10.1038/s41378-022-00462-3',
    status: 'components-only',
    assemblyPerformed: false,
    bondHistoryCreated: false,
    note: 'Three independent die Main histories and an independent Si interposer Main.',
    components: Object.entries(names).map(([role, filename]) => ({
      role,
      filename,
      independentMain: true,
      assembled: false,
    })),
  };
  return { components, files, manifest };
}

function finalPreview(source) {
  const preview = clone(source);
  const main = source.snapshotBranches.branches[0];
  const last = source.snapshotBranches.nodes.find((node) => node.id === main.headNodeId);
  assert.ok(last?.state);
  const state = clone(source);
  delete state.snapshots;
  delete state.snapshotBranches;
  delete state.name;
  preview.snapshots = [];
  preview.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: last.id,
    cursorSnapshotId: null,
    nodes: [{ ...clone(last), branchId: 'main', parentId: null, state }],
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentBranchId: null,
        rootNodeId: last.id,
        headNodeId: last.id,
        rootSnapshotId: null,
        headSnapshotId: null,
        createdAt: main.createdAt,
        headState: clone(state),
      },
    ],
  };
  return preview;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { components, files, manifest } = await buildUnassembledGanComponents();
  const { prepareProjectForWorkspaceStorage } = await import('../site/project-io.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const base = process.argv.includes('--write-repo')
    ? 'site/examples'
    : 'test-results/gan-unassembled';
  const dest = join(root, base);
  const previewDir = join(dest, 'previews');
  await mkdir(dest, { recursive: true });
  await mkdir(previewDir, { recursive: true });
  for (const [role, project] of Object.entries(components)) {
    const name = manifest.components.find((item) => item.role === role).filename;
    await writeFile(join(dest, name), files[name]);
    const preview = finalPreview(project);
    validateProjectFile(preview);
    await writeFile(
      join(previewDir, name),
      JSON.stringify(prepareProjectForWorkspaceStorage(preview, { geometryTemplates: false })),
    );
  }
  await writeFile(
    join(dest, 'gan-hemt-unassembled-components.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(JSON.stringify({ pass: true, projects: Object.keys(files) }));
}
