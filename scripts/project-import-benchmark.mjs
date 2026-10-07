import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  chooseConfirmation,
  installPinnedThreeRoute,
  waitForAppReady,
  waitForStatus,
} from './test-helpers/ui.mjs';
const file = resolve(process.argv[2]);
const output = process.argv[3] || 'test-results/project-io/import-benchmark.json';
const repeat = Number(process.argv[4] || 3);
const raw = JSON.parse(await readFile(file, 'utf8'));
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
const runs = [];
try {
  for (let index = 0; index < repeat; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await installPinnedThreeRoute(context);
    if (process.env.WAFERCAD_BASELINE_VIEW) {
      const body = await readFile(process.env.WAFERCAD_BASELINE_VIEW);
      await context.route('**/model-view-geometry.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body }),
      );
    }
    if (process.env.WAFERCAD_BASELINE_IMPORT_DIR) {
      for (const path of [
        'app.js',
        'controllers/project-state-controller.js',
        'workspace-persistence.js',
      ]) {
        const body = await readFile(resolve(process.env.WAFERCAD_BASELINE_IMPORT_DIR, path));
        await context.route(
          (url) => url.pathname.endsWith(`/${path}`),
          (route) => route.fulfill({ contentType: 'text/javascript', body }),
        );
      }
    }
    const page = await context.newPage();
    page.setDefaultTimeout(900000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__projectImportBenchmark = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (String(url).includes('project-worker.js')) {
            const run = {};
            window.__projectImportBenchmark.push(run);
            this.addEventListener('message', ({ data }) => {
              if (data.type === 'done') {
                run.done = performance.now();
                run.steps = data.project?.snapshotBranches?.nodes?.length;
                run.bookmarks = data.project?.snapshots?.length;
              } else if (data.type === 'progress') run[data.stage] = performance.now();
            });
            const post = this.postMessage.bind(this);
            this.postMessage = (...args) => {
              run.started = performance.now();
              return post(...args);
            };
          }
        }
      };
    });
    await page.goto((process.env.WAFERCAD_URL || 'http://127.0.0.1:4174') + '/app.html', {
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);

    const started = performance.now();
    await page.locator('#openProjectInput').setInputFiles(file);
    await chooseConfirmation(page);
    await waitForStatus(page, /^Opened /, 900000);
    const openedMs = performance.now() - started;
    await page.waitForFunction(
      (expected) => {
        const host = document.getElementById('threeHost');
        return (
          host.dataset.renderState === 'ready' && Number(host.dataset.modelRevision) === expected
        );
      },
      raw.model.revision,
      { timeout: 900000 },
    );
    const readyMs = performance.now() - started;
    const [worker] = await page.evaluate(() => window.__projectImportBenchmark);
    assert.ok(worker, 'The import must use the real project worker.');
    assert.equal(worker.steps, raw.snapshotBranches?.nodes?.length);
    assert.equal(worker.bookmarks, raw.snapshots?.length);
    assert.deepEqual(errors, []);
    const run = { openedMs, readyMs, workerMs: worker.done - worker.started, worker, errors };
    runs.push(run);
    console.log('IMPORT_RUN', index + 1, JSON.stringify(run));
    await context.close();
  }
  const median = (key) =>
    runs.map((run) => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const report = {
    file,
    bytes: (await readFile(file)).length,
    browserVersion: browser.version(),
    runs,
    medianOpenedMs: median('openedMs'),
    medianReadyMs: median('readyMs'),
    medianWorkerMs: median('workerMs'),
  };
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log('IMPORT_MEDIAN', JSON.stringify(report));
} finally {
  await browser.close();
}
