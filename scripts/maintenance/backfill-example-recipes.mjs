// Derive editable Recipes from the saved, actual Process History of legacy examples.
// This is a migration step, not proof of Kernel replay equivalence.
// Run acceptance checks before promoting any migrated project.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeProcessRecipe } from '../../site/process-recipe.js';
import { validateRecipeExecution } from '../../site/process-recipe-preflight.js';
import { loadGeometryKernel } from '../process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../../site/project-io.js');

const files = [
  'perc-solar-cells-point-contacts.wafercad',
  'fully-textured-perovskite-silicon-tandem.wafercad',
  'suspended-silica-microdisks.wafercad',
  'three-tier-silicon-jlfets.wafercad',
  'three-tier-silicon-jlfets-full-wafer.wafercad',
];
const write = process.argv.includes('--write');
const only = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);
const clone = (x) => structuredClone(x);

function modelFor(project, state) {
  if (state?.model) return state.model;
  if (state?.modelRef === 'project') return project.model;
  const result = project.sharedModels?.[state?.modelRef];
  assert.ok(result, `unresolved modelRef ${state?.modelRef}`);
  return result;
}

function baseFor(project, state, filename) {
  const model = modelFor(project, state);
  const material = model.layers?.find((entry) => entry.id === 'base');
  assert.ok(material, 'missing substrate Base');
  const result = {
    shape: model.shape,
    width: model.width,
    height: model.height,
    thickness: model.thickness,
    material: material.name,
    color: material.color,
  };
  if (filename.includes('-full-wafer')) {
    // The Fig3 full wafer is a compact 625-device canonical translation array.
    // A scalar Base reset would destroy its canonical array ownership.
    result.array = { rows: 25, columns: 25, pitchX: 1600, pitchY: 1600, diameter: 76200 };
  }
  return result;
}

function maskFor(node, project) {
  const replay = node.operation?.replay;
  if (replay?.maskContext) return clone(replay.maskContext);
  if (node.operation?.maskContext) return clone(node.operation.maskContext);
  const state = node.state || {};
  const sourceMode = state.maskSourceMode || 'file';
  return {
    sourceMode,
    cell: state.activeCell || project.layout?.root || null,
    layerKeys: [...(state.selectedLayerKeys || [])],
    transform: clone(state.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 }),
    roi: clone(state.maskRoi || null),
    ...(sourceMode === 'draw' ? { drawMask: clone(state.drawMask || { shapes: [] }) } : {}),
  };
}

function surfaceFor(project, node, targetId) {
  const requested = node.operation?.surface || node.operation?.replay?.params?.surface;
  if (!requested || requested === 'smooth') return 'smooth';
  const model = modelFor(project, node.state);
  const face = node.operation?.face || 'front';
  const surfaceKey = face === 'back' ? 'backSurface' : 'frontSurface';
  for (const region of model.regions || []) {
    for (const segment of region.stack || []) {
      const actual = segment[surfaceKey];
      if (actual?.kind === 'rough' &&
          (!targetId || segment.layerId === targetId) &&
          actual.morphology === requested.morphology) {
        return {
          ...clone(requested),
          featureCv: actual.featureCv,
          heightCv: actual.heightCv,
          seed: actual.seed,
        };
      }
    }
  }
  return requested;
}

function stepFor(project, node, terminalModel, precedingModel) {
  const op = node.operation || {};
  if (op.kind === 'base') return null;
  const replay = op.replay?.version === 1 ? op.replay : null;
  const raw = replay?.params || op;
  const areaValue = replay?.areaMode || op.areaMode || 'full';
  const area = areaValue === 'mask-inverted' ? 'invert' : areaValue;
  const face = raw.face || op.face || 'front';
  const shared = { area, face, ...(area === 'full' ? {} : { mask: maskFor(node, project) }) };
  const model = modelFor(project, node.state);
  const layerName = (id) =>
    terminalModel.layers?.find((layer) => layer.id === id)?.name ||
    model.layers?.find((layer) => layer.id === id)?.name ||
    '';
  const name = raw.name || op.name || op.label;
  const thickness = Number(raw.thickness ?? op.thickness);
  let command;
  let params;

  if (op.kind === 'record') {
    command = 'record';
    params = {
      process: op.processType || raw.processType || 'custom',
      label: op.label || name,
      temperatureC: op.temperatureC ?? raw.temperature ?? null,
      durationMin: op.durationMin ?? raw.duration ?? null,
      ambient: op.ambient || raw.ambient || null,
      note: op.note || raw.note || null,
    };
  } else if (op.kind === 'add') {
    command = 'deposit';
    params = {
      ...shared,
      material: (() => {
        const introduced = model.layers.filter((layer) =>
          !precedingModel?.layers?.some((prior) => prior.id === layer.id));
        return introduced.length === 1 ? layerName(introduced[0].id) : name;
      })(),
      thicknessUm: thickness,
      coverage: raw.growth || op.growth || 'direct',
      placement: raw.transferMode || op.transferMode || 'follow',
    };
  } else if (op.kind === 'grow') {
    command = 'extend';
    params = {
      ...shared,
      material: layerName(raw.targetLayerId || op.targetLayerId) || name,
      thicknessUm: thickness,
      coverage: raw.growth || op.growth || 'direct',
    };
  } else if (op.kind === 'etch') {
    command = 'etch';
    const targetId = raw.etchTargetLayerIds?.[0] || op.etchTargetLayerIds?.[0] ||
      raw.targetLayerId || op.targetLayerId;
    const profileName = raw.etchProfile || op.etchProfile || op.profile || 'directional';
    const profile = profileName === 'isotropic-release' ? 'isotropic' : profileName;
    params = {
      ...shared,
      target: targetId ? layerName(targetId) : '',
      thicknessUm: profile === 'planarize' ? Number(raw.targetZ ?? thickness) : thickness,
      profile,
      surface: surfaceFor(project, node, targetId),
    };
  } else if (op.kind === 'implant') {
    command = 'implant';
    params = {
      ...shared,
      name,
      depthUm: thickness,
      tilt: Number(raw.tilt ?? op.implantTilt ?? 0),
    };
  } else if (op.kind === 'electrical') {
    command = 'electrical';
    params = {
      ...shared,
      name,
      depthUm: thickness,
      regionType: raw.electricalRegionType || op.electricalRegionType,
      source: raw.electricalRegionSource || op.electricalRegionSource,
    };
  } else {
    throw new Error(`Cannot reconstruct ${op.kind} from ${node.id}`);
  }
  return { id: `recipe-${node.id}`, command, params };
}

function ancestry(id, nodesById) {
  const visited = new Set();
  const result = [];
  while (id) {
    assert.ok(!visited.has(id), `cyclic process ancestry ${id}`);
    visited.add(id);
    const node = nodesById.get(id);
    assert.ok(node, `dangling parent Process node ${id}`);
    result.push(node);
    id = node.parentId || null;
  }
  return result.reverse();
}

async function main(filename) {
  const target = new URL(`../../site/examples/${filename}`, import.meta.url);
  const source = await readFile(target, 'utf8');
  const project = JSON.parse(source);
  const graph = project.snapshotBranches;
  assert.ok(graph?.nodes?.length, filename + ': expected complete Process History');
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const recipesByNodeId = new Map();

  function recipeAt(id, state) {
    if (!recipesByNodeId.has(id)) {
      const chain = ancestry(id, nodes);
      const recipe = normalizeProcessRecipe({
        name: `${project.name || filename} · Process reconstruction`,
        base: baseFor(project, state || chain[0].state, filename),
        steps: chain.map((node, index) =>
          stepFor(
            project,
            node,
            modelFor(project, state || chain.at(-1).state),
            index ? modelFor(project, chain[index - 1].state) : null,
          )).filter(Boolean),
      });
      recipesByNodeId.set(id, recipe);
    }
    return clone(recipesByNodeId.get(id));
  }

  for (const node of graph.nodes) {
    node.state.processRecipe = recipeAt(node.id, node.state);
  }
  for (const branch of graph.branches) {
    if (!branch.headNodeId) continue;
    branch.headState.processRecipe = recipeAt(branch.headNodeId, branch.headState);
  }
  for (const snapshot of project.snapshots || []) {
    const id = snapshot.historyNodeId;
    if (id && nodes.has(id)) snapshot.state.processRecipe = recipeAt(id, snapshot.state);
  }
  const head = graph.branches.find((b) => b.id === graph.activeBranchId);
  assert.ok(head?.headNodeId, filename + ': no active HEAD');
  project.processRecipe = recipeAt(head.headNodeId, { model: project.model });
  const preflight = validateRecipeExecution(project.processRecipe.steps, {
    model: project.model,
    maskState: { layout: project.layout },
    base: project.processRecipe.base,
    startMode: 'new-base',
  });
  assert.deepEqual(preflight.errors, [], filename + ': recipe preflight failed');

  const serialized = JSON.stringify(project);
  const opened = await readProjectFile({
    size: Buffer.byteLength(serialized),
    text: async () => serialized,
  });
  assert.equal(opened.processRecipe.steps.length, project.processRecipe.steps.length);
  if (write) await writeFile(target, serialized);
  else assert.equal(serialized, source, filename + ': generated Recipe is not committed');
  console.log(JSON.stringify({
    filename,
    steps: project.processRecipe.steps.length,
    branches: graph.branches.length,
    mask: project.maskSourceMode === 'draw' ? project.drawMask?.shapes?.length : project.layout?.elements?.length,
    write,
  }));
}

for (const filename of files.filter((f) => !only || f.includes(only))) {
  await main(filename);
}
