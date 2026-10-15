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
          return !state.workflow.busy && state.model.layers.some((layer) => layer.name === expected);
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

    const fault = await page.evaluate(() => window.__restoreWriteFault);
    assert.ok(fault.originals >= 1, 'Pre-restore Recovery checkpoint must commit before restore');
    assert.ok(fault.writes >= 1, 'The injected failure must hit the final workspace commit');
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
    console.log('V2_RECOVERY_FAIL_CLOSED: failed IndexedDB commit preserves Model/History/Variant PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
