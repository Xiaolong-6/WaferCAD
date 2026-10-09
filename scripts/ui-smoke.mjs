import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
  assert.ok((await page.locator('.welcome-example-card').count()) >= 3);
  assert.equal(await page.locator('.welcome-example-open').count(), 0);
  for (const card of await page.locator('.welcome-example-card').all()) {
    const titleLink = card.locator('.welcome-example-title-link'),
      summaryLink = card.locator('.welcome-example-summary-link');
    assert.equal(await titleLink.count(), 1);
    assert.equal(await summaryLink.count(), 1);
    assert.equal(await titleLink.getAttribute('href'), await summaryLink.getAttribute('href'));
    assert.match(await titleLink.getAttribute('href'), /^\.\/app\.html\?start=example&example=/);
  }

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
  await page.locator('#geometryDiagnosticsPanel > summary').click();
  assert.equal(await page.locator('#diagnosticsAnalyzeBtn').isVisible(), true);
  await page.locator('#diagnosticsAnalyzeBtn').click();
  await page.waitForFunction(
    () => /Analysis complete/.test(document.getElementById('diagnosticsStatus')?.textContent || ''),
    null,
    { timeout: 30000 },
  );
  assert.match(await page.locator('#diagnosticsResults').textContent(), /Material volume/);
  assert.match(await page.locator('#diagnosticsResults').textContent(), /Base/);
  await page.locator('#operationType').selectOption('add');
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
  assert.match(await page.locator('#diagnosticsStatus').textContent(), /out of date/);
  await page.locator('#diagnosticsAnalyzeBtn').click();
  await page.waitForFunction(
    () => /Analysis complete/.test(document.getElementById('diagnosticsStatus')?.textContent || ''),
    null,
    { timeout: 30000 },
  );
  assert.match(await page.locator('#diagnosticsResults').textContent(), /Smoke layer/);
  assert.equal(await page.locator('#diagnosticsResults').isVisible(), true);

  // Contract 4b: expanded Diagnostics stays usable through Step/Recipe switching
  // and at compact workstation widths. Capture what the actual browser renders.
  await page.locator('[data-process-input-mode="recipe"]').click();
  assert.equal(await page.locator('#geometryDiagnosticsPanel').isVisible(), true);
  assert.equal(await page.locator('#diagnosticsAnalyzeBtn').isVisible(), true);
  await page.locator('[data-process-input-mode="manual"]').click();
  assert.equal(await page.locator('#geometryDiagnosticsPanel').isVisible(), true);
  const reviewDir = 'test-results/product-review';
  await mkdir(reviewDir, { recursive: true });
  const assertDiagnosticsFit = async () => {
    const fit = await page.locator('#geometryDiagnosticsPanel').evaluate((element) => {
      const content = element.querySelector('.diagnostics-content');
      const report = element.querySelector('#diagnosticsResults');
      const panel = document.querySelector('#toolPanel');
      const rect = element.getBoundingClientRect();
      const flyout = panel.getBoundingClientRect();
      return {
        panelWidth: rect.width,
        isWithinFlyout: rect.left >= flyout.left - 2 && rect.right <= flyout.right + 2,
        horizontalContentOverflow: content.scrollWidth > content.clientWidth + 2,
        horizontalResultOverflow: report.scrollWidth > report.clientWidth + 2,
      };
    });
    assert.ok(fit.panelWidth > 180, 'Diagnostics panel must remain usable');
    assert.equal(fit.isWithinFlyout, true, 'Diagnostics must stay inside Process flyout');
    assert.equal(fit.horizontalContentOverflow, false, 'Diagnostics content must not overflow in X');
    assert.equal(fit.horizontalResultOverflow, false, 'Diagnostics findings must wrap without horizontal overflow');
  };
  await assertDiagnosticsFit();
  await page.locator('#geometryDiagnosticsPanel > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${reviewDir}/diagnostics-desktop.png` });
  await page.setViewportSize({ width: 1024, height: 768 });
  await openFunctionPanel(page, 'process');
  await assertDiagnosticsFit();
  await page.locator('#geometryDiagnosticsPanel > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${reviewDir}/diagnostics-compact.png` });
  await page.setViewportSize({ width: 1365, height: 900 });
  await openFunctionPanel(page, 'process');

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
