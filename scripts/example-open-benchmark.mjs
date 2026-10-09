// Browser measurement of complete Welcome -> editable project readiness.
// Run with a local static server and pinned Three, e.g.:
// node scripts/example-open-benchmark.mjs three-tier-silicon-jlfets 3 --headless
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import { gotoWelcome, waitForStatus } from './test-helpers/ui.mjs';

const id = process.argv[2] || 'three-tier-silicon-jlfets';
const repeat = Number(process.argv[3] || 3);
const headless = process.argv.includes('--headless');
const example = BUNDLED_EXAMPLES.find((item) => item.id === id);
assert.ok(example, 'Unknown bundled example: ' + id);
assert.ok(Number.isInteger(repeat) && repeat > 0 && repeat <= 20, 'Repeat must be 1–20');

const raw = JSON.parse(
  await readFile(new URL('../site/' + example.path.replace(/^\.\//, ''), import.meta.url), 'utf8'),
);
const expectedRevision = raw.model.revision;
const expectedSteps = raw.snapshotBranches?.nodes?.length || 0;
const browser = await chromium.launch({
  headless,
  executablePath: process.env.WAFERCAD_CHROMIUM || undefined,
  args: ['--enable-unsafe-swiftshader'],
});
const rows = [];
try {
  for (const warmed of [false, true]) {
    for (let i = 0; i < repeat; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      // Playwright context.route() disables Chromium's HTTP cache. The pinned
      // Three.js route must stay OFF in this cache-specific benchmark.
      await context.addInitScript(() => {
        const NativeWorker = globalThis.Worker;
        globalThis.__exampleWorker = { started: null, done: null, steps: null };
        globalThis.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            if (!String(url).includes('project-worker.js')) return;
            const post = this.postMessage.bind(this);
            this.postMessage = (...args) => {
              globalThis.__exampleWorker.started = performance.now();
              return post(...args);
            };
            this.addEventListener('message', ({ data }) => {
              if (data?.type !== 'done') return;
              globalThis.__exampleWorker.done = performance.now();
              globalThis.__exampleWorker.steps = data.project?.snapshotBranches?.nodes?.length;
            });
          }
        };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(180000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await gotoWelcome(page);
      const link = page.locator(
        `.welcome-example-card[data-example-id="${id}"] .welcome-example-title-link`,
      );
      if (warmed) {
        const assetPath = new URL(example.path, page.url()).pathname;
        const prefetch = page.waitForResponse(
          (response) => new URL(response.url()).pathname === assetPath,
          { timeout: 60000 },
        );
        // Focus triggers intent prefetch without navigating or starting 3D.
        await link.focus();
        const response = await prefetch;
        assert.equal(response.ok(), true);
        await response.finished();
        // Let the prefetch consumer finish reading into the browser HTTP cache.
        await page.waitForTimeout(150);
      }
      const started = performance.now();
      // Direct activation avoids accidentally triggering a cold-case hover prefetch.
      await link.evaluate((element) => element.click());
      await waitForStatus(page, /^Opened /, 180000);
      const openedMs = performance.now() - started;
      await page.waitForFunction(
        (revision) => {
          const host = document.getElementById('threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            Number(host.dataset.modelRevision) === revision
          );
        },
        expectedRevision,
        { timeout: 180000 },
      );
      const readyMs = performance.now() - started;
      const timing = await page.evaluate(() => ({
        worker: globalThis.__exampleWorker,
        resource: performance
          .getEntriesByType('resource')
          .filter((entry) => entry.name.includes('.wafercad'))
          .map((entry) => ({
            name: entry.name,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            duration: entry.duration,
          })),
      }));
      assert.equal(timing.worker.steps, expectedSteps);
      assert.deepEqual(errors, []);
      const projectAsset = timing.resource.find((entry) =>
        new URL(entry.name).pathname.endsWith('.wafercad'),
      );
      assert.ok(projectAsset, 'complete example must be fetched by the editor');
      if (warmed) {
        // A successful focus prefetch must actually supply the editor's bytes
        // from the HTTP cache. Frame timings alone are too noisy to prove that.
        assert.ok(
          projectAsset.encodedBodySize > 0 &&
            projectAsset.transferSize < projectAsset.encodedBodySize / 2,
          'prefetched example must reuse cached payload instead of re-downloading it',
        );
      }
      rows.push({
        id,
        warmed,
        run: i + 1,
        openedMs,
        readyMs,
        workerMs: timing.worker.done - timing.worker.started,
        resource: timing.resource,
      });
      console.log('EXAMPLE_OPEN_RUN', JSON.stringify(rows.at(-1)));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = Object.fromEntries(
  [false, true].map((warmed) => {
    const sample = rows.filter((row) => row.warmed === warmed);
    return [
      warmed ? 'prefetched' : 'cold',
      {
        openedMedianMs: median(sample.map((row) => row.openedMs)),
        readyMedianMs: median(sample.map((row) => row.readyMs)),
        workerMedianMs: median(sample.map((row) => row.workerMs)),
      },
    ];
  }),
);
const report = { example: id, browser: browser.version(), repeat, summary, rows };
await mkdir('test-results/example-open', { recursive: true });
const output = `test-results/example-open/${id}.json`;
await writeFile(output, JSON.stringify(report, null, 2));
console.log('EXAMPLE_OPEN_MEDIAN', JSON.stringify({ output, ...summary }));
