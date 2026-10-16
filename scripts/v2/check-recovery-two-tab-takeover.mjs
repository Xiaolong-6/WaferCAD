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
    async function deposit(name, tab = page) {
      await tab.locator('[data-action="domain:process"]').click();
      await tab.locator('#operationType').selectOption('add');
      await tab.locator('#operationArea').selectOption('full');
      await tab.locator('#growthMode').selectOption('direct');
      await tab.locator('#operationThickness').fill('0.05');
      await tab.locator('#layerName').fill(name);
      await tab.locator('#applyOperationBtn').click();
      await tab.waitForFunction(
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
    async function save(name, tab = page) {
      await tab.locator('[data-action="domain:project"]').click();
      await tab.locator('#projectNameInput').fill(name);
      await tab.locator('#saveProjectBtn').click();
      await tab.waitForFunction(
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
        if (
          (await storage.loadWorkspaceRecoveryPoint(point.key))?.name === 'Takeover old checkpoint'
        )
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
    // #289: after the first takeover, the new owner and the detached tab
    // independently change the *physical* process graph, not only project labels.
    await deposit('Owner process C', competitor);
    await save('Owner divergent current C', competitor);
    const ownerSaved = await competitor.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(ownerSaved.workflow.steps.length, baseline.workflow.steps.length + 1);
    const ownerStored = await competitor.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(ownerStored.model, ownerSaved.model);

    await deposit('Read-only process D', page);
    const detached = await snapshot();
    assert.equal(detached.workflow.writable, false, 'Detached tab cannot own local autosave');
    assert.equal(detached.workflow.dirty, true, 'Detached process edit must remain unsaved');
    assert.equal(detached.workflow.steps.length, baseline.workflow.steps.length + 1);
    assert.ok(detached.model.layers.some((layer) => layer.name === 'Read-only process D'));
    assert.ok(!detached.model.layers.some((layer) => layer.name === 'Owner process C'));

    // Choice 1: retain the detached tab's state. Its displaced saved counterpart
    // must survive in Recovery before the new owner overwrites current.
    await page.locator('#workspaceTakeOverBtn').click();
    await page
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Use this tab', exact: true })
      .click();
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return state.workflow.writable && !state.workflow.dirty && !state.workflow.busy;
      },
      null,
      { timeout: 120000 },
    );
    const acceptedDetached = await snapshot();
    assert.deepEqual(acceptedDetached.model, detached.model, 'Use this tab retains detached geometry');
    assert.deepEqual(
      acceptedDetached.workflow.steps,
      detached.workflow.steps,
      'Use this tab retains detached History',
    );
    assert.deepEqual(
      acceptedDetached.workflow.branches,
      detached.workflow.branches,
      'Use this tab retains the detached Variant tree',
    );
    const acceptedStored = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(acceptedStored.model, detached.model);
    const displacedRemote = await page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const record of await storage.listWorkspaceRecoveryPoints()) {
        if (record.reason !== 'pre-takeover-remote') continue;
        const project = await storage.loadWorkspaceRecoveryPoint(record.key);
        if (project?.name === 'Owner divergent current C') return project;
      }
      return null;
    });
    assert.ok(displacedRemote, 'Displaced owner saved state needs a valid Recovery checkpoint');
    assert.deepEqual(displacedRemote.model, ownerSaved.model);
    assert.deepEqual(displacedRemote.snapshotBranches, ownerStored.snapshotBranches);
    await competitor.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.writable,
      null,
      { timeout: 30000 },
    );

    // Choice 2: this former owner still has its own process graph. Modify it
    // again while read-only, then explicitly load the latest saved state.
    await deposit('Read-only process E', competitor);
    const discardCandidate = await competitor.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(discardCandidate.workflow.dirty, true);
    assert.equal(discardCandidate.workflow.steps.length, baseline.workflow.steps.length + 2);
    assert.ok(discardCandidate.model.layers.some((layer) => layer.name === 'Owner process C'));
    assert.ok(discardCandidate.model.layers.some((layer) => layer.name === 'Read-only process E'));
    await competitor.locator('#workspaceTakeOverBtn').click();
    await competitor
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Load latest saved', exact: true })
      .click();
    await competitor.waitForFunction(
      (expectedName) => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          state.workflow.writable &&
          !state.workflow.busy &&
          !state.workflow.dirty &&
          state.model.layers.some((layer) => layer.name === expectedName)
        );
      },
      'Read-only process D',
      { timeout: 120000 },
    );
    const acceptedSaved = await competitor.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.deepEqual(acceptedSaved.model, detached.model, 'Load latest saved replaces geometry');
    assert.deepEqual(acceptedSaved.workflow.steps, detached.workflow.steps);
    assert.deepEqual(acceptedSaved.workflow.branches, detached.workflow.branches);
    const displacedCurrent = await competitor.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      for (const record of await storage.listWorkspaceRecoveryPoints()) {
        if (record.reason !== 'pre-takeover-current') continue;
        const project = await storage.loadWorkspaceRecoveryPoint(record.key);
        if (project?.model?.layers?.some((layer) => layer.name === 'Read-only process E')) {
          return project;
        }
      }
      return null;
    });
    assert.ok(displacedCurrent, 'Discarded dirty tab needs an independent Recovery checkpoint');
    assert.deepEqual(displacedCurrent.model, discardCandidate.model);
    const finalStored = await competitor.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(finalStored.model, detached.model, 'Reconciled current DB keeps intended state');
    assert.deepEqual(
      finalStored.snapshotBranches,
      acceptedStored.snapshotBranches,
      'Reconciliation preserves exact persisted Variant topology',
    );
    assert.deepEqual(errors, []);
    await competitor.close();
    console.log(
      'V2_RECOVERY_TWO_TAB_TAKEOVER: cancelled restore and both divergent-state choices PASS',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
