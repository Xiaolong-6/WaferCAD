// #184: Recovery Restore must fail closed if its final IndexedDB commit fails.
// The existing project and all scientific History/Variant state must survive.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    async function deposit(name) {
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(name);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (expected) => {
          const state = window.WaferCadV2Workstation.snapshot();
          return (
            !state.workflow.busy && state.model.layers.some((layer) => layer.name === expected)
          );
        },
        name,
        { timeout: 120000 },
      );
    }
    async function save(name) {
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#projectNameInput').fill(name);
      await page.locator('#saveProjectBtn').click();
      await page.waitForFunction(
        (expected) =>
          (document.querySelector('[data-slot="status.message"]')?.textContent || '').includes(
            'Saved "' + expected + '" locally',
          ),
        name,
        { timeout: 120000 },
      );
    }

    await deposit('Fault original A');
    await save('Recovery older');
    const oldPoint = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const point of await storage.listWorkspaceRecoveryPoints()) {
        if ((await storage.loadWorkspaceRecoveryPoint(point.key))?.name === 'Recovery older')
          return point.key;
      }
      return null;
    });
    assert.ok(oldPoint, 'A checkpoint must exist before attempting restoration');

    await deposit('Fault active B');
    await save('Recovery currently active');
    const before = await snapshot();
    assert.equal(before.workflow.steps.length, 2);
    const persistedBefore = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(persistedBefore.model, before.model);

    await page.evaluate(() => {
      const nativePut = window.IDBObjectStore.prototype.put;
      window.__recoveryOriginalPut = nativePut;
      window.__restoreWriteFault = { writes: 0, originals: 0 };
      window.IDBObjectStore.prototype.put = function (record, ...argumentsAfter) {
        if (this.name === 'workspace' && record?.key === 'current') {
          window.__restoreWriteFault.writes++;
          throw new window.DOMException('Synthetic Recovery write failure', 'QuotaExceededError');
        }
        if (this.name === 'workspace' && String(record?.key).startsWith('recovery:'))
          window.__restoreWriteFault.originals++;
        return Reflect.apply(nativePut, this, [record, ...argumentsAfter]);
      };
    });

    await page.locator('[data-action="domain:project"]').click();
    await page.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      oldPoint,
    );
    await page.locator('#workspaceRecoverySelect').selectOption(oldPoint);
    await page.locator('#workspaceRestoreBtn').click();
    await page
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        /Recovery restore failed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );

    const diagnostic = await page.evaluate(() => ({
      fault: window.__restoreWriteFault,
      status: document.querySelector('[data-slot="status.message"]')?.textContent || '',
      saveStatus: document.querySelector('#workspaceSaveStatus')?.textContent || '',
      retryReason: document.querySelector('.workspace')?.dataset.autosaveRetryReason || null,
    }));
    const { fault } = diagnostic;
    assert.ok(fault.originals >= 1, 'Pre-restore Recovery checkpoint must commit before restore');
    assert.ok(
      fault.writes >= 1,
      'The injected failure must hit the final workspace commit: ' + JSON.stringify(diagnostic),
    );
    const after = await snapshot();
    assert.deepEqual(after.model, before.model, 'Failed save must restore previous physical Model');
    assert.deepEqual(
      after.workflow.steps,
      before.workflow.steps,
      'Failed save must restore previous History Steps',
    );
    assert.deepEqual(
      after.workflow.branches,
      before.workflow.branches,
      'Failed save must preserve Variant heads and topology',
    );

    const stored = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(stored.model, before.model, 'IndexedDB current workspace is unchanged');
    assert.deepEqual(
      stored.snapshotBranches.nodes,
      persistedBefore.snapshotBranches.nodes,
      'IndexedDB History graph is unchanged',
    );
    assert.deepEqual(errors, []);
    console.log(
      'V2_RECOVERY_FAIL_CLOSED: failed IndexedDB commit preserves Model/History/Variant PASS',
    );

    // #320: independently inject a SECOND fault in compensating in-memory
    // recovery after the final durable write has failed. This must never
    // claim a successful rollback or silently autosave a partial restoration.
    await page.evaluate(() => {
      const originalPut = window.__recoveryOriginalPut;
      const originalClone = window.structuredClone;
      const trace = {
        checkpointWrites: 0,
        failedCurrentWrites: 0,
        rollbackCloneFailures: 0,
        armed: false,
      };
      window.__recoveryDoubleFault = trace;
      window.__recoveryOriginalClone = originalClone;
      window.IDBObjectStore.prototype.put = function (record, ...argumentsAfter) {
        if (this.name === 'workspace' && record?.key === 'current') {
          trace.failedCurrentWrites++;
          trace.armed = true;
          throw new window.DOMException('Synthetic final restore commit failure', 'QuotaExceededError');
        }
        if (this.name === 'workspace' && String(record?.key).startsWith('recovery:'))
          trace.checkpointWrites++;
        return Reflect.apply(originalPut, this, [record, ...argumentsAfter]);
      };
      window.structuredClone = function (value, ...args) {
        if (trace.armed && trace.rollbackCloneFailures === 0) {
          trace.rollbackCloneFailures++;
          trace.armed = false;
          throw new Error('Synthetic compensating in-memory rollback failure');
        }
        return Reflect.apply(originalClone, this, [value, ...args]);
      };
    });
    try {
      await page.locator('#workspaceRecoverySelect').selectOption(oldPoint);
      await page.locator('#workspaceRestoreBtn').click();
      await page
        .locator('.v2-workflow-dialog-actions')
        .getByRole('button', { name: 'Restore', exact: true })
        .click();
      await page.waitForFunction(
        () => {
          const message = document.querySelector('[data-slot="status.message"]')?.textContent || '';
          return (
            /in-memory rollback also failed/i.test(message) &&
            !window.WaferCadV2Workstation.snapshot().workflow.busy
          );
        },
        null,
        { timeout: 120000 },
      );
      const doubleFault = await page.evaluate(() => ({
        trace: window.__recoveryDoubleFault,
        message: document.querySelector('[data-slot="status.message"]')?.textContent || '',
      }));
      assert.ok(doubleFault.trace.checkpointWrites >= 1, 'Original Recovery point was protected');
      assert.ok(
        doubleFault.trace.failedCurrentWrites >= 1,
        'Actual IndexedDB current write must fail after protection',
      );
      assert.equal(
        doubleFault.trace.rollbackCloneFailures,
        1,
        'A separate compensating in-memory rollback must actually fail',
      );
      assert.match(doubleFault.message, /pre-restore checkpoint is available/i);
      assert.doesNotMatch(doubleFault.message, /Restored local recovery checkpoint/i);
    } finally {
      await page.evaluate(() => {
        window.IDBObjectStore.prototype.put = window.__recoveryOriginalPut;
        window.structuredClone = window.__recoveryOriginalClone;
      });
    }

    // Any half-restored volatile state is not authoritative. After restoring
    // browser APIs, the old durable record must remain untouched even beyond
    // the regular 1.8s autosave window, and a protected original must remain.
    await page.waitForTimeout(3500);
    const durability = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      const current = await storage.loadWorkspaceState();
      const points = await storage.listWorkspaceRecoveryPoints();
      const protectedModels = [];
      for (const point of points) {
        if (point.reason !== 'pre-restore') continue;
        const entry = await storage.loadWorkspaceRecoveryPoint(point.key);
        if (entry) protectedModels.push(entry.model);
      }
      return { current, protectedModels };
    });
    assert.deepEqual(
      durability.current,
      persistedBefore,
      'No deferred autosave may overwrite durable current after double fault',
    );
    assert.ok(
      durability.protectedModels.some(
        (model) => JSON.stringify(model) === JSON.stringify(before.model),
      ),
      'A valid pre-restore checkpoint must contain the original exact Model',
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const reopened = await snapshot();
    assert.deepEqual(reopened.model, before.model, 'Reload must use original durable physical Model');
    assert.deepEqual(reopened.workflow.steps, before.workflow.steps);
    assert.deepEqual(reopened.workflow.branches, before.workflow.branches);
    assert.deepEqual(errors, []);
    console.log('V2_RECOVERY_DOUBLE_FAULT: original durable Model and Recovery intact PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
