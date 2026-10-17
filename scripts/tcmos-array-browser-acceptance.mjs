// Browser-only evidence of the derived 4x4 patch; does not claim a
// replayable array process, published die floorplan or electrical fanout.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';

const dir = resolve('test-results/tcmos');
const sourceFile = resolve(dir, 'tcmos-inverter-4x4-ARRAY-PROTOTYPE.wafercad');
const expected = await readProjectFile(new Blob([await readFile(sourceFile)]));
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
});
const report = { result: 'in_progress', sourceCells: 16, replayedArrayRecipe: false };
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto((process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await page.locator('.p-nav [data-action="domain:project"]').click();
  await page.locator('#openProjectInput').setInputFiles(sourceFile);
  const confirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    expected.name,
    { timeout: 120000 },
  );
  const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal((await snap()).model.array.instances.length, 16);
  assert.equal((await snap()).layout.elements.length, 232 * 16);
  assert.equal(
    (await snap()).model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible,
    true,
  );
  for (const key of ['mask', 'three', 'section']) {
    await page.locator('.p-nav [data-action="domain:' + (key === 'mask' ? 'mask' : 'project') + '"]').click();
    const dock = page.locator('[data-action="dock:view:' + key + '"]:visible').first();
    if (await dock.count()) {
      if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
    } else if (key !== 'section') {
      await page.locator('[data-action="view:' + key + '"]:visible').first().click();
    } else {
      await page.getByRole('button', { name: 'Section', exact: true }).first().click();
    }
    await waitForPaint(page);
    const target = page.locator('#' + key + 'Panel');
    await target.waitFor({ state: 'visible', timeout: 12000 });
    const max = page.locator('[data-action="maximize:' + key + '"]:visible').first();
    const box = await target.boundingBox();
    if (box && box.width < 700 && (await max.count())) {
      await max.click();
      await waitForPaint(page);
    }
    await target.screenshot({ path: resolve(dir, 'tcmos-4x4-' + key + '-chromium.png') });
  }
  assert.deepEqual(errors, []);
  report.result = 'pass';
  report.maskElements = expected.layout.elements.length;
  report.oxideVisible = true;
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || error.message;
  report.pageErrors = errors;
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'tcmos-4x4-browser-report.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
