import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  baseUrl,
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
} from './test-helpers/ui.mjs';

// Fresh contexts, real Welcome click and worker, complete unchanged source.
// No profiler or export workload runs inside the measured loading interval.
const output = process.argv[2] || 'test-results/metalens/loading.json';
const repeat = Number(process.argv[3] || 3);
assert.ok(Number.isInteger(repeat) && repeat > 0);
const source = await readFile('site/examples/tio2-metalens-full-array.wafercad');
const browser = await launchBrowser();
const runs = [];
try {
  for (let index = 0; index < repeat; index++) {
    const context = await newUiContext(browser, { viewport: { width: 1400, height: 900 } });
    try {
      if (process.env.WAFERCAD_BASELINE_SNAPSHOTS_DIR) {
        for (const path of ['workspace-snapshots.js', 'controllers/project-state-controller.js']) {
          const body = await readFile(resolve(process.env.WAFERCAD_BASELINE_SNAPSHOTS_DIR, path));
          await context.route(
            (url) => url.pathname.endsWith(`/${path}`),
            (route) => route.fulfill({ contentType: 'text/javascript', body }),
          );
        }
      }
      const page = await context.newPage();
      const errors = observePageErrors(page);
      await page.addInitScript(() => {
        window.__metalensImport = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            if (!String(url).includes('project-worker.js')) return;
            const run = {};
            window.__metalensImport.push(run);
            this.addEventListener('message', ({ data }) => {
              if (data.type === 'done') {
                run.done = performance.now();
                run.revision = data.project.model.revision;
                run.steps = data.project.snapshotBranches.nodes.length;
                run.bookmarks = data.project.snapshots.length;
              }
            });
            const post = this.postMessage.bind(this);
            this.postMessage = (...args) => {
              run.started = performance.now();
              return post(...args);
            };
          }
        };
      });
      await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      const link = page.locator(
        '.welcome-example-card[data-example-id="tio2-metalens-four-unit"] .welcome-example-title-link',
      );
      await link.waitFor({ state: 'visible' });
      const started = performance.now();
      await link.click();
      await waitForAppReady(page);
      await page.waitForFunction(
        () =>
          /Opened .*\.wafercad\./.test(document.getElementById('statusText')?.textContent || ''),
        null,
        { timeout: 180000 },
      );
      const openedMs = Math.round(performance.now() - started);
      await page.waitForFunction(
        () => {
          const host = document.getElementById('threeHost');
          const imported = window.__metalensImport[0];
          return (
            host?.dataset.renderState === 'ready' &&
            Number(host.dataset.modelRevision) === imported?.revision
          );
        },
        null,
        { timeout: 180000 },
      );
      const readyMs = Math.round(performance.now() - started);
      const [worker] = await page.evaluate(() => window.__metalensImport);
      assert.equal(worker.steps, 10);
      assert.equal(worker.bookmarks, 6);
      assert.deepEqual(errors, []);
      const run = { openedMs, readyMs, workerMs: Math.round(worker.done - worker.started), errors };
      runs.push(run);
      console.log('METALENS_LOADING_RUN', index + 1, JSON.stringify(run));
    } finally {
      await context.close();
    }
  }
  const median = (key) =>
    runs.map((run) => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const report = {
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    bytes: source.length,
    browserVersion: browser.version(),
    nodeVersion: process.version,
    platform: process.platform,
    viewport: { width: 1400, height: 900 },
    runs,
    medianOpenedMs: median('openedMs'),
    medianReadyMs: median('readyMs'),
    medianWorkerMs: median('workerMs'),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('METALENS_LOADING_MEDIAN', JSON.stringify(report));
} finally {
  await browser.close();
}
