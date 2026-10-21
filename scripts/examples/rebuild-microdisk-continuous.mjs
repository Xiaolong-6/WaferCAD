// Rebuild the published Continuous Microdisk from its immutable M07 predecessor.
// Run explicitly: node scripts/examples/rebuild-microdisk-continuous.mjs --write
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { expandProjectStorage, serializeProject, readProjectFile } from '../../site/project-io.js';
import { createSelectionGeometry } from '../../site/selection-geometry.js';
import { maskLocalToWorld } from '../../site/mask-roi-geometry.js';
import {
  attachContinuousEtchModel,
  validateContinuousEtchModel,
  continuousModelMaterialAt,
} from '../../site/continuous-etch-model.js';

// The production polygon boolean kernel is vendored, deterministic and offline.
const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  await readFile(new URL('../../site/vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = resolve(root, 'site/examples/suspended-silica-microdisks.wafercad');
const output = resolve(root, 'site/examples/suspended-silica-microdisks-continuous.wafercad');
const baseline = expandProjectStorage(JSON.parse(await readFile(baselinePath, 'utf8')));
const project = structuredClone(baseline);
const snapshot = (suffix) => project.snapshots.find((s) => s.id === `snapshot-microdisk-${suffix}`);
const node = (suffix) =>
  project.snapshotBranches.nodes.find((s) => s.id === `process-microdisk-${suffix}`);
for (const suffix of ['07', '08', '09'])
  assert.ok(snapshot(suffix) && node(suffix), `missing M${suffix}`);
const m07 = structuredClone(snapshot('07').state.model);
const originalM07 = JSON.stringify(m07);
const oldStep = project.processRecipe.steps.find((s) => s.id === 'recipe-process-microdisk-08');
assert.equal(oldStep?.params.area, 'invert');
assert.equal(oldStep?.params.face, 'front');
assert.equal(oldStep?.params.target, 'Silicon substrate');
assert.equal(oldStep?.params.thicknessUm, 36);
assert.equal(oldStep?.params.profile, 'isotropic');
const selected = (element) =>
  project.selectedLayerKeys.includes(`${element.layer}|${element.datatype}`);
const selection = createSelectionGeometry({
  getState: () => ({ ...project, model: m07 }),
  selectedElement: selected,
  maskPoint: (point) => maskLocalToWorld(point, project.maskTransform),
});
const clip = selection.operationAreaGeometry('invert');
assert.equal(clip.length, 5, 'Use the five true exposed footprints from original Invert Mask');
const continuous = attachContinuousEtchModel(m07, {
  face: 'front',
  targetLayerIds: ['base'],
  shape: 'circular',
  lateralUm: 36,
  verticalUm: 36,
  clip,
});
validateContinuousEtchModel(continuous);
assert.equal(JSON.stringify(m07), originalM07, 'Never mutate the accepted M07 predecessor');
assert.equal(continuous.continuousEtchOwner.fronts.length, 1);
assert.equal(
  continuousModelMaterialAt(continuous, [0, 0, 39]),
  'base',
  'central Si support must remain',
);
assert.equal(
  continuousModelMaterialAt(continuous, [110, 0, 30]),
  null,
  'oxide disk must be undercut',
);
assert.equal(continuousModelMaterialAt(continuous, [145, 0, 40.5]), 'layer-1', 'SiO2 must remain');
const title = 'M08 · XeF₂ Continuous circular Si release · 36 µm assumed';
const note =
  'Exact analytic circular front with 36 µm lateral reach and vertical depth; released through the original inverted MICRODISK_RELEASE_MASK (GDS 1/0). The 36 µm reach/depth is a WaferCAD reconstruction assumption, not a measured value reported by Basiri-Esfahani et al. (2019). No discrete Z bands are saved.';
const updateRecipe = (recipe) => {
  const step = recipe.steps.find((s) => s.id === 'recipe-process-microdisk-08');
  if (!step) throw new Error('Missing recipe M08');
  step.params = {
    ...step.params,
    profile: 'continuous',
    continuousShape: 'circular',
    continuousLateralUm: 36,
  };
  delete step.params.isotropicLateralErrorUm;
};
updateRecipe(project.processRecipe);
const m08 = snapshot('08');
m08.name = title;
m08.state.model = structuredClone(continuous);
updateRecipe(m08.state.processRecipe);
const n08 = node('08');
n08.operation = {
  ...n08.operation,
  label: title,
  profile: 'continuous',
  shape: 'circular',
  lateralUm: 36,
  verticalUm: 36,
  note,
};
n08.state.model = structuredClone(continuous);
updateRecipe(n08.state.processRecipe);
const m09 = snapshot('09');
m09.state.model = structuredClone(continuous);
updateRecipe(m09.state.processRecipe);
const n09 = node('09');
n09.state.model = structuredClone(continuous);
updateRecipe(n09.state.processRecipe);
const mainBranch = project.snapshotBranches.branches.find((b) => b.id === 'main');
assert.ok(mainBranch && mainBranch.headNodeId === n09.id);
mainBranch.headState.model = structuredClone(continuous);
updateRecipe(mainBranch.headState.processRecipe);
project.model = structuredClone(continuous);
project.name = 'Suspended silica microdisk · exact continuous XeF₂ release (36 µm assumed)';
project.display.threeCamera = { position: [0, -330, 95], target: [0, 0, 21], fov: 34 };
project.display.sectionDetailRoi = null;
project.display.sectionCollapse = null;
assert.deepEqual(
  snapshot('07').state.model,
  baseline.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model,
);
const serialized = serializeProject(project);
const opened = await readProjectFile(new Blob([serialized]));
assert.equal(opened.model.kernel, 'vector-continuous-etch-v1');
assert.deepEqual(
  opened.model,
  opened.snapshots.find((s) => s.id === 'snapshot-microdisk-08').state.model,
);
assert.deepEqual(
  opened.model,
  opened.snapshots.find((s) => s.id === 'snapshot-microdisk-09').state.model,
);
assert.deepEqual(
  opened.model,
  opened.snapshotBranches.branches.find((b) => b.id === 'main').headState.model,
);
assert.deepEqual(opened.processRecipe.steps.slice(0, 6), baseline.processRecipe.steps.slice(0, 6));
assert.equal(opened.processRecipe.steps[6].params.area, 'invert');
assert.equal(opened.processRecipe.steps[6].params.profile, 'continuous');
assert.equal(opened.snapshots.length, 9);
assert.equal(opened.snapshotBranches.nodes.length, 9);
const report = {
  project: output,
  bytes: Buffer.byteLength(serialized),
  kernel: opened.model.kernel,
  snapCount: opened.snapshots.length,
  historyCount: opened.snapshotBranches.nodes.length,
  releaseMaskFootprints: clip.length,
  modelRevision: opened.model.revision,
  sequence: opened.processRecipe.steps.map((s) => s.id),
  productionRoundTrip: true,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--write')) await writeFile(output, serialized + '\n');
