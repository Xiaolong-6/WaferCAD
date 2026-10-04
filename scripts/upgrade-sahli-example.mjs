#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [inputPath, outputPathArg] = process.argv.slice(2);
if (!inputPath) {
  console.error('Usage: node scripts/upgrade-sahli-example.mjs <input.wafercad> [output.wafercad]');
  process.exit(1);
}

const outputPath =
  outputPathArg ||
  path.join(
    path.dirname(inputPath),
    path.basename(inputPath).replace(/\.wafercad$/i, '') + '-bookmark-v2.wafercad',
  );

const project = JSON.parse(await readFile(inputPath, 'utf8')),
  branches = project.snapshotBranches,
  nodes = branches?.nodes || [],
  snapshots = project.snapshots || [],
  removeLabels = new Set(['VIEW_Ag_finger_cross_section', 'VIEW_Ag_finger_micro_section']),
  removeIds = new Set(
    nodes
      .filter((node) => removeLabels.has(node.operation?.label))
      .map((node) => node.id),
  ),
  finalNode = nodes.find((node) => node.operation?.label === '20_final_tandem'),
  mgfNode = nodes.find((node) => node.operation?.label?.startsWith('Deposit MgF2 AR')),
  finalSnapshot = snapshots.find((snapshot) => snapshot.name === '20_final_tandem');

if (!branches || removeIds.size !== 2 || !finalNode || !mgfNode || !finalSnapshot) {
  throw new Error('Input does not match the expected Sahli 2018 reconstruction lineage.');
}

finalNode.parentId = mgfNode.id;
finalNode.processRevision = 23;
finalNode.operation.note =
  'Completed ncSi record-device reconstruction. Ag-finger cross-section and micro-section are inspection bookmarks attached to this final Step, not fabrication Steps. SHJ thickness placeholders and surrogate grid remain explicit. Pyramid morphology uses deterministic reconstruction CV/seed parameters.';

branches.nodes = nodes.filter((node) => !removeIds.has(node.id));

function updatePyramidModel(model) {
  for (const region of model?.regions || []) {
    for (const segment of region.stack || []) {
      for (const key of ['frontSurface', 'backSurface']) {
        const appearance = segment[key];
        if (appearance?.kind !== 'rough' || appearance.morphology !== 'pyramid') continue;
        const front = key === 'frontSurface';
        appearance.featureCv = 0.3;
        appearance.heightCv = 0;
        appearance.seed = front ? 2018 : 2019;
        appearance.profileId = `pyramid-${front ? 'front' : 'back'}-${appearance.seed}`;
        appearance.geometryMode = 'ideal';
      }
    }
  }
}

updatePyramidModel(project.model);
for (const model of project.sharedModels || []) updatePyramidModel(model);

project.model.processRevision = 23;
for (const index of [0, 1]) {
  const model = project.sharedModels?.[index];
  if (!model) continue;
  model.processRevision = 23;
  model.revision = project.model.revision;
}

const cameraFor = {
  '20_final_tandem': {
    position: [70, -76, 56],
    target: [0, 0, 0],
    fov: 34,
  },
  'VIEW_Ag_finger_cross_section': {
    position: [72, 1928, 58],
    target: [0, 2000, 0],
    fov: 34,
  },
  'VIEW_Ag_finger_micro_section': {
    position: [38, 1967, 28],
    target: [0, 2003.2, 0],
    fov: 34,
  },
};

for (const snapshot of snapshots) {
  if (snapshot.name === 'VIEW_Ag_finger_cross_section') {
    snapshot.name = 'Ag finger cross-section';
    snapshot.historyNodeId = finalNode.id;
    snapshot.state.display = {
      ...snapshot.state.display,
      threeCamera: cameraFor.VIEW_Ag_finger_cross_section,
    };
  } else if (snapshot.name === 'VIEW_Ag_finger_micro_section') {
    snapshot.name = 'Ag finger micro-section';
    snapshot.historyNodeId = finalNode.id;
    snapshot.state.display = {
      ...snapshot.state.display,
      threeCamera: cameraFor.VIEW_Ag_finger_micro_section,
    };
  } else if (snapshot.name === '20_final_tandem') {
    snapshot.state.display = {
      ...snapshot.state.display,
      threeCamera: cameraFor['20_final_tandem'],
    };
  }
}

const mainBranch = branches.branches.find((branch) => branch.id === 'main');
mainBranch.headNodeId = finalNode.id;
mainBranch.headSnapshotId = finalSnapshot.id;
mainBranch.headState = structuredClone(finalSnapshot.state);
mainBranch.headState.display = {
  ...mainBranch.headState.display,
  threeCamera: cameraFor['20_final_tandem'],
};
branches.activeBranchId = 'main';
branches.cursorNodeId = finalNode.id;
branches.cursorSnapshotId = finalSnapshot.id;

for (const key of [
  'selectedLayerKeys',
  'activeCell',
  'maskTransform',
  'maskSourceMode',
  'drawMask',
  'maskRoi',
  'maskRoiAnchor',
  'activeFace',
  'roi',
  'roiAnchor',
  'section',
  'planViews',
  'display',
]) {
  if (key in finalSnapshot.state) project[key] = structuredClone(finalSnapshot.state[key]);
}
project.display = {
  ...project.display,
  threeCamera: cameraFor['20_final_tandem'],
};
project.name = 'Fully textured perovskite / silicon tandem — Sahli et al. 2018';

const nodeIds = new Set(branches.nodes.map((node) => node.id));
if (branches.nodes.some((node) => removeLabels.has(node.operation?.label))) {
  throw new Error('VIEW_* process nodes survived migration.');
}
if (snapshots.some((snapshot) => !nodeIds.has(snapshot.historyNodeId))) {
  throw new Error('A migrated bookmark references a missing history node.');
}

await writeFile(outputPath, JSON.stringify(project), 'utf8');
console.log(outputPath);
