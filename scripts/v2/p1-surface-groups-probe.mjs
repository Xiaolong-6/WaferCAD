// Scientific feasibility only: compare real M3D front/back surface groups
// computed on the main thread and in an isolated classic Web Worker.
// Does NOT change production startup, Canvas 2D renderer, or acceptance limits.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = 'test-results/p1-startup-cpu/surface-groups-feasibility.json';
await mkdir('test-results/p1-startup-cpu', { recursive: true });
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  try {
    await page.goto(base + '/app.html?start=example&example=m3d', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const report = await page.evaluate(async () => {
      if (typeof Worker !== 'function') {
        return { supported: false, reason: 'Worker unavailable' };
      }
      const { surfaceGroups } = await import('./model-view-geometry.js');
      const model = window.WaferCadV2Workstation.snapshot().model;
      const before = JSON.stringify(model);
      const faces = [];
      for (const face of ['front', 'back']) {
        const mainStart = performance.now();
        const baseline = surfaceGroups(model, face);
        const baselineMs = Math.round(performance.now() - mainStart);
        const worker = new Worker('./p1-surface-groups-worker.js');
        const start = performance.now();
        let answer;
        try {
          answer = await new Promise((resolve) => {
            let complete = false;
            const timer = setTimeout(() => finish({ ok: false, error: 'Worker timeout' }), 30000);
            function finish(value) {
              if (complete) return;
              complete = true;
              clearTimeout(timer);
              resolve(value);
            }
            worker.onmessage = (event) => finish(event.data);
            worker.onerror = (event) => finish({ ok: false, error: event.message });
            worker.onmessageerror = () => finish({ ok: false, error: 'Message decode failed' });
            try {
              worker.postMessage({ id: 1, action: 'surface-groups', model, face });
            } catch (error) {
              finish({ ok: false, error: String(error) });
            }
          });
        } finally {
          worker.terminate();
        }
        const workerWallMs = Math.round(performance.now() - start);
        const exact = Boolean(
          answer?.ok &&
            answer.face === face &&
            JSON.stringify(answer.groups) === JSON.stringify(baseline),
        );
        faces.push({
          face,
          exact,
          baselineMs,
          workerWallMs,
          workerComputeMs: answer?.computeMs ?? null,
          groups: baseline.length,
          error: answer?.error || null,
        });
      }
      return {
        supported: faces.every((face) => face.exact),
        reason: faces.every((face) => face.exact) ? null : 'Science groups differ or Worker failed',
        modelUnchanged: JSON.stringify(model) === before,
        layerCount: model.layers?.length || 0,
        regionCount: model.regions?.length || 0,
        faces,
      };
    });
    const result = {
      probe: 'p1-real-m3d-worker-surface-groups-v1',
      headlessChromium: browser.version(),
      source: 'real M3D model, exact front/back scientific unions; no production activation',
      ...report,
    };
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log('P1_SURFACE_GROUPS_WORKER', JSON.stringify(result));
    // Unsupported environments may be diagnosed, but scientific divergence
    // on a successfully executed comparison must never be accepted.
    if (result.faces?.length) {
      assert.equal(result.modelUnchanged, true, 'Worker probe cannot mutate canonical model');
      assert.ok(
        result.faces.every((face) => face.exact),
        'Worker and main must compute byte-identical Front/Back surface groups',
      );
    }
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
