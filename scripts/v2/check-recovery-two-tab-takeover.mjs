// #184: two real v2 tabs race a Recovery Restore against explicit takeover.
// Pause the protective storage Worker, transfer the lease through the second
// tab's visible UI, then resume and demand fail-closed behavior.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  try {
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

    await deposit('Takeover original A');
    await save('Takeover old checkpoint');
    const oldKey = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const point of await storage.listWorkspaceRecoveryPoints()) {
        if ((await storage.loadWorkspaceRecoveryPoint(point.key))?.name === 'Takeover old checkpoint')
          return point.key;
      }
      return null;
    });
    assert.ok(oldKey, 'Old Recovery point is available');
    await deposit('Takeover current B');
    await save('Takeover active workspace');
    const baseline = await snapshot();
    assert.equal(baseline.workflow.dirty, false);
    const storedBefore = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(storedBefore.model, baseline.model);

    const competitor = await context.newPage();
    competitor.on('pageerror', (error) => errors.push(error.message));
    await competitor.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await competitor.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    assert.equal(
      (await competitor.evaluate(() => window.WaferCadV2Workstation.snapshot())).workflow.writable,
      false,
    );
    await competitor.locator('[data-action="domain:project"]').click();

    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      window.__recoveryTakeover = { paused: false, resumed: false, intercepted: 0 };
      window.Worker = class extends NativeWorker {
        constructor(url, ...rest) {
          super(url, ...rest);
          this.isStorage = String(url).includes('workspace-storage-worker');
        }
        postMessage(...args) {
          if (this.isStorage && !window.__recoveryTakeover.paused) {
            window.__recoveryTakeover.paused = true;
            window.__recoveryTakeover.intercepted++;
            window.__resumeRecoveryPack = () => {
              window.__recoveryTakeover.resumed = true;
              NativeWorker.prototype.postMessage.apply(this, args);
            };
            return;
          }
          return NativeWorker.prototype.postMessage.apply(this, args);
        }
      };
    });

    await page.locator('[data-action="domain:project"]').click();
    await page.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      oldKey,
    );
    await page.locator('#workspaceRecoverySelect').selectOption(oldKey);
    await page.locator('#workspaceRestoreBtn').click();
    await page
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.waitForFunction(() => window.__recoveryTakeover?.paused, null, {
      timeout: 120000,
    });

    await competitor.locator('#workspaceTakeOverBtn').click();
    await competitor
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Take over', exact: true })
      .click();
    await competitor.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().workflow.writable,
      null,
      { timeout: 30000 },
    );
    await page.evaluate(() => window.__resumeRecoveryPack());
    await page.waitForFunction(
      () =>
        /Recovery restore failed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );

    const trace = await page.evaluate(() => window.__recoveryTakeover);
    assert.deepEqual(trace, { paused: true, resumed: true, intercepted: 1 });
    const oldTab = await snapshot();
    assert.equal(oldTab.workflow.writable, false, 'Displaced owner loses write authority');
    assert.equal(oldTab.workflow.dirty, false, 'Displaced owner must not create dirty state');
    assert.deepEqual(oldTab.model, baseline.model, 'Physical Model is unchanged');
    assert.deepEqual(oldTab.workflow.steps, baseline.workflow.steps, 'History Steps are unchanged');
    assert.deepEqual(
      oldTab.workflow.branches,
      baseline.workflow.branches,
      'Variant HEADs are unchanged',
    );
    const newTab = await competitor.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(newTab.workflow.writable, true, 'Second tab explicitly owns the writer lease');
    assert.deepEqual(newTab.model, baseline.model, 'New owner has exact baseline Model');
    const storedAfter = await competitor.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(storedAfter.model, storedBefore.model);
    assert.deepEqual(storedAfter.snapshotBranches.nodes, storedBefore.snapshotBranches.nodes);
    assert.deepEqual(errors, []);
    await competitor.close();
    console.log('V2_RECOVERY_TWO_TAB_TAKEOVER: actual UI takeover during checkpoint PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
