// Deterministic separate opt-in Microdisk Variant; original published M08/M09 remain intact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadGeometryKernel } from '../../../scripts/process-benchmarks.mjs';
const input = new URL('../../examples/suspended-silica-microdisks.wafercad', import.meta.url);
const output = new URL('./suspended-silica-microdisks-adaptive.wafercad', import.meta.url);
const branchId = 'microdisk-adaptive-72-band';
const nodeId = 'process-microdisk-adaptive-08';
const snapId = 'snapshot-microdisk-adaptive-08';
const at = '2026-10-18T00:00:00Z';
const params = {
  type: 'etch',
  etchProfile: 'isotropic',
  etchTargetLayerIds: ['base'],
  thickness: 36,
  face: 'front',
  isotropicLateralErrorUm: 0.25,
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function generateAdaptiveMicrodiskVariant({ target = output } = {}) {
  await loadGeometryKernel();
  const [{ applyOperation, geometryArea }, { readProjectFile, prepareProjectForWorkspaceStorage }] =
    await Promise.all([import('../../model.js'), import('../../project-io.js')]);
  const bytes = await readFile(input);
  const project = await readProjectFile(new Blob([bytes], { type: 'application/json' }));
  const oldMain = JSON.stringify(project.snapshotBranches.branches[0]);
  const m07 = project.snapshots.find((s) => s.id === 'snapshot-microdisk-07');
  assert.ok(m07 && m07.historyNodeId === 'process-microdisk-07');
  const model = structuredClone(m07.state.model);
  const vol = (id) =>
    model.regions.reduce(
      (v, r) =>
        v +
        geometryArea(r.geom) *
          r.stack.reduce((s, x) => s + (x.layerId === id ? x.z1 - x.z0 : 0), 0),
      0,
    );
  const oxideBefore = vol('layer-1'),
    siliconBefore = vol('base');
  const result = applyOperation(model, { ...params, area: model.boundary });
  assert.equal(result.changed, true, result.error);
  const oxideAfter = vol('layer-1'),
    siliconAfter = vol('base');
  assert.ok(siliconAfter > 0 && siliconAfter < siliconBefore);
  assert.ok(Math.abs(oxideAfter - oxideBefore) <= oxideBefore * 1e-6);
  const state = structuredClone(m07.state);
  state.model = model;
  state.section = { a: [-175, 0], b: [175, 0] };
  state.display.sectionDetailRoi = null;
  // Keep the saved Recipe and History path strictly equivalent. In particular
  // the adaptive release must not disappear when the active Variant is restored.
  const adaptiveEtchStep = {
    id: 'recipe-process-microdisk-adaptive-08',
    command: 'etch',
    params: {
      area: 'full',
      face: 'front',
      target: 'Silicon substrate',
      thicknessUm: 36,
      profile: 'isotropic',
      surface: 'smooth',
      isotropicLateralErrorUm: 0.25,
    },
  };
  state.processRecipe.steps.push(adaptiveEtchStep);
  state.processRecipe.activeStepId = adaptiveEtchStep.id;
  // Keep legacy main Recipe/History untouched; this is its own Process branch.
  const step = {
    id: nodeId,
    branchId,
    parentId: 'process-microdisk-07',
    createdAt: at,
    processRevision: model.processRevision,
    operation: {
      kind: 'etch',
      label: 'M08 adaptive · 72-band experimental XeF2 Si release',
      face: 'front',
      areaMode: 'full',
      thickness: 36,
      targetLayerId: 'base',
      etchTargetLayerIds: ['base'],
      profile: 'isotropic-release',
      note: '36 um release radius is assumed; no identical-device SEM calibration.',
      replay: { version: 1, params: structuredClone(params), areaMode: 'full' },
    },
    state: structuredClone(state),
  };
  const snap = {
    id: snapId,
    name: 'M08 experimental · adaptive 72-band release',
    branchId,
    parentId: 'snapshot-microdisk-07',
    historyNodeId: nodeId,
    createdAt: at,
    state: structuredClone(state),
  };
  const branch = {
    id: branchId,
    name: 'Experimental adaptive 72-band release (36 um assumed)',
    parentBranchId: 'main',
    rootSnapshotId: 'snapshot-microdisk-07',
    headSnapshotId: snapId,
    rootNodeId: 'process-microdisk-07',
    headNodeId: nodeId,
    headState: structuredClone(state),
    createdAt: at,
  };
  project.name = 'Suspended silica Microdisk — adaptive release (experimental)';
  project.snapshots.push(snap);
  project.snapshotBranches.nodes.push(step);
  project.snapshotBranches.branches.push(branch);
  project.snapshotBranches.activeBranchId = branchId;
  project.snapshotBranches.cursorNodeId = nodeId;
  project.snapshotBranches.cursorSnapshotId = snapId;
  project.model = model;
  project.processRecipe = structuredClone(state.processRecipe);
  project.section = structuredClone(state.section);
  project.display.sectionDetailRoi = null;
  assert.equal(
    JSON.stringify(project.snapshotBranches.branches[0]),
    oldMain,
    'Legacy main mutated',
  );
  const packed = prepareProjectForWorkspaceStorage(project);
  const data = JSON.stringify(packed) + '\n';
  await writeFile(target, data);
  return {
    sourceSha256: digest(bytes),
    outputSha256: digest(data),
    outputBytes: Buffer.byteLength(data),
    legacyMainUnchanged: true,
    regions: model.regions.length,
    processRevision: model.processRevision,
    siliconBefore,
    siliconAfter,
    oxideBefore,
    oxideAfter,
    branchId,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await generateAdaptiveMicrodiskVariant(), null, 2));
