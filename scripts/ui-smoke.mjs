// Native-v2 product smoke: Welcome, process transaction, local restore and export.
// Source-only Legacy UI contracts run separately against the immutable archived tag.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertNoPageErrors,
  baseUrl,
  gotoWelcome,
  launchBrowser,
  newUiContext,
  observePageErrors,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();

try {
  const context = await newUiContext(browser, {
    viewport: { width: 1365, height: 900 },
    acceptDownloads: true,
  });
  try {
    const page = await context.newPage();
    const errors = observePageErrors(page);
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const ready = () =>
      page.waitForFunction(
        () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
        null,
        { timeout: 120000 },
      );

    // The public Welcome route stays separate from the writable editor.
    await gotoWelcome(page);
    assert.equal(await page.locator('#welcomeScreen').isVisible(), true);
    assert.ok((await page.locator('.welcome-example-card').count()) >= 3);
    assert.equal(await page.locator('.p-workbench').count(), 0);

    // A normal empty start opens the actual v2 workstation, not a retired route.
    await page.locator('#welcomeEmptyBtn').click();
    await page.waitForURL('**/app.html*', { timeout: 30000 });
    await ready();
    assert.equal(await page.locator('.p-workbench').getAttribute('data-boot'), 'ready');
    for (const view of ['main', 'mask', 'three', 'section']) {
      assert.equal(await page.locator('.p-view[data-view="' + view + '"]').count(), 1);
    }
    const initial = await snapshot();
    assert.equal(initial.model.layers.length, 1);
    assert.equal(initial.workflow.steps.length, 0);
    assert.equal(initial.workflow.writable, true);

    // Exercise the real Process UI and require a complete atomic History step.
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#layerName').fill('Smoke layer');
    await page.locator('#operationThickness').fill('0.05');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return state.model.layers.length === 2 && state.workflow.steps.length === 1;
      },
      null,
      { timeout: 120000 },
    );
    const deposited = await snapshot();
    assert.equal(deposited.model.layers.at(-1).name, 'Smoke layer');
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
      null,
      { timeout: 120000 },
    );

    // The editor must restore the same committed model and History after reload.
    await page.goto(baseUrl + '/app.html', { waitUntil: 'domcontentloaded' });
    await ready();
    const reloaded = await snapshot();
    assert.equal(reloaded.model.layers.length, deposited.model.layers.length);
    assert.equal(reloaded.workflow.steps.length, deposited.workflow.steps.length);
    assert.equal(reloaded.model.layers.at(-1).id, deposited.model.layers.at(-1).id);

    // Project export must still contain the deposited physical model.
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectExportMenuBtn').click();
    const exportButton = page.locator('#exportProjectBtn');
    await exportButton.waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await exportButton.click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.wafercad$/);
    assert.equal(await download.failure(), null);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.ok(exported.model.layers.some((layer) => layer.name === 'Smoke layer'));
    assertNoPageErrors(errors);
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('WaferCAD native-v2 UI smoke: OK');
