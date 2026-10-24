// Targeted normal-Origin acceptance for Continuous 3D Worker and request lifecycle.
// Fails closed when the production Worker, exact WebGL frame or geometry is absent.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { installPinnedThreeRoute, waitForPaint } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/continuous-native-worker');
const report = { result: 'running', base, errors: [], stages: [] };
await mkdir(output, { recursive: true });
let browser;
let context;
try {
  browser = await chromium.launch({
    headless: false,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
    ],
  });
  report.chromium = browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installPinnedThreeRoute(context);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__continuousWorkerLongTasks = [];
    try {
      new window.PerformanceObserver((entries) => {
        for (const e of entries.getEntries()) {
          window.__continuousWorkerLongTasks.push({ startMs: e.startTime, durationMs: e.duration });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Keep the CPU phase timers even when Long Tasks API is unavailable.
    }
  });
  page.on('pageerror', (error) => report.errors.push(error.stack || error.message));
  const response = await page.goto(
    `${base}/app.html?start=example&example=suspended-silica-microdisk`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  assert.equal(response?.status(), 200, 'Production app must load from a normal Origin');
  assert.notEqual(new URL(page.url()).origin, 'null');
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  await selectScientificView(page, 'three', 1440);
  const waitForExact = () =>
    page.waitForFunction(
      () => {
        const h = document.getElementById('threeHost');
        return (
          h?.dataset.renderState === 'ready' &&
          h.dataset.renderFidelity === 'exact-continuous-etch' &&
          h.dataset.continuousEtchMeshBackend === 'worker' &&
          Number(h.dataset.rendererFrameSerial) > 0
        );
      },
      null,
      { timeout: 180000 },
    );
  await waitForExact();
  await waitForPaint(page);
  const read = () =>
    page.evaluate(() => {
      const h = document.getElementById('threeHost');
      return {
        kernel: window.WaferCadV2Workstation.snapshot().model.kernel,
        ready: h.dataset.renderState,
        phase: h.dataset.renderPhase,
        fidelity: h.dataset.renderFidelity,
        backend: h.dataset.continuousEtchMeshBackend,
        triangles: Number(h.dataset.continuousEtchTriangles),
        croppedTriangles: Number(h.dataset.continuousEtchRoiMeshTriangles),
        caps: Number(h.dataset.continuousEtchRoiCapTriangles),
        meshMs: Number(h.dataset.continuousEtchMeshBuildMs),
        mainThreadMs: Number(h.dataset.continuousEtchMainThreadBuildMs),
        exactFrameMs: Number(h.dataset.rendererExactFirstFrameMs),
        superseded: Number(h.dataset.rendererSupersededBuilds || 0),
        frameSerial: Number(h.dataset.rendererFrameSerial),
        canvasWidth: h.querySelector('canvas')?.width,
        canvasHeight: h.querySelector('canvas')?.height,
        longTasks: window.__continuousWorkerLongTasks || [],
      };
    });
  const initial = await read();
  assert.equal(initial.kernel, 'vector-continuous-etch-v1');
  assert.equal(initial.backend, 'worker', 'Synchronous fallback cannot satisfy this gate');
  assert.ok(initial.triangles > 300000, 'M08 material surface has missing triangles');
  assert.ok(initial.canvasWidth > 100 && initial.canvasHeight > 100);
  assert.ok(initial.mainThreadMs < 2500, 'Worker path has a multi-second main-thread build');
  report.stages.push({ action: 'initial-exact-WebGL-frame', ...initial });
  await page.locator('#threePanel').screenshot({ path: resolve(output, 'm08-three.png') });

  // Use the actual Main ROI drawing controls, not direct renderer state mutation.
  await selectScientificView(page, 'main', 1440);
  await page.locator('[data-action="roi"]').click();
  await page.locator('[data-action="roi-tool:rect"]').click();
  const rect = await page.locator('#mainCanvas').boundingBox();
  assert.ok(rect && rect.width > 100 && rect.height > 100);
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6, { steps: 6 });
  await page.mouse.up();
  assert.ok((await page.evaluate(() => window.WaferCadV2Workstation.snapshot().roi)) != null);
  await selectScientificView(page, 'three', 1440);
  await waitForExact();
  const cropped = await read();
  assert.equal(cropped.ready, 'ready');
  assert.ok(cropped.croppedTriangles > 0 && cropped.croppedTriangles < initial.triangles);
  assert.ok(cropped.caps > 0, 'Actual physical ROI cut is missing');
  report.stages.push({ action: 'actual-Main-ROI-to-3D', ...cropped });
  await page.locator('#threePanel').screenshot({ path: resolve(output, 'm08-roi-three.png') });

  // The published History replay must be transaction-driven. M07 exits the
  // Continuous owner and M08/M09 restore it through the real Workstation.
  await page.locator('[data-action="domain:history"]').click();
  const step = (number) =>
    page.locator(
      `#snapshotList .history-step-wrap[data-step-id="process-microdisk-${number}"] .history-step-row`,
    );
  await step('07').click();
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().model.kernel === 'vector-2.5d-v1',
    null,
    { timeout: 120000 },
  );
  await step('08').click();
  await step('09').click();
  await waitForExact();
  const restored = await read();
  assert.equal(restored.backend, 'worker');
  assert.equal(restored.ready, 'ready');
  assert.ok(restored.triangles > 300000);
  report.stages.push({ action: 'real-History-M07-M08-M09', ...restored });
  assert.deepEqual(report.errors, [], 'Native browser emitted a page error');
  report.result = 'pass';
  console.log(
    'CONTINUOUS_NATIVE_WORKER_PASS',
    JSON.stringify({
      backend: restored.backend,
      triangles: restored.triangles,
      mainThreadMs: initial.mainThreadMs,
      exactFrameMs: initial.exactFrameMs,
      roiTriangles: cropped.croppedTriangles,
    }),
  );
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack || String(error);
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close();
  await browser?.close();
}
