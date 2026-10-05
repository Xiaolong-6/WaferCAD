import assert from 'node:assert/strict';
import {
  readFile } from 'node:fs/promises';
import {
  assertNoPageErrors,
  gotoWelcome,
  launchBrowser,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForStatus,
  waitForThreeReady,
  newUiContext,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();

try {
  const context = await newUiContext(browser, {
    viewport: { width: 1365, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = observePageErrors(page);

  // Contract 1: Welcome boots independently from the editor shell.
  await gotoWelcome(page);
  assert.equal(await page.locator('#welcomeScreen').isVisible(), true);
  assert.equal(await page.locator('.app-shell').count(), 0);
  assert.ok(await page.locator('.welcome-example-card').count() >= 3);

  // Contract 2: A normal start reaches the usable workstation.
  await page.locator('#welcomeEmptyBtn').click();
  await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
  await waitForAppReady(page);

  assert.equal(await page.locator('#welcomeScreen').count(), 0);
  assert.equal(await page.locator('.app-shell').count(), 1);
  assert.equal(await page.locator('#mainPanel').isVisible(), true);
  assert.equal(await page.locator('#maskPanel').isVisible(), true);
  assert.equal(await page.locator('#threePanel').isVisible(), true);
  assert.equal(
    await page.locator('.workstation-view-stage').getAttribute('data-view-mode'),
    'overview',
  );

  // The smoke gate requires the real 3D renderer to reach a stable frame.
  await waitForThreeReady(page);
  assert.equal(await page.locator('#threeHost').getAttribute('data-render-error'), null);

  // Contract 3: Core tool navigation is bound and Project remains the default tool.
  assert.equal(await page.locator('#settingsTab').getAttribute('aria-selected'), 'true');
  await openFunctionPanel(page, 'project');
  for (const id of [
    'projectNameInput',
    'newProjectBtn',
    'openProjectInput',
    'saveProjectBtn',
    'exportProjectBtn',
    'xyUnitSelect',
  ]) {
    assert.equal(await page.locator(`#settingsTools #${id}`).count(), 1);
  }

  // Contract 4: One representative process operation completes through the real UI.
  await openFunctionPanel(page, 'process');
  await page.locator('[data-process-mode="add"]').click();
  await page.locator('#operationArea').selectOption('full');
  await page.locator('#growthMode').selectOption('direct');
  await page.locator('#operationThickness').fill('0.05');
  await page.locator('#layerName').fill('Smoke layer');
  await page.locator('#applyOperationBtn').click();

  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
  await waitForStatus(page, /Deposited Smoke layer/);
  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);
  assert.ok(
    await page
      .locator('#layerLegend .legend-name')
      .evaluateAll((inputs) => inputs.some((input) => input.value === 'Smoke layer')),
  );

  // Contract 5: Autosave/reload keeps the successful process result.
  await page.waitForFunction(
    () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
    null,
    { timeout: 8000 },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await waitForAppReady(page);
  await waitForStatus(page, /^Restored local workspace/);
  assert.ok(
    await page
      .locator('#layerLegend .legend-name')
      .evaluateAll((inputs) => inputs.some((input) => input.value === 'Smoke layer')),
  );

  // Contract 6: A user-requested project export is valid and contains the process result.
  await openFunctionPanel(page, 'project');
  await page.locator('#projectNameInput').fill('UI smoke export');
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#exportProjectBtn').click();
  const download = await downloadPromise;

  assert.equal(download.suggestedFilename(), 'UI smoke export.wafercad');
  const savedPath = await download.path();
  assert.ok(savedPath);

  const exported = JSON.parse(await readFile(savedPath, 'utf8'));
  assert.equal(exported.format, 'WaferCAD-vector');
  assert.ok(exported.model.layers.some((layer) => layer.name === 'Smoke layer'));

  assertNoPageErrors(errors);
  await context.close();
} finally {
  await browser.close();
}

console.log('WaferCAD UI smoke: OK');
