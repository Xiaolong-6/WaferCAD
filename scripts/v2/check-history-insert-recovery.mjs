// #184: native v2 History Insert-before must roll back an interrupted
// real Worker replay and survive a subsequent saved-project reload.
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
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('0.05');

    const names = ['Insert A', 'Insert B', 'Insert C', 'Insert D'];
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
    const original = await snapshot();
    assert.equal(original.workflow.steps.length, 4);
    assert.equal(original.workflow.branches.length, 1);

    await page.locator('[data-action="domain:history"]').click();
    const target = page
      .locator('.history-step-wrap', {
        has: page.locator('.process-history-body strong', { hasText: 'Deposit Insert B' }),
      })
      .first();
    await target.locator('.snapshot-more-trigger').click();
    await target.locator('.snapshot-more-popover button', { hasText: 'Insert before' }).click();
    await page.getByRole('button', { name: 'Update current Variant', exact: true }).click();
    await page.waitForFunction(
      () => /Insert Step/.test(document.querySelector('#applyOperationBtn')?.textContent || ''),
      null,
      { timeout: 30000 },
    );
    // Recovery checkpoint must be available before the inserted Step commits.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some((option) =>
          /pre-history-step-insert/.test(option.textContent || ''),
        ),
      null,
      { timeout: 30000 },
    );
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('0.05');
    await page.locator('#layerName').fill('Inserted X');

    await page.evaluate(() => {
      const nativePost = Worker.prototype.postMessage;
      window.__insertFault = { requests: 0, injected: 0 };
      Worker.prototype.postMessage = function (request, ...rest) {
        if (request?.params && request?.model) {
          window.__insertFault.requests++;
          if (window.__insertFault.requests === 3) {
            window.__insertFault.injected++;
            throw new Error('synthetic v2 insertion replay Worker failure');
          }
        }
        return Reflect.apply(nativePost, this, [request, ...rest]);
      };
    });

    assert.match(await page.locator('#applyOperationBtn').innerText(), /Insert Step/);
    // The scientific contract intentionally dispatches through the real v2
    // controller. Pointer mechanics have a separate browser owner in #275.
    await page.locator('#applyOperationBtn').evaluate((button) => button.click());
    await page.waitForFunction(
      () =>
        /Recompute stopped after 1\/3 existing Steps/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const status = await page.locator('[data-slot="status.message"]').innerText();
    assert.match(status, /Original Variant restored/);
    assert.match(status, /pre-insertion Recovery checkpoint/);
    assert.deepEqual(
      await page.evaluate(() => window.__insertFault),
      { requests: 3, injected: 1 },
      'Insert and first existing Step replay; fail the next real Worker request',
    );

    const rolledBack = await snapshot();
    assert.deepEqual(rolledBack.model, original.model, 'No partial deposited material survives');
    assert.deepEqual(
      rolledBack.workflow.steps,
      original.workflow.steps,
      'All original Steps survive',
    );
    assert.deepEqual(
      rolledBack.workflow.branches,
      original.workflow.branches,
      'Original Variant topology and HEAD are restored',
    );
    assert.ok(names.every((name) => rolledBack.model.layers.some((layer) => layer.name === name)));
    assert.ok(!rolledBack.model.layers.some((layer) => layer.name === 'Inserted X'));
    assert.deepEqual(errors, []);

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 30000 },
    );
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const reloaded = await snapshot();
    assert.deepEqual(reloaded.model, original.model, 'Reload preserves original physical geometry');
    assert.deepEqual(reloaded.workflow.steps, original.workflow.steps);
    assert.deepEqual(reloaded.workflow.branches, original.workflow.branches);
    console.log('V2_HISTORY_INSERT_RECOVERY: Worker fault, exact rollback, Save/Reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
