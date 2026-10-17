import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspacePersistenceController } from '../controllers/workspace-persistence-controller.js';
import { createSnapshotManager } from '../workspace-snapshots.js';
import { attachExperimentalPhysicalFacetOwner } from '../physical-facet-model.js';
import { makePhysicalPyramidOwner } from '../physical-facet-owner.js';
import { physicalPyramidSection } from '../physical-facet-surface.js';
import { validateProjectFile, CURRENT_PROJECT_VERSION } from '../project-schema.js';
import { expandProjectStorage, serializeProject } from '../project-io.js';

const { createModel } = await import('../model.js');

const descriptor = {
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
};

function physicalProject() {
  return {
    format: 'WaferCAD-vector',
    version: CURRENT_PROJECT_VERSION,
    name: 'Physical Recovery Test',
    model: attachExperimentalPhysicalFacetOwner(
      createModel({ shape: 'rect', width: 12.8, height: 12.8, thickness: 251 }),
      descriptor,
    ),
    layout: {
      name: 'no-mask.gds',
      root: 'TOP',
      elements: [],
      linework: [],
      bounds: {
        minX: -6.4,
        maxX: 6.4,
        minY: -6.4,
        maxY: 6.4,
        width: 12.8,
        height: 12.8,
      },
      combos: [],
      hierarchy: { TOP: [] },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [],
    activeCell: 'TOP',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    section: { a: [-6.4, 0.5], b: [6.4, 0.5] },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: { xyUnit: 'um', structurePalette: 'balanced' },
  };
}

async function recoveryFixture({ rollbackFailure = false } = {}) {
  let current = physicalProject();
  const events = [];
  let owner = false;
  let loads = 0;
  let writes = 0;
  const controls = {
    workspaceRecoverySelect: { value: 'injected-physical-recovery' },
    workspaceRestoreBtn: { disabled: false },
    workspaceRecoveryClearBtn: { disabled: false },
    saveProjectBtn: { disabled: false },
    workspaceSaveStatus: { dataset: {}, textContent: '' },
  };
  const root = {
    getElementById: (id) =>
      id === 'workspaceRestoreBtn' && !owner ? null : controls[id] || null,
    querySelector: () => null,
  };
  const manager = createSnapshotManager({
    capture: () => current,
    restore: (value) => {
      current = structuredClone(value);
    },
    idFactory: (() => {
      let id = 0;
      return () => `facet-snapshot-${++id}`;
    })(),
    now: () => new Date('2026-10-17T00:00:00Z'),
  });
  manager.create('original physical phase');
  const snapshot = () => {
    const copy = structuredClone(current);
    copy.snapshots = manager.exportRecords();
    copy.snapshotBranches = manager.exportBranchState();
    validateProjectFile(copy);
    return copy;
  };
  const original = snapshot();
  const recovered = structuredClone(original);
  recovered.model.experimentalPhysicalFacetOwner = makePhysicalPyramidOwner({
    ...descriptor,
    originX: 1.6,
  });
  recovered.model.revision += 1;
  delete recovered.snapshots;
  delete recovered.snapshotBranches;
  validateProjectFile(recovered);
  const profile = (state) =>
    physicalPyramidSection(
      state.model.experimentalPhysicalFacetOwner,
      state.section.a,
      state.section.b,
    );
  assert.notDeepEqual(profile(original), profile(recovered));
  const saved = JSON.stringify(original);
  const statuses = [];
  const controller = createWorkspacePersistenceController({
    root,
    workspaceSession: { hasWriteLease: () => owner, tabId: 'test-physical-owner' },
    snapshotManager: manager,
    buildProjectSnapshot: snapshot,
    loadProjectSnapshot: (project) => {
      loads += 1;
      events.push('load-model');
      if (rollbackFailure && loads === 2) {
        throw new Error('injected volatile rollback failure');
      }
      current = structuredClone(project);
      delete current.snapshots;
      delete current.snapshotBranches;
    },
    cacheValidatedProjectSnapshots: () => {},
    syncBaseControls: () => events.push('sync-controls'),
    syncTransformInputs: () => {},
    renderAll: () => events.push('render'),
    renderSnapshots: () => events.push('history-render'),
    fit3d: () => {},
    getProjectName: () => 'Physical Recovery Test',
    setProjectName: () => {},
    normalizedProjectName: (name) => name || 'Physical Recovery Test',
    syncProjectNameInput: () => {},
    status: (message, kind) => statuses.push({ message, kind }),
    confirmAction: async () => true,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    windowRef: { crypto: { randomUUID: () => 'physical-recovery-test-id' } },
    channelFactory: () => null,
    recoveryIO: {
      createCheckpoint: async (project, metadata) => {
        events.push('pre-restore-checkpoint');
        assert.equal(metadata.reason, 'pre-restore');
        assert.equal(JSON.stringify(project), saved);
        return { id: 'pre-restore' };
      },
      loadPoint: async (id) => {
        assert.equal(id, 'injected-physical-recovery');
        events.push('load-recovery-point');
        return structuredClone(recovered);
      },
      saveState: async (project, _metadata, guard) => {
        writes++;
        events.push('attempt-storage-commit');
        assert.equal(guard.canCommit(), true);
        assert.deepEqual(profile(project), profile(recovered));
        throw new DOMException('injected IndexedDB quota abort', 'QuotaExceededError');
      },
    },
  });
  await controller.initializePersistedWorkspace();
  owner = true;
  return {
    controller,
    manager,
    events,
    statuses,
    controls,
    original,
    recovered,
    profile,
    get current() {
      return current;
    },
    get loads() {
      return loads;
    },
    get writes() {
      return writes;
    },
  };
}

test('physical Recovery commit abort restores Model, Snapshot and History graph atomically', async () => {
  const harness = await recoveryFixture();
  const originalCut = harness.profile(harness.original);
  await harness.controller.restoreSelectedRecovery();

  assert.equal(harness.loads, 2, 'replacement then original rollback');
  assert.equal(harness.writes, 1, 'aborted commit is not retried without a fresh validation');
  assert.deepEqual(harness.profile(harness.current), originalCut);
  assert.equal(JSON.stringify(harness.current.model), JSON.stringify(harness.original.model));
  assert.deepEqual(harness.manager.exportRecords(), harness.original.snapshots);
  assert.deepEqual(harness.manager.exportBranchState(), harness.original.snapshotBranches);
  assert.deepEqual(
    harness.events.filter((value) =>
      ['pre-restore-checkpoint', 'load-recovery-point', 'attempt-storage-commit', 'load-model'].includes(
        value,
      ),
    ),
    [
      'pre-restore-checkpoint',
      'load-recovery-point',
      'load-model',
      'attempt-storage-commit',
      'load-model',
    ],
  );
  assert.match(harness.statuses.at(-1)?.message || '', /Recovery restore failed/i);
  assert.equal(harness.controls.saveProjectBtn.disabled, false);
  const reopened = expandProjectStorage(JSON.parse(serializeProject(harness.original)));
  assert.deepEqual(harness.profile(reopened), originalCut);
});

test('physical Recovery failed volatile rollback locks Save and further restores', async () => {
  const harness = await recoveryFixture({ rollbackFailure: true });
  await harness.controller.restoreSelectedRecovery();
  assert.equal(harness.loads, 2);
  assert.equal(harness.writes, 1);
  assert.equal(harness.controls.workspaceRestoreBtn.disabled, true);
  assert.equal(harness.controls.workspaceRecoveryClearBtn.disabled, true);
  assert.equal(harness.controls.saveProjectBtn.disabled, true);
  assert.match(harness.statuses.at(-1)?.message || '', /rollback also failed/i);
  assert.equal(await harness.controller.persistNow({ force: true }), false);
  assert.equal(await harness.controller.checkpointCurrent('unsafe-attempt'), false);
  await harness.controller.restoreSelectedRecovery();
  assert.equal(harness.writes, 1, 'unsafe workspace must never overwrite the trusted storage');
  assert.match(harness.statuses.at(-1)?.message || '', /Reload this tab/i);
});
