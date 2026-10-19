// #184: a Recovery Restore whose writer lease is stolen during the
// protective checkpoint must not mutate the live Model or History.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
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

    await deposit('Lease checkpoint A');
    await save('Lease older');
    const olderKey = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const point of await storage.listWorkspaceRecoveryPoints()) {
        if ((await storage.loadWorkspaceRecoveryPoint(point.key))?.name === 'Lease older') {
          return point.key;
        }
      }
      return null;
    });
    assert.ok(olderKey);
    await deposit('Lease active B');
    await save('Lease active');
    const before = await snapshot();
    const savedBefore = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.equal(before.workflow.dirty, false);
    assert.equal(before.workflow.writable, true);

    await page.evaluate(() => {
      const originalPut = window.IDBObjectStore.prototype.put;
      window.__recoveryLeaseLoss = { stolen: 0, preRestoreRecords: 0 };
      window.IDBObjectStore.prototype.put = function (value, ...rest) {
        const result = Reflect.apply(originalPut, this, [value, ...rest]);
        if (this.name === 'workspace' && value?.key?.startsWith('recovery:')) {
          window.__recoveryLeaseLoss.preRestoreRecords++;
          if (!window.__recoveryLeaseLoss.stolen) {
            window.__recoveryLeaseLoss.stolen++;
            localStorage.setItem(
              'wafercad.workspace.owner.v1',
              JSON.stringify({
                tabId: 'simulated-competing-writer',
                expiresAt: Date.now() + 60000,
              }),
            );
          }
        }
        return result;
      };
    });

    await page.locator('[data-action="domain:project"]').click();
    await page.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      olderKey,
    );
    await page.locator('#workspaceRecoverySelect').selectOption(olderKey);
    await page.locator('#workspaceRestoreBtn').click();
    await page
      .locator('.v2-confirm-dialog')
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

    const trace = await page.evaluate(() => window.__recoveryLeaseLoss);
    assert.equal(trace.stolen, 1, 'Lease must be stolen at checkpoint commit');
    assert.ok(trace.preRestoreRecords >= 1, 'Protective Recovery write must occur');
    const status = await page.locator('[data-slot="status.message"]').innerText();
    assert.match(status, /lost.*owner|another tab|no longer owns/i);
    const after = await snapshot();
    assert.equal(after.workflow.writable, false, 'Lost writer must stay read-only');
    assert.equal(after.workflow.dirty, false, 'Lost writer cannot create an unsaved mutation');
    assert.deepEqual(after.model, before.model, 'Lease loss cannot alter physical Model');
    assert.deepEqual(after.workflow.steps, before.workflow.steps, 'History remains exact');
    assert.deepEqual(after.workflow.branches, before.workflow.branches, 'Variants remain exact');
    const persisted = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(persisted.model, savedBefore.model, 'Current IndexedDB Model is unchanged');
    assert.deepEqual(
      persisted.snapshotBranches.nodes,
      savedBefore.snapshotBranches.nodes,
      'Current IndexedDB History graph is unchanged',
    );
    assert.deepEqual(errors, []);
    console.log('V2_RECOVERY_LEASE_LOSS: no mutation after lost writer lease PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
