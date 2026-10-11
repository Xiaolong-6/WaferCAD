// M4 integrated-route smoke on three independently loaded real projects.
// The full Metalens editing/History/Recovery transaction is owned by check-sync.mjs.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
import { readProjectFile } from '../../site/project-io.js';
await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-m4-projects');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  cases: [],
};
const browser = await launchBrowser();
try {
  report.browser = browser.version();
  for (const example of ['m3d', 'photodetector', 'metalens']) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1024, height: 900 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/app-v2-workstation.html?example=${example}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      assert.match(page.url(), /\\/app-v2-workstation\\.html\\?example=/);
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const before = await snapshot();
      assert.equal(before.sharedIdentity, true);
      assert.ok(before.model.layers.length > 0);
      assert.ok(before.model.regions.length > 0);
      assert.equal(before.source.includes(example === 'm3d' ? 'm3d-selfpowered' : example), true);
      const legacyBoot = await page.evaluate(() =>
        performance.getEntriesByType('resource').some((entry) =>
          /\\/app\\.js(?:\\?|$)/.test(entry.name),
        ),
      );
      assert.equal(legacyBoot, false, 'UI v2 must not boot legacy app.js');
      for (const view of ['mask', 'main']) {
        await page.locator(`[data-action="view:${view}"]`).click();
        await waitForPaint(page);
      }
      await page.locator('[data-action="domain:process"]').click();
      await waitForPaint(page);
      assert.equal(await page.locator('#v2MaterialPreview').isDisabled(), true);
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#xyUnitSelect').selectOption('nm');
      await page.locator('#xyUnitSelect').selectOption('um');
      const unchanged = await snapshot();
      assert.deepEqual(unchanged.model, before.model, 'Navigation and unit changes do not alter geometry');
      assert.deepEqual(unchanged.roi, before.roi);
      assert.deepEqual(unchanged.section, before.section);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#exportProjectBtn').click();
      const download = await downloadPromise;
      const path = resolve(output, `${example}.wafercad`);
      await download.saveAs(path);
      const exported = await readProjectFile(new Blob([await readFile(path)]));
      assert.deepEqual(exported.model, unchanged.model, 'Exported real project preserves exact geometry');
      assert.deepEqual(errors, [], 'No page errors');
      await page.screenshot({ path: resolve(output, `${example}.png`) });
      report.cases.push({ example, result: 'pass', layers: before.model.layers.length, regions: before.model.regions.length });
      console.log(`M4 ${example}: integrated route, isolation, units and Project export PASS`);
    } catch (error) {
      report.cases.push({ example, result: 'fail', error: error.stack || error.message, errors });
      await page.screenshot({ path: resolve(output, `${example}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
