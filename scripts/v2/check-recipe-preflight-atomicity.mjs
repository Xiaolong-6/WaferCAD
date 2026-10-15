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
        ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
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
    // A malformed, unapplied draft also must not mutate the committed model.
    // Keep this independently from the valid-but-unsatisfiable late-Step gate.
    const beforeDraft = await snapshot();
    await code.fill('deposit({');
    await page.locator('#recipeApplyCodeBtn').click();
    await page.waitForFunction(
      () => /Recipe code error:/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    assert.equal(await code.inputValue(), 'deposit({', 'Invalid draft remains editable');
    await page.locator('#recipeRunAllBtn').click();
    await page.waitForFunction(
      () => /Recipe preflight failed/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    const afterDraft = await snapshot();
    assert.deepEqual(afterDraft.model, beforeDraft.model, 'Malformed draft preserves geometry');
    assert.deepEqual(afterDraft.workflow.steps, beforeDraft.workflow.steps, 'Malformed draft preserves History');
    assert.deepEqual(afterDraft.workflow.branches, beforeDraft.workflow.branches, 'Malformed draft preserves Variants');

    // Correct the code; the ordinary Continue run must work after both failures
    // and deposit exactly 0.35 nm (0.00035 µm) in canonical physical coordinates.
    const recoveredCode = 'deposit({ material: "Recovered recipe film", thickness: "0.35 nm", area: "full" });';
    await code.fill(recoveredCode);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.waitForFunction(
      () => /Recipe code applied/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    await page.locator('#recipeRunStart').selectOption('continue');
    assert.deepEqual((await snapshot()).model, committed.model, 'Applying corrected code does not run it');
    await page.locator('#recipeRunAllBtn').click();
    const confirm = page.getByRole('button', { name: 'Continue and apply', exact: true });
    await confirm.waitFor({ state: 'visible', timeout: 15000 });
    await confirm.click();
    await page.waitForFunction(
      () => /Recipe completed: 1\\/1/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
      null,
      { timeout: 120000 },
    );
    const recovered = await snapshot();
    assert.equal(recovered.workflow.steps.length, committed.workflow.steps.length + 1);
    const film = recovered.model.layers.find((layer) => layer.name === 'Recovered recipe film');
    assert.ok(film, 'Corrected code commits an actual material');
    const thickness = recovered.model.regions
      .flatMap((region) => region.stack.filter((segment) => segment.layerId === film.id))
      .map((segment) => segment.z1 - segment.z0);
    assert.ok(thickness.length > 0, 'Recovered layer has canonical material segments');
    assert.ok(thickness.every((value) => Math.abs(value - 0.00035) < 1e-12),
      'Recovered layer retains exact subnanometre thickness');

    assert.deepEqual(errors, [], 'No v2 browser error during Recipe preflight');
    console.log(
      'v2 Recipe: invalid late Step, malformed draft, recovery and physical thickness PASS',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
