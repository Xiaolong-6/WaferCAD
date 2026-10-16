import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel } = await import('../model.js');
const { createRectangularGridArrayModel } = await import('../model-array-construction.js');
const { arrayParts } = await import('../model-array.js');
const { readProjectFile, serializeProject } = await import('../project-io.js');
const { migrateProjectFile, validateProjectFile } = await import('../project-schema.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { createSnapshotManager } = await import('../workspace-snapshots.js');

function siteStack(site, point = [0, 0]) {
  const owners = site.model.regions.filter((region) => pointInMulti(point, region.geom));
  assert.equal(owners.length, 1, 'Physical site must have exactly one material owner');
  return owners[0].stack.map(({ layerId, z0, z1, role }) => [layerId, z0, z1, role || null]);
}

function physicalChanges(before, after) {
  const oldSites = arrayParts(before);
  const newSites = arrayParts(after);
  assert.equal(oldSites.length, 6400);
  assert.equal(newSites.length, 6400);
  const changed = [];
  for (let i = 0; i < newSites.length; i++) {
    const old = oldSites[i];
    const next = newSites[i];
    assert.deepEqual(
      [next.id, next.role, next.x, next.y],
      [old.id, old.role, old.x, old.y],
      'Process may not change the canonical site identity or placement',
    );
    if (JSON.stringify(next.model.regions) !== JSON.stringify(old.model.regions))
      changed.push(next.id);
  }
  return changed;
}

test('6400-site sparse process, History/Variant and project IO remain physically isolated', async () => {
  const base = createModel({ shape: 'rect', width: 0.375, height: 0.375, thickness: 2 });
  const initialModel = createRectangularGridArrayModel(base, {
    kind: 'rect-grid',
    rows: 80,
    columns: 80,
    pitchX: 0.375,
    pitchY: 0.375,
    activeSites: 4725,
  });
  assert.equal(arrayParts(initialModel).filter((site) => site.role === 'device').length, 4725);
  assert.equal(arrayParts(initialModel).filter((site) => site.role === 'background').length, 1675);
  const initial = structuredClone(initialModel);
  let live = migrateProjectFile(
    projectForBenchmark({
      model: initialModel,
      section: { a: [-15, 0], b: [15, 0] },
    }),
  );
  let nextNodeId = 0;
  const validation = (candidate) => {
    try {
      validateProjectFile(candidate);
      return true;
    } catch {
      return false;
    }
  };
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (state) => {
      live = state;
    },
    validateState: validation,
    now: () => new Date('2026-10-16T10:00:00.000Z'),
    nodeIdFactory: () => 'process-6400-' + ++nextNodeId,
    branchIdFactory: () => 'variant-6400',
  });

  // The selected device is site-3240 (world XY = +0.1875, +0.1875 µm).
  // Both footprints lie wholly within one 0.375 µm cell, without edge touching.
  const deposit = {
    type: 'add',
    name: 'Metalens 10 nm film',
    thickness: 0.01,
    face: 'front',
    growth: 'direct',
    area: rectMulti(0.2, 0.2, 0.1875, 0.1875),
  };
  const applied = applyOperation(live.model, deposit);
  assert.equal(applied.changed, true, applied.error);
  const afterDeposit = structuredClone(live.model);
  assert.deepEqual(physicalChanges(initial, afterDeposit), ['site-3240']);
  const first = manager.recordOperation({ kind: 'add', label: deposit.name });
  const depositedSite = arrayParts(afterDeposit).find((site) => site.id === 'site-3240');
  assert.deepEqual(siteStack(depositedSite), [
    ['base', -1, 1, null],
    [applied.layerId, 1, 1.01, null],
  ]);

  const etch = {
    type: 'etch',
    thickness: 0.01,
    face: 'front',
    etchProfile: 'directional',
    etchTargetLayerIds: [applied.layerId],
    area: rectMulti(0.1, 0.1, 0.1875, 0.1875),
  };
  const etched = applyOperation(live.model, etch);
  assert.equal(etched.changed, true, etched.error);
  const mainHead = structuredClone(live.model);
  assert.deepEqual(physicalChanges(afterDeposit, mainHead), ['site-3240']);
  const second = manager.recordOperation({ kind: 'etch', label: 'Selective center Etch' });
  assert.equal(second.parentId, first.id);
  const etchedSite = arrayParts(mainHead).find((site) => site.id === 'site-3240');
  assert.deepEqual(siteStack(etchedSite), [['base', -1, 1, null]]);
  assert.deepEqual(
    siteStack(etchedSite, [-0.075, -0.075]),
    [['base', -1, 1, null], [applied.layerId, 1, 1.01, null]],
    'Film must survive outside the inner Etch footprint',
  );

  // Independently replay the actual Kernel steps from the pristine 6400-site Base.
  const replayed = structuredClone(initial);
  const replayAdd = applyOperation(replayed, deposit);
  assert.equal(replayAdd.changed, true, replayAdd.error);
  const replayEtch = applyOperation(replayed, {
    ...etch,
    etchTargetLayerIds: [replayAdd.layerId],
  });
  assert.equal(replayEtch.changed, true, replayEtch.error);
  assert.deepEqual(replayed, mainHead, 'Replaying the same steps produces an identical model');

  assert.equal(manager.restoreProcessNode(first.id), true);
  assert.deepEqual(live.model, afterDeposit, 'History restores the exact earlier physical state');
  assert.equal(manager.restoreActiveBranchHead(), true);
  assert.deepEqual(live.model, mainHead, 'Return to Main HEAD restores Etch exactly');

  // Fork at the first process node and apply a different local operation.
  const variant = manager.createBranchFromNode(first.id, 'Sparse alternative');
  assert.equal(variant.parentBranchId, 'main');
  assert.deepEqual(live.model, afterDeposit);
  const alternate = {
    type: 'add',
    name: 'Alternative patch',
    thickness: 0.01,
    face: 'front',
    area: rectMulti(0.1, 0.1, -0.1875, -0.1875),
    growth: 'direct',
  };
  const alternateResult = applyOperation(live.model, alternate);
  assert.equal(alternateResult.changed, true, alternateResult.error);
  const variantHead = structuredClone(live.model);
  assert.deepEqual(physicalChanges(afterDeposit, variantHead), ['site-3159']);
  const third = manager.recordOperation({ kind: 'add', label: alternate.name });
  assert.equal(third.parentId, first.id);
  assert.equal(third.branchId, variant.id);

  assert.equal(manager.switchBranch('main'), true);
  assert.deepEqual(live.model, mainHead, 'Variant must not mutate Main physical geometry');
  assert.equal(manager.switchBranch(variant.id), true);
  assert.deepEqual(live.model, variantHead, 'Returning to Variant restores its physical model');

  const project = {
    ...live,
    snapshots: manager.exportRecords(),
    snapshotBranches: manager.exportBranchState(),
  };
  validateProjectFile(project);
  const serialized = serializeProject(project);
  const reopened = await readProjectFile({
    size: Buffer.byteLength(serialized),
    text: async () => serialized,
  });
  assert.deepEqual(reopened, project, 'All 6400-site models and History survive project IO');
  assert.equal(reopened.snapshotBranches.nodes.length, 3);
  assert.equal(reopened.snapshotBranches.branches.length, 2);

  let restored = reopened;
  const recoveredManager = createSnapshotManager({
    capture: () => restored,
    restore: (state) => {
      restored = state;
    },
    validateState: validation,
  });
  recoveredManager.importRecords(reopened.snapshots, reopened.snapshotBranches);
  assert.equal(recoveredManager.switchBranch('main'), true);
  assert.deepEqual(restored.model, mainHead);
  assert.equal(recoveredManager.restoreProcessNode(first.id), true);
  assert.deepEqual(restored.model, afterDeposit);
  assert.equal(recoveredManager.switchBranch(variant.id), true);
  assert.deepEqual(restored.model, variantHead);
});
