// Browser acceptance of a generated, unbundled T-CMOS candidate in the real v2 Workstation.
// Generates evidence without silently publishing the candidate as a Welcome Example.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { readProjectFile } from '../site/project-io.js';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const dir = resolve('test-results/tcmos');
const candidate = resolve(dir, 'tcmos-ternary-inverter-130nm.wafercad');
const expected = await readProjectFile(new Blob([await readFile(candidate)]));
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const panel = async (key) => {
  if (!(await page.locator(`.p-nav [data-action="domain:${key}"]`).isVisible())) {
    await page.locator('[data-action="show-editor"]').click();
  }
  await page.locator(`.p-nav [data-action="domain:${key}"]`).click();
  await waitForPaint(page);
};
const exportProject = async () => {
  await panel('project');
  await page.locator('#projectExportMenuBtn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('#exportProjectBtn').click({ timeout: 120000 }),
  ]);
  const path = resolve(dir, 'tcmos-v2-browser-export.wafercad');
  await download.saveAs(path);
  return readProjectFile(new Blob([await readFile(path)]));
};
const report = { result: 'in_progress', expectedSteps: expected.processRecipe.steps.length };
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await panel('project');
  await page.locator('#openProjectInput').setInputFiles(candidate);
  const openConfirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await openConfirm.isVisible()) await openConfirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    expected.name,
    { timeout: 120000 },
  );
  const opened = await snap();
  assert.equal(opened.model.implants[0].depthStart, 0.08);
  assert.equal(opened.model.implants[1].depthStart, 0.08);
  assert.equal(opened.model.layers.length, expected.model.layers.length);
  await page.screenshot({ path: resolve(dir, 'tcmos-v2-before-runall.png') });

  await panel('process');
  await page.locator('[data-action="process-mode:recipe"]').click();
  const count = await page.locator('.recipe-step-row').count();
  assert.equal(count, expected.processRecipe.steps.length, 'Recipe steps not exposed in v2');
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.locator('#recipeRunAllBtn').click();
  const modal = page.getByRole('dialog');
  if (await modal.isVisible()) {
    const clear = modal.getByRole('button', { name: /Clear history|Clear/i });
    if (await clear.count()) await clear.first().click();
    else {
      const labels = await modal.locator('button').allInnerTexts();
      throw new Error('Unknown new-Base confirmation options: ' + JSON.stringify(labels));
    }
  }
  await page.waitForFunction(
    () => {
      const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
      const status = document.querySelector('[data-slot="status.message"]')?.textContent || '';
      return /^(Completed|Failed|Stopped):/.test(summary) ||
        /Recipe (completed|failed)|Recipe failed at Step/i.test(status);
    },
    null,
    { timeout: 180000 },
  );
  const summary = await page.locator('#recipeRunSummary').innerText();
  const status = await page.locator('[data-slot="status.message"]').innerText();
  assert.ok(
    summary.startsWith(`Completed: ${count}/${count}`) ||
      /Recipe completed:/.test(status),
    'Run All did not complete: ' + summary + ' / ' + status,
  );
  const exported = await exportProject();
  const geometry = await assertSameMaterialGeometry(expected.model, exported.model, {
    areaToleranceUm2: 2e-6,
  });
  assert.equal(exported.model.implants.length, expected.model.implants.length);
  assert.deepEqual(
    exported.model.implants.slice(0, 2).map((item) => item.depthStart),
    [0.08, 0.08],
  );
  assert.equal(exported.processRecipe.steps.length, count);
  assert.ok(exported.snapshotBranches.nodes.length >= count);
  await page.screenshot({ path: resolve(dir, 'tcmos-v2-after-runall.png') });
  assert.deepEqual(pageErrors, [], 'Unexpected v2 browser errors');
  Object.assign(report, {
    result: 'pass',
    steps: count,
    geometry,
    layers: exported.model.layers.length,
    regions: exported.model.regions.length,
    implants: exported.model.implants.length,
    history: exported.snapshotBranches.nodes.length,
  });
  console.log('T-CMOS v2 browser Run All and strict material geometry parity PASS');
} catch (error) {
  Object.assign(report, { result: 'fail', error: error.stack || error.message, pageErrors });
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'browser-acceptance.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
