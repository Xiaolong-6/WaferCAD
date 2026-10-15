// Transfer Recipe code/preflight atomicity to the production v2 Workstation.
// Legacy Recipe template/Stop controls retain their separate owner until parity.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#layerName').fill('Retained manual film');
    await page.locator('#operationThickness').fill('0.125');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().workflow.steps.length === 1 &&
        !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const committed = await snapshot();

    await page.locator('[data-action="process-mode:code"]').click();
    const editor = page.locator('#recipeCodeEditor');
    const valid =
      'deposit({ material: "Recovered recipe film", thickness: "0.35 nm", area: "full" });';
    await editor.fill(valid);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.waitForFunction(() =>
      /Recipe code applied/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    assert.deepEqual((await snapshot()).model, committed.model);
    // An invalid, unapplied Code draft must block preflight while preserving
    // the last applied Recipe, committed model and complete History topology.
    const before = await snapshot();
    await editor.fill('deposit({');
    await page.locator('#recipeApplyCodeBtn').click();
    await page.waitForFunction(() =>
      /Recipe code error:/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    assert.equal(await editor.inputValue(), 'deposit({');
    await page.locator('#recipeRunAllBtn').click();
    await page.waitForFunction(() =>
      /Recipe preflight failed/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    const rejected = await snapshot();
    assert.deepEqual(rejected.model, before.model, 'Rejected draft preserves physical geometry');
    assert.deepEqual(
      rejected.workflow.steps,
      before.workflow.steps,
      'Rejected draft preserves Steps',
    );
    assert.deepEqual(
      rejected.workflow.branches,
      before.workflow.branches,
      'Rejected draft cannot silently create a Variant',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Continue and apply', exact: true }).isVisible(),
      false,
      'Preflight must reject before a continuing-Recipe confirmation',
    );

    await editor.fill(valid);
    await page.locator('#recipeApplyCodeBtn').click();
    await page.waitForFunction(() =>
      /Recipe code applied/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    );
    await page.locator('#recipeRunAllBtn').click();
    const confirm = page.getByRole('button', { name: 'Continue and apply', exact: true });
    await confirm.waitFor({ state: 'visible', timeout: 15000 });
    await confirm.click();
    await page.waitForFunction(
      () =>
        /Recipe completed: 1\/1/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const recovered = await snapshot();
    assert.equal(recovered.workflow.steps.length, committed.workflow.steps.length + 1);
    const film = recovered.model.layers.find((layer) => layer.name === 'Recovered recipe film');
    assert.ok(film, 'Successful re-apply commits a real scientific material layer');
    const thickness = recovered.model.regions
      .flatMap((region) => region.stack.filter((segment) => segment.layerId === film.id))
      .map((segment) => segment.z1 - segment.z0);
    assert.ok(thickness.length > 0);
    assert.ok(thickness.every((value) => Math.abs(value - 0.00035) < 1e-12));
    assert.deepEqual(errors, []);
    console.log('v2 Recipe preflight, failure atomicity, draft retention and recovery PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
