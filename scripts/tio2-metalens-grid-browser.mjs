// Bounded real-app visual acceptance for the compiled 4725-site GRID surrogate.
// This is not 4725-site Recipe Run All: each physical template was replayed by
// the Kernel in the generator; the browser must open and render that final model.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  baseUrl,
  chooseConfirmation,
  launchBrowser,
  newUiContext,
  observePageErrors,
  openFunctionPanel,
  closeFunctionPanel,
  waitForAppReady,
  waitForThreeReady,
  canvasInkFraction,
} from './test-helpers/ui.mjs';

const file = await readFile(
  new URL(
    '../test-results/metalens/tio2-4725-grid-kernel-compiled-ILLUSTRATIVE.wafercad',
    import.meta.url,
  ),
);
const browser = await launchBrowser();
const context = await newUiContext(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = observePageErrors(page);
const begin = performance.now();
try {
  await page.goto(baseUrl + '/app.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForAppReady(page);
  await openFunctionPanel(page, 'project', { timeout: 120000 });
  await page.locator('#openProjectInput').setInputFiles({
    name: 'tio2-4725-grid-kernel-compiled-ILLUSTRATIVE.wafercad',
    mimeType: 'application/json',
    buffer: file,
  });
  await chooseConfirmation(page);
  await page.waitForFunction(
    () => /Opened .*\.wafercad\./.test(document.getElementById('statusText')?.textContent || ''),
    null,
    { timeout: 180000 },
  );
  const loadedMs = Math.round(performance.now() - begin);
  // Exportable viewport evidence must not be hidden beneath Project flyout.
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 180000);
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('sectionCanvas');
      return canvas && canvas.width > 100 && canvas.height > 100;
    },
    null,
    { timeout: 120000 },
  );
  const view = await page.evaluate(() => {
    const three = document.querySelector('#threeHost canvas');
    const section = document.getElementById('sectionCanvas');
    return {
      threeWidth: three?.width || 0,
      threeHeight: three?.height || 0,
      sectionWidth: section?.width || 0,
      sectionHeight: section?.height || 0,
      threeRenderState: document.getElementById('threeHost')?.dataset.renderState,
    };
  });
  assert.equal(view.threeRenderState, 'ready');
  assert.ok(view.threeWidth > 100 && view.threeHeight > 100);
  assert.ok(view.sectionWidth > 100 && view.sectionHeight > 100);
  const sectionInk = await canvasInkFraction(page, '#sectionCanvas');
  assert.ok(sectionInk > 0.02, 'Full-array Section is blank: ' + sectionInk);
  await mkdir('test-results/metalens', { recursive: true });
  await page.locator('#threePanel').screenshot({
    path: 'test-results/metalens/grid-4725-three-actual.png',
    timeout: 60000,
  });
  await page.locator('#sectionPanel').screenshot({
    path: 'test-results/metalens/grid-4725-section-actual.png',
    timeout: 60000,
  });
  const report = {
    pass: true,
    layout: 'GRID compiled surrogate, not author design',
    recipe: 'distinct-template Kernel compilation, not full-array Run All',
    loadedMs,
    visibleMs: Math.round(performance.now() - begin),
    sectionInk,
    ...view,
  };
  await writeFile(
    'test-results/metalens/grid-visual-browser-report.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  assert.deepEqual(errors, []);
  console.log('METALENS_GRID_BROWSER|' + JSON.stringify(report));
} finally {
  await context.close();
  await browser.close();
}
