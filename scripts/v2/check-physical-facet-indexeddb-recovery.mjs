// Real Chromium + IndexedDB Recovery abort, using the production controller.
// This is an isolated lab origin and never accesses an end-user workspace.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiContext } from '../test-helpers/ui.mjs';

const output = resolve('test-results/physical-facet-recovery');
await mkdir(output, { recursive: true });
const port = '4193';
const server = spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
  cwd: resolve('.'),
  env: { ...process.env, WAFERCAD_V2_PORT: port },
  stdio: 'ignore',
});
const url = `http://127.0.0.1:${port}/experimental/physical-facets/physical-facet-preview.html`;
const report = { status: 'running', browserErrors: [] };
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      // The local static server is starting.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(ready, 'Browser test requires an isolated localhost server');
  browser = await launchBrowser();
  report.chromiumVersion = browser.version();
  const context = await newUiContext(browser, { viewport: { width: 1000, height: 700 } });
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => report.browserErrors.push(error.message));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.body.dataset.physicalFacetReady === 'true');
    report.contract = await page.evaluate(async () => {
      const [
        { loadExperimentalPhysicalFacetPreview },
        { createWorkspacePersistenceController },
        { createSnapshotManager },
        { makePhysicalPyramidOwner },
        { physicalPyramidSection },
        {
          saveWorkspaceState,
          loadWorkspaceState,
          createWorkspaceRecoveryCheckpoint,
          listWorkspaceRecoveryPoints,
        },
      ] = await Promise.all([
        import('/ui-v2/workstation-runtime.js'),
        import('/controllers/workspace-persistence-controller.js'),
        import('/workspace-snapshots.js'),
        import('/experimental/physical-facets/physical-facet-owner.js'),
        import('/experimental/physical-facets/physical-facet-surface.js'),
        import('/workspace-persistence.js'),
      ]);

      // The browser context has fresh storage; use the production project
      // file reader to construct the same faceted Model as the Workstation.
      const project = (await loadExperimentalPhysicalFacetPreview()).data;
      let live = structuredClone(project);
      const history = createSnapshotManager({
        capture: () => live,
        restore: (state) => {
          live = structuredClone(state);
        },
      });
      history.create('pre-recovery physical state');
      const capture = () => ({
        ...structuredClone(live),
        snapshots: history.exportRecords(),
        snapshotBranches: history.exportBranchState(),
      });
      const original = capture();
      const sourceSignature = JSON.stringify(original.model);
      const cut = (state) =>
        physicalPyramidSection(
          state.model.experimentalPhysicalFacetOwner,
          state.section.a,
          state.section.b,
        );
      const originalCut = cut(original);
      if (!(await saveWorkspaceState(original))) {
        throw new Error('Failed to establish the trusted IndexedDB original state');
      }
      const recovered = structuredClone(project);
      recovered.model.experimentalPhysicalFacetOwner = makePhysicalPyramidOwner({
        layerId: 'base',
        pitch: 6.4,
        height: 4.5,
        bottomPlaneZ: -125.5,
        topPlaneZ: 125.5,
        originX: 1.6,
        domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
      });
      recovered.model.revision += 1;
      if (JSON.stringify(cut(recovered)) === JSON.stringify(originalCut)) {
        throw new Error('Different physical recovery phase must have distinct Section profile');
      }
      const targetKey = await createWorkspaceRecoveryCheckpoint(recovered, {
        reason: 'physical-browser-target',
      });

      let writerLease = true;
      let injectAbort = false;
      let abortCount = 0;
      let loadedStates = 0;
      const statuses = [];
      const controls = {
        workspaceRecoverySelect: { value: targetKey },
        workspaceSaveStatus: { dataset: {}, textContent: '' },
      };
      const root = {
        getElementById: (id) => controls[id] || null,
        querySelector: () => null,
      };
      const nativePut = globalThis.IDBObjectStore.prototype.put;
      globalThis.IDBObjectStore.prototype.put = function (value, ...args) {
        if (injectAbort && this.name === 'workspace' && value?.key === 'current') {
          injectAbort = false;
          abortCount++;
          throw new globalThis.DOMException(
            'physical Recovery IndexedDB abort',
            'QuotaExceededError',
          );
        }
        return nativePut.call(this, value, ...args);
      };
      try {
        const controller = createWorkspacePersistenceController({
          root,
          workspaceSession: {
            hasWriteLease: () => writerLease,
            tabId: 'physical-browser-tab',
          },
          snapshotManager: history,
          buildProjectSnapshot: capture,
          loadProjectSnapshot: (projectState) => {
            loadedStates++;
            live = structuredClone(projectState);
            delete live.snapshots;
            delete live.snapshotBranches;
            if (projectState.model.experimentalPhysicalFacetOwner.originX === 1.6) {
              injectAbort = true;
            }
          },
          cacheValidatedProjectSnapshots: () => {},
          syncBaseControls: () => {},
          syncTransformInputs: () => {},
          renderAll: () => {},
          renderSnapshots: () => {},
          fit3d: () => {},
          getProjectName: () => 'Physical Recovery Test',
          setProjectName: () => {},
          normalizedProjectName: () => 'Physical Recovery Test',
          syncProjectNameInput: () => {},
          status: (message, kind) => statuses.push({ message, kind }),
          confirmAction: async () => true,
          channelFactory: () => null,
        });
        await controller.initializePersistedWorkspace();
        // The production restore requires a lease and a selected Recovery ID.
        controls.workspaceRecoverySelect.value = targetKey;
        await controller.restoreSelectedRecovery();
        const persisted = await loadWorkspaceState();
        const points = await listWorkspaceRecoveryPoints();
        const restoredBranches = history.exportBranchState();
        return {
          abortCount,
          loadedStates,
          originalModelRestored: JSON.stringify(live.model) === sourceSignature,
          storageModelPreserved: JSON.stringify(persisted.model) === sourceSignature,
          memorySectionUnchanged: JSON.stringify(cut(live)) === JSON.stringify(originalCut),
          storedSectionUnchanged: JSON.stringify(cut(persisted)) === JSON.stringify(originalCut),
          historyRecordCount: history.exportRecords().length,
          originalHistoryCount: original.snapshots.length,
          branchBefore: original.snapshotBranches,
          branchAfter: restoredBranches,
          preRestoreCheckpointPreserved: points.some((point) => point.reason === 'pre-restore'),
          outcome: statuses.at(-1)?.message || '',
        };
      } finally {
        writerLease = false;
        globalThis.IDBObjectStore.prototype.put = nativePut;
      }
    });
    const result = report.contract;
    assert.equal(result.abortCount, 1, 'Real IndexedDB write must be interrupted');
    assert.equal(result.loadedStates, 3, 'Startup, attempted restore, and rollback');
    assert.equal(result.originalModelRestored, true);
    assert.equal(result.storageModelPreserved, true);
    assert.equal(result.memorySectionUnchanged, true);
    assert.equal(result.storedSectionUnchanged, true);
    assert.equal(result.historyRecordCount, result.originalHistoryCount);
    assert.deepEqual(
      result.branchAfter,
      result.branchBefore,
      'Recovered History must preserve all branch graph data and values',
    );
    assert.equal(result.preRestoreCheckpointPreserved, true);
    assert.match(result.outcome, /Recovery restore failed/i);
    assert.deepEqual(report.browserErrors, []);
    report.status = 'pass';
    await page.close();
  } finally {
    await context.close();
  }
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server.kill();
}
