// Time actual saved-project Open and completed native WebGL in fresh Chromium processes.
// Each sample uses a new browser process and context; the runner OS cache is not reset.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';

const dir = resolve('test-results/tcmos');
const projects = [
  { id: 'tcmos-1x1', path: resolve(dir, 'tcmos-ternary-inverter-130nm.wafercad') },
  { id: 'tcmos-native-4x4', path: resolve(dir, 'tcmos-inverter-4x4-RECIPE-EXPERIMENT.wafercad') },
  {
    id: 'tcmos-routed-4x4',
    path: resolve(dir, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-PROTOTYPE.wafercad'),
  },
  {
    id: 'microdisk-72-band',
    path: resolve('site/examples/suspended-silica-microdisks-adaptive.wafercad'),
  },
];
const report = {
  sourceSha: process.env.GITHUB_SHA || 'local-unidentified',
  benchmark: 'new-browser-process-per-sample, warm-OS-cache-possible',
  samplesPerProject: 2,
  samples: [],
};
await mkdir(dir, { recursive: true });
let failures = 0;
for (const project of projects) {
  const bytes = await readFile(project.path);
  const projectName = JSON.parse(bytes.toString('utf8')).name;
  assert.ok(projectName, `${project.id}: missing saved-project name`);
  const inputSha256 = createHash('sha256').update(bytes).digest('hex');
  for (let repeat = 1; repeat <= report.samplesPerProject; repeat += 1) {
    const result = {
      id: project.id,
      repeat,
      bytes: bytes.length,
      inputSha256,
      projectName,
      status: 'running',
    };
    let browser;
    let context;
    try {
      const launchStart = performance.now();
      browser = await launchBrowser();
      const opened = await newUiPage(browser, { viewport: { width: 1440, height: 950 } });
      context = opened.context;
      const page = opened.page;
      result.browserContextMs = +(performance.now() - launchStart).toFixed(1);
      const navigationStart = performance.now();
      await page.goto(
        (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') + '/app.html?start=empty',
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      result.workstationReadyMs = +(performance.now() - navigationStart).toFixed(1);
      await page.locator('.p-nav [data-action="domain:project"]').click();
      const openStart = performance.now();
      await page.locator('#openProjectInput').setInputFiles(project.path);
      const confirm = page.getByRole('button', { name: 'Open project', exact: true });
      if (await confirm.isVisible()) await confirm.click();
      await page.waitForFunction(
        (name) => {
          const snapshot = window.WaferCadV2Workstation?.snapshot();
          return snapshot?.projectName === name && snapshot.model?.layers?.length > 0;
        },
        projectName,
        { timeout: 180000, polling: 250 },
      );
      result.projectReadyMs = +(performance.now() - openStart).toFixed(1);
      const threeStart = performance.now();
      const dock = page.locator('[data-action="dock:view:three"]:visible').first();
      if (await dock.count()) {
        if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
      } else {
        await page.locator('[data-action="view:three"]:visible').first().click();
      }
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            host.dataset.renderPhase === 'complete' &&
            !host.dataset.rendererBuildFailure &&
            Number(host.dataset.sceneVisibleObjectCount) > 0
          );
        },
        null,
        { timeout: 180000 },
      );
      await waitForPaint(page);
      result.threeReadyMs = +(performance.now() - threeStart).toFixed(1);
      result.navigationToThreeMs = +(performance.now() - navigationStart).toFixed(1);
      result.threeScene = await page.locator('#threeHost').evaluate((host) => ({
        visibleObjects: Number(host.dataset.sceneVisibleObjectCount),
        geometries: Number(host.dataset.sceneGeometryCount),
        topologyMs: Number(host.dataset.rendererTopologyMs) || null,
        smoothCapsMs: Number(host.dataset.rendererSmoothCapsMs) || null,
        sidewallsMs: Number(host.dataset.rendererSidewallsMs) || null,
      }));
      assert.ok(result.threeScene.visibleObjects > 0, '3D scene has no visible objects');
      if (repeat === 1) {
        await page.locator('#threePanel').screenshot({
          path: resolve(dir, `perf-${project.id}-three.png`),
        });
      }
      result.status = 'pass';
      console.log('WAFERCAD_WORKSTATION_COLD_OPEN ' + JSON.stringify(result));
    } catch (error) {
      failures += 1;
      result.status = 'fail';
      result.error = error.stack || String(error);
      console.error('WAFERCAD_WORKSTATION_COLD_OPEN_FAILED ' + JSON.stringify(result));
    } finally {
      report.samples.push(result);
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      await writeFile(resolve(dir, 'cold-open-timing.json'), JSON.stringify(report, null, 2));
    }
  }
}
assert.equal(failures, 0, `${failures} saved-project Chromium cold-open timing samples failed`);
