// Actual Workstation Chromium acceptance for the SEPARATE post-Recipe
// routed 2.5D variant. A generated SVG is NOT substituted for this test.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';

const dir = resolve('test-results/tcmos');
const path = resolve(dir, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-PROTOTYPE.wafercad');
await loadGeometryKernel();
const file = await readProjectFile(new Blob([await readFile(path)]));
assert.equal(file.model.kernel, 'vector-2.5d-v1');
assert.equal(file.layout.elements.length, 3963);
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
});
const errors = [];
const report = {
  status: 'in_progress',
  project: file.name,
  actualChromium: true,
  physicalMaterialModel: true,
  routedRecipeReplayValidated: false,
  sourceMasksUntouched: 3712,
  supplementaryMasks: 251,
  expectedIndependentNetworks: 19,
};
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(
    (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') + '/app.html?start=empty',
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await page.locator('.p-nav [data-action="domain:project"]').click();
  await page.locator('#openProjectInput').setInputFiles(path);
  const confirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    file.name,
    { timeout: 120000 },
  );
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const loaded = await snapshot();
  assert.equal(loaded.model.kernel, 'vector-2.5d-v1');
  assert.ok(!loaded.model.array);
  assert.equal(loaded.layout.elements.length, 3963);
  assert.ok(loaded.model.layers.some((l) => l.name === 'METAL4 Al (illustrative)'));
  assert.ok(loaded.model.layers.some((l) => l.name === 'VIA34 W (illustrative)'));
  assert.ok(loaded.model.layers.some((l) => l.name === 'ILD4 SiO2 (illustrative)'));
  assert.ok(!loaded.processRecipe && !loaded.snapshotBranches);
  for (const view of ['mask', 'three', 'section']) {
    const domain = view === 'mask' ? 'mask' : 'project';
    await page.locator('.p-nav [data-action="domain:' + domain + '"]').click();
    const dock = page.locator('[data-action="dock:view:' + view + '"]:visible').first();
    if (await dock.count()) {
      if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
    } else if (view !== 'section') {
      await page.locator('[data-action="view:' + view + '"]:visible').first().click();
    } else {
      await page.getByRole('button', { name: 'Section', exact: true }).first().click();
    }
    await waitForPaint(page);
    const panel = page.locator('#' + view + 'Panel');
    await panel.waitFor({ state: 'visible', timeout: 12000 });
    const maximize = page.locator('[data-action="maximize:' + view + '"]:visible').first();
    const dimensions = await panel.boundingBox();
    if (dimensions && dimensions.width < 700 && (await maximize.count())) {
      await maximize.click();
      await waitForPaint(page);
    }
    await panel.screenshot({ path: resolve(dir, 'tcmos-4x4-routed-' + view + '-chromium.png') });
  }
  assert.deepEqual(errors, []);
  report.status = 'pass';
  report.renderedModelRegions = loaded.model.regions.length;
} catch (error) {
  report.status = 'fail';
  report.error = error.stack || error.message;
  report.pageErrors = errors;
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'tcmos-4x4-routed-browser-report.json'),
    JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
