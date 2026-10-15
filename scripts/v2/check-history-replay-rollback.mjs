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
    await page.evaluate(() => {
      window.__v2HistoryClick = { count: 0 };
      document.getElementById('applyOperationBtn').addEventListener('click', () => {
        window.__v2HistoryClick.count++;
      });
    });
    await page.locator('#applyOperationBtn').click();
    // The Process button starts an async beforeApply transaction; give its
    // confirmation or error status a chance to appear before diagnosing it.
    await page.waitForTimeout(1500);
    const preflight = await page.evaluate(() => ({
      status: document.querySelector('[data-slot="status.message"]')?.textContent || '',
      editBanner: document.querySelector('.snapshot-continuation-banner')?.textContent || '',
      operation: document.getElementById('operationType')?.value,
      thickness: document.getElementById('operationThickness')?.value,
      disabled: document.getElementById('applyOperationBtn')?.disabled,
      domApplyButtons: document.querySelectorAll('#applyOperationBtn').length,
      onclick: typeof document.getElementById('applyOperationBtn')?.onclick,
      clickTrace: window.__v2HistoryClick,
      workflowBusy: window.WaferCadV2Workstation?.snapshot()?.workflow?.busy,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => ({
        hidden: node.hidden,
        text: node.textContent?.slice(0, 500),
      })),
      visibleActions: [...document.querySelectorAll('button')]
        .filter((item) => item.getClientRects().length > 0)
        .map((item) => item.textContent?.trim())
        .filter((label) => /Replay|Replace|Cancel|Variant/.test(label || '')),
    }));
    console.log('V2_HISTORY_EDIT_PAGEERRORS', JSON.stringify(errors));
    console.log('V2_HISTORY_EDIT_PREFLIGHT', JSON.stringify(preflight));
    assert.ok(
      preflight.visibleActions.some((label) => /Replace & replay later Steps/.test(label)),
      'Expected real History edit replay confirmation; inspect preflight evidence',
    );
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
