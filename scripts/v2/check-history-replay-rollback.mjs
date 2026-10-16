// Issue #184: a failed real Worker during historical Step replay cannot
// leave partially applied geometry, Steps, or Variants in the v2 workspace.
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
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('0.05');

    const names = ['Rollback A', 'Rollback B', 'Rollback C', 'Rollback D'];
    for (const name of names) {
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
    const baseline = await snapshot();
    assert.equal(baseline.workflow.steps.length, 4);
    assert.equal(baseline.workflow.branches.length, 1);

    await page.locator('[data-action="domain:history"]').click();
    const first = page.locator('.history-step-wrap', { hasText: names[1] }).first();
    await first.locator('.snapshot-more-trigger').click();
    await first.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
    await page.waitForFunction(
      () => document.querySelector('#layerName')?.value === 'Rollback B',
      null,
      { timeout: 30000 },
    );
    // Checkpoint must precede any physical or History mutation.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some((option) =>
          /pre-history-step-edit/.test(option.textContent || ''),
        ),
      null,
      { timeout: 30000 },
    );
    await page.locator('#layerName').fill('Rollback B edited');

    await page.evaluate(() => {
      const nativePost = Worker.prototype.postMessage;
      window.__historyReplayNativePost = nativePost;
      window.__historyReplayFault = { requests: 0, injected: 0 };
      Worker.prototype.postMessage = function (request, ...rest) {
        if (request?.params && request?.model) {
          window.__historyReplayFault.requests++;
          if (window.__historyReplayFault.requests === 3) {
            window.__historyReplayFault.injected++;
            throw new Error('synthetic v2 replay Worker failure');
          }
        }
        return Reflect.apply(nativePost, this, [request, ...rest]);
      };
    });

    const applyLabel = await page.locator('#applyOperationBtn').innerText();
    assert.match(applyLabel, /Save edited Step/, 'Native v2 must remain in historical edit mode');
    // This is a Worker/transaction scientific oracle, not a pointer hit-test.
    // Dispatch on the live button in one browser task to avoid a v2 panel
    // re-render detaching the element between Playwright actionability and click.
    await page.locator('#applyOperationBtn').evaluate((button) => button.click());
    await page.getByRole('button', { name: 'Replace & replay later Steps', exact: true }).click();
    await page.waitForFunction(
      () =>
        /Replay stopped after 1\/2 later Steps/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const status = await page.locator('[data-slot="status.message"]').innerText();
    assert.match(status, /Original Variant restored/);
    assert.deepEqual(
      await page.evaluate(() => window.__historyReplayFault),
      { requests: 3, injected: 1 },
      'Inject the fault after the edited Step and one downstream Worker commit',
    );
    const rolledBack = await snapshot();
    assert.deepEqual(rolledBack.model, baseline.model, 'No partially replayed physical geometry');
    assert.deepEqual(
      rolledBack.workflow.steps,
      baseline.workflow.steps,
      'All original History Steps survive the failed replay',
    );
    assert.deepEqual(
      rolledBack.workflow.branches,
      baseline.workflow.branches,
      'Failed replay must not move or create a Variant HEAD',
    );
    assert.ok(
      names.every((name) => rolledBack.model.layers.some((layer) => layer.name === name)),
      'Every original material layer survives rollback',
    );
    assert.equal(
      rolledBack.model.layers.some((layer) => layer.name === 'Rollback B edited'),
      false,
      'No orphan edited layer survives rollback',
    );
    assert.deepEqual(errors, [], 'No uncaught page errors during failed v2 replay');
    console.log(
      'V2_HISTORY_REPLAY_ROLLBACK: fault after 1/2 downstream commits, exact rollback PASS',
    );

    // Success path: restore the true Worker, then edit the very same middle
    // History Step and require two subsequent Steps to replay atomically.
    await page.evaluate(() => {
      Worker.prototype.postMessage = window.__historyReplayNativePost;
      window.__historySuccess = { requests: 0 };
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (request, ...rest) {
        if (request?.params && request?.model) window.__historySuccess.requests++;
        return Reflect.apply(post, this, [request, ...rest]);
      };
    });
    await page.locator('[data-action="domain:history"]').click();
    const replacement = page.locator('.history-step-wrap', { hasText: names[1] }).first();
    await replacement.locator('.snapshot-more-trigger').click();
    await replacement.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
    await page.waitForFunction(
      () => document.querySelector('#layerName')?.value === 'Rollback B',
      null,
      { timeout: 30000 },
    );
    await page.locator('#operationThickness').fill('0.1');
    await page.locator('#layerName').fill('Rollback B edited');
    await page.locator('#applyOperationBtn').evaluate((button) => button.click());
    await page.getByRole('button', { name: 'Replace & replay later Steps', exact: true }).click();
    await page.waitForFunction(
      () =>
        /Replayed 2 later Steps/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.evaluate(() => window.__historySuccess.requests),
      3,
      'Edited Step and two downstream Steps must each execute through the actual Worker',
    );
    const updated = await snapshot();
    assert.equal(updated.workflow.steps.length, 4, 'Replacing a Step retains process length');
    assert.equal(updated.workflow.branches.length, 1, 'Current Variant rewrite stays on Main');
    assert.ok(updated.model.layers.some((layer) => layer.name === 'Rollback B edited'));
    assert.equal(updated.model.layers.some((layer) => layer.name === 'Rollback B'), false);
    assert.ok(updated.model.layers.some((layer) => layer.name === 'Rollback C'));
    assert.ok(updated.model.layers.some((layer) => layer.name === 'Rollback D'));
    const localThicknesses = updated.model.regions
      .find((region) => region.stack.length === 5)
      ?.stack.map(({ z0, z1 }) => Number((z1 - z0).toFixed(4)));
    assert.deepEqual(
      localThicknesses,
      [12, 0.05, 0.1, 0.05, 0.05],
      'Editing B to 100 nm must recompute C/D on the new Z top without double depositing',
    );
    assert.notDeepEqual(updated.model, baseline.model, 'Successful edit changes physical geometry');

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 120000 },
    );
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const reopened = await snapshot();
    assert.deepEqual(reopened.model, updated.model, 'Successful edit must survive Save/Reload');
    assert.deepEqual(reopened.workflow.steps, updated.workflow.steps);
    assert.deepEqual(reopened.workflow.branches, updated.workflow.branches);
    assert.deepEqual(errors, []);
    console.log(
      'V2_HISTORY_EDIT_SUCCESS: exact B film Z, two real Worker replays, History/IO PASS',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
