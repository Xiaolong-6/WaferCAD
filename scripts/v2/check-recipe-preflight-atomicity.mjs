// Transfer a Legacy Recipe preflight safety invariant to the shipped v2 Workstation.
// An invalid late Step with new-base selected must not reset the live Model or History.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const status = () => page.locator('[data-slot="status.message"]').innerText();
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('[data-action="process-mode:code"]').click();
    const code = page.locator('#recipeCodeEditor');
    await code.fill('deposit({ material: "Safety film", thickness: "20 nm", area: "full" });');
    await page.locator('#recipeApplyCodeBtn').click();
    await page.locator('#recipeRunAllBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Safety film',
        ) &&
        !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const committed = await snapshot();
    assert.equal(committed.workflow.steps.length, 1);
    assert.match(await status(), /Recipe completed: 1\/1/);

    // Syntactically valid code; Step 2 refers to a film absent after Base rebuild.
    const invalid = [
      'deposit({ material: "Temporary film", thickness: "20 nm", area: "full" });',
      'extend({ material: "Nonexistent film", thickness: "10 nm", area: "full" });',
    ].join('\n');
    await code.fill(invalid);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.locator('#recipeRunStart').selectOption('new-base');
    const beforeReject = await snapshot();
    await page.locator('#recipeRunAllBtn').click();
    await page.waitForFunction(
      () =>
        /Recipe preflight failed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 30000 },
    );
    const afterReject = await snapshot();
    assert.deepEqual(afterReject.model, beforeReject.model, 'Preflight cannot reset the Base');
    assert.deepEqual(
      afterReject.workflow.steps,
      beforeReject.workflow.steps,
      'Preflight cannot mutate History Steps',
    );
    assert.deepEqual(
      afterReject.workflow.branches,
      beforeReject.workflow.branches,
      'Preflight cannot create a Variant',
    );
    assert.deepEqual(afterReject.model, committed.model, 'Committed geometry is preserved');
    assert.equal(
      await page.getByRole('button', { name: 'Continue and apply', exact: true }).isVisible(),
      false,
      'Preflight fails before transaction confirmation',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Clear history', exact: true }).isVisible(),
      false,
      'Invalid new-base replay cannot request destructive History reset',
    );
    assert.deepEqual(errors, [], 'No v2 browser error during Recipe preflight');
    console.log(
      'v2 Recipe: valid Run All, invalid late Step, non-destructive new-base preflight PASS',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
