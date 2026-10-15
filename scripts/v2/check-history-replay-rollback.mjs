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
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
