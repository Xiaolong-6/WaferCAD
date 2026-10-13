// Real cancellable GLB export on the full M3D model, separate from small-example gestures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-three-export-abort');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  example: 'm3d',
  result: 'running',
  errors: [],
};
const browser = await launchBrowser();
try {
  report.browser = browser.version();
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1024, height: 768 },
    acceptDownloads: true,
  });
  try {
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(`${base}/app.html?start=example&example=m3d`);
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    assert.equal(initial.sharedIdentity, true);
    assert.equal(initial.model.layers.length, 27);
    assert.equal(initial.model.regions.length, 551);
    await page.locator('[data-action="view:three"]').click();
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 120000 },
    );
    const before = await snapshot();
    const downloads = [];
    const onDownload = (d) => downloads.push(d.suggestedFilename());
    page.on('download', onDownload);
    await page.locator('[data-action="three-export-menu"]').click();
    await page.locator('[data-action="export:three:glb"]').click();
    await page.locator('#processTaskDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-action="three-export-menu"]').isDisabled(), true);
    report.stageAtAbort = await page.locator('#processTaskStage').textContent();
    await page.locator('#processTaskAbortBtn').click();
    await page.locator('#processTaskDialog').waitFor({ state: 'hidden', timeout: 120000 });
    assert.deepEqual(downloads, []);
    page.off('download', onDownload);
    assert.match(await page.locator('[data-slot="status.message"]').textContent(), /cancelled/);
    assert.equal(await page.locator('[data-action="three-export-menu"]').isDisabled(), false);
    const after = await snapshot();
    assert.deepEqual(after.roi, before.roi);
    assert.deepEqual(after.maskRoi, initial.maskRoi);
    assert.deepEqual(after.model, initial.model);
    const cameraMaximumError = Math.max(
      ...after.threeCamera.position.map((value, i) =>
        Math.abs(value - before.threeCamera.position[i]),
      ),
      ...after.threeCamera.target.map((value, i) => Math.abs(value - before.threeCamera.target[i])),
      Math.abs(after.threeCamera.fov - before.threeCamera.fov),
    );
    assert.ok(cameraMaximumError <= 1e-9, 'Abort must preserve the camera within numerical error');
    report.cameraMaximumError = cameraMaximumError;
    assert.deepEqual(report.errors, []);
    await page.screenshot({ path: resolve(output, 'cancelled.png'), fullPage: true });
    report.result = 'pass';
    report.abort = true;
    report.noDownload = true;
    report.scientificUnchanged = true;
    console.log('3D full M3D GLB Abort: PASS');
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
