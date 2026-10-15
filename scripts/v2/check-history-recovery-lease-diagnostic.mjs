// Production v2 transaction boundary: undo/redo, autosave and competing tab lease.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty');
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snap();
    assert.equal(initial.workflow.steps.length, 0);
    assert.equal(initial.workflow.writable, true);

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#layerName').fill('Recovery transaction film');
    await page.locator('#operationThickness').fill('0.25');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().workflow.steps.length === 1 &&
        !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const committed = await snap();
    assert.equal(committed.model.layers.length, initial.model.layers.length + 1);
    assert.equal(committed.workflow.steps.length, 1);

    await page.locator('[data-action="domain:history"]').click();
    await page.locator('#undoBtn').click();
    await page.waitForFunction(
      (length) => window.WaferCadV2Workstation.snapshot().model.layers.length === length,
      initial.model.layers.length,
    );
    assert.deepEqual(
      (await snap()).model,
      initial.model,
      'Undo restores original physical geometry',
    );
    await page.locator('#redoBtn').click();
    await page.waitForFunction(
      (length) => window.WaferCadV2Workstation.snapshot().model.layers.length === length,
      committed.model.layers.length,
    );
    assert.deepEqual(
      (await snap()).model,
      committed.model,
      'Redo replays exact same physical geometry',
    );

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectNameInput').fill('Recovery transaction owner');
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      null,
      {
        timeout: 120000,
      },
    );

    const second = await context.newPage();
    second.on('pageerror', (error) => errors.push(error.message));
    try {
      await second.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
      await second.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const contender = await second.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(
        contender.workflow.writable,
        false,
        'Competing tab cannot silently steal writer',
      );
      assert.deepEqual(contender.model, committed.model);
      // Non-owner attempts must never clobber the persisted authoritative geometry.
      await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
      const stored = await second.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        const data = await loadWorkspaceState();
        return { model: data.model, name: data.name };
      });
      assert.deepEqual(stored.model, committed.model);
      assert.equal(stored.name, 'Recovery transaction owner');

      // The non-owner can edit in memory, but has no persistence authority
      // until an explicit, confirmed takeover reconciles the two tabs.
      await second.locator('[data-action="domain:project"]').click();
      await second.locator('#projectNameInput').fill('Takeover winner');
      const guarded = await second.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        return (await loadWorkspaceState())?.name;
      });
      assert.equal(guarded, 'Recovery transaction owner', 'Non-owner cannot autosave');

      // Diagnostic-only test copy, to be retired after the merged History
      // contract is repaired. Observe even transient status changes.
      await second.evaluate(() => {
        const slot = document.querySelector('[data-slot="status.message"]');
        const statuses = [];
        window.__takeoverObservedStatuses = statuses;
        const record = () => {
          const value = slot?.textContent || '';
          if (value && value !== statuses.at(-1)) statuses.push(value);
        };
        if (slot) {
          new MutationObserver(record).observe(slot, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }
        record();
      });
      await second.locator('#workspaceTakeOverBtn').click();
      const takeoverChoice = second.getByRole('button', {
        name: /^(Use this tab|Take over)$/,
      });
      await takeoverChoice.waitFor({ state: 'visible', timeout: 15000 });
      await takeoverChoice.click();
      await second.waitForFunction(
        () => window.WaferCadV2Workstation.snapshot().workflow.writable,
        null,
        { timeout: 30000 },
      );
      await page.waitForFunction(
        () => !window.WaferCadV2Workstation.snapshot().workflow.writable,
        null,
        { timeout: 30000 },
      );
      // Lease acquisition occurs before asynchronous reconciliation and Save.
      // Wait for the completed user-facing transaction, not the early lease flag.
      try {
        await second.waitForFunction(
          () =>
            /This tab now owns the local workspace|Took over this workspace/.test(
              document.querySelector('[data-slot="status.message"]')?.textContent || '',
            ),
          null,
          { timeout: 30000 },
        );
      } catch (error) {
        const winner = await second.evaluate(async () => {
          const { loadWorkspaceState } = await import('/workspace-persistence.js');
          const saved = await loadWorkspaceState().catch((e) => ({ error: String(e) }));
          return {
            statuses: window.__takeoverObservedStatuses,
            visibleStatus: document.querySelector('[data-slot="status.message"]')?.textContent,
            saveStatus: document.querySelector('#workspaceSaveStatus')?.textContent,
            workflow: window.WaferCadV2Workstation.snapshot().workflow,
            persistedName: saved?.name,
            persistedError: saved?.error,
            workspace: {
              retryReason: document.querySelector('.workspace')?.dataset.autosaveRetryReason,
              fullAutosaveCount: document.querySelector('.workspace')?.dataset.fullAutosaveCount,
              lastAutosaveDomain: document.querySelector('.workspace')?.dataset.lastAutosaveDomain,
            },
          };
        });
        const previousOwner = await page.evaluate(() => ({
          workflow: window.WaferCadV2Workstation.snapshot().workflow,
          status: document.querySelector('[data-slot="status.message"]')?.textContent,
        }));
        console.error('TAKEOVER_DIAG', JSON.stringify({ winner, previousOwner, errors }));
        throw error;
      }
      await second.waitForFunction(
        async () => {
          const { loadWorkspaceState } = await import('/workspace-persistence.js');
          return (await loadWorkspaceState())?.name === 'Takeover winner';
        },
        null,
        { timeout: 30000 },
      );
      const afterTakeover = await second.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        const project = await loadWorkspaceState();
        return { model: project.model, name: project.name };
      });
      assert.equal(afterTakeover.name, 'Takeover winner');
      assert.deepEqual(afterTakeover.model, committed.model);

      // The displaced owner must not overwrite the replacement writer.
      await page.locator('#saveProjectBtn').click();
      const afterStaleSave = await page.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        return (await loadWorkspaceState())?.name;
      });
      assert.equal(afterStaleSave, 'Takeover winner', 'Stale writer cannot overwrite takeover');
    } finally {
      await second.close();
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const recovered = await snap();
    assert.deepEqual(recovered.model, committed.model, 'Reload restores exact committed geometry');
    assert.equal(recovered.workflow.steps.length, 1, 'Reload restores logical History');
    assert.equal(recovered.projectName, 'Takeover winner');
    assert.deepEqual(errors, []);
    console.log('v2 History/Recovery: Undo, Redo, lease takeover, stale writer and reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
