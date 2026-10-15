// #184 real-v2 Recovery Restore: canonical physical/history rollback,
// pre-restore checkpoint safety, saved reload and competing-writer isolation.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
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
    const recoveryPoints = () =>
      page.evaluate(async () => {
        const storage = await import('/workspace-persistence.js');
        const points = [];
        for (const point of await storage.listWorkspaceRecoveryPoints()) {
          points.push({ ...point, project: await storage.loadWorkspaceRecoveryPoint(point.key) });
        }
        return points;
      });

    await deposit('Recovery original A');
    await deposit('Recovery original B');
    await save('Recovery original');
    const baseline = await snapshot();
    assert.equal(baseline.workflow.steps.length, 2);
    assert.equal(baseline.workflow.branches.length, 1);
    const originalPoint = (await recoveryPoints()).find(
      (point) => point.project?.name === 'Recovery original',
    );
    assert.ok(originalPoint, 'Save must create a real named Recovery checkpoint');
    assert.deepEqual(originalPoint.project.model, baseline.model);

    await deposit('Recovery transient C');
    await save('Recovery transient');
    const transient = await snapshot();
    assert.equal(transient.workflow.steps.length, 3);
    assert.ok(transient.model.layers.some((layer) => layer.name === 'Recovery transient C'));

    const stale = await context.newPage();
    stale.on('pageerror', (error) => errors.push(error.message));
    await stale.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await stale.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    await stale.locator('[data-action="domain:project"]').click();
    assert.equal(
      (await stale.evaluate(() => window.WaferCadV2Workstation.snapshot())).workflow.writable,
      false,
      'Second tab must not acquire the original writer lease',
    );
    await stale.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      originalPoint.key,
    );
    await stale.locator('#workspaceRecoverySelect').selectOption(originalPoint.key);
    assert.equal(
      await stale.locator('#workspaceRestoreBtn').isDisabled(),
      true,
      'A non-owner tab cannot restore and overwrite the active writer',
    );

    await page.locator('[data-action="domain:project"]').click();
    await page.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      originalPoint.key,
    );
    await page.locator('#workspaceRecoverySelect').selectOption(originalPoint.key);
    assert.equal(await page.locator('#workspaceRestoreBtn').isEnabled(), true);
    await page.locator('#workspaceRestoreBtn').click();
    await page
      .locator('.v2-workflow-dialog-actions')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        /Restored local recovery checkpoint/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );

    const restored = await snapshot();
    assert.deepEqual(restored.model, baseline.model, 'Restore recovers exact physical geometry');
    assert.deepEqual(restored.workflow.steps, baseline.workflow.steps, 'Restore recovers all Steps');
    assert.deepEqual(
      restored.workflow.branches,
      baseline.workflow.branches,
      'Restore recovers exact Variant topology',
    );
    assert.equal(restored.projectName, baseline.projectName);
    const pointsAfter = await recoveryPoints();
    assert.ok(
      pointsAfter.some(
        (point) =>
          point.reason === 'pre-restore' &&
          point.project?.model.layers.some((layer) => layer.name === 'Recovery transient C'),
      ),
      'Recovery restore checkpoints the overwritten workspace before replacing it',
    );

    const persisted = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.deepEqual(persisted.model, baseline.model, 'Restored state is committed to IndexedDB');
    assert.deepEqual(
      persisted.snapshotBranches.nodes,
      originalPoint.project.snapshotBranches.nodes,
      'Restored persisted History graph is exact',
    );
    // Each Variant keeps exact geometry, History references and scientific
    // state. The browser may recompute an initially null 3D camera while
    // restoring the view; exclude only this presentation-only camera field.
    const withoutAutoFitCamera = (branches) =>
      branches.map((branch) => {
        const saved = structuredClone(branch);
        if (saved.headState?.display) saved.headState.display.threeCamera = null;
        return saved;
      });
    assert.deepEqual(
      withoutAutoFitCamera(persisted.snapshotBranches.branches),
      withoutAutoFitCamera(originalPoint.project.snapshotBranches.branches),
      'Restored persisted Variant graph and physical headState are exact except 3D auto-fit',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const reloaded = await snapshot();
    assert.deepEqual(reloaded.model, baseline.model);
    assert.deepEqual(reloaded.workflow.steps, baseline.workflow.steps);
    assert.deepEqual(reloaded.workflow.branches, baseline.workflow.branches);
    assert.deepEqual(errors, [], 'Recovery restore must not cause browser page errors');
    await stale.close();
    console.log('V2_RECOVERY_RESTORE_PARITY: exact Model/History/Variants, pre-restore, lease, reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
