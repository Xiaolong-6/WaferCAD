import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import {
  baseUrl,
  gotoWelcome,
  installPinnedThreeRoute,
  observePageErrors,
} from './test-helpers/ui.mjs';
const output = process.argv[2] || 'test-results/welcome-preview-benchmark.json';
const repeat = Number(process.argv[3] || 3);
const originals = process.argv.includes('--full-originals');
const checkViews = process.argv.includes('--check-views');
const browser = await chromium.launch({
  headless: process.argv.includes('--headless'),
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
const runs = [];
try {
  for (let index = 0; index < repeat; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await installPinnedThreeRoute(context);
    if (originals)
      await context.route('**/bundled-examples.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export const BUNDLED_EXAMPLES = ${JSON.stringify(BUNDLED_EXAMPLES.map(({ previewProject, ...example }) => example))}; export function bundledExampleById(id) { return BUNDLED_EXAMPLES.find(example => example.id === id) || null; }`,
        }),
      );
    if (process.env.WAFERCAD_BASELINE_VIEW) {
      const body = await readFile(process.env.WAFERCAD_BASELINE_VIEW);
      await context.route('**/model-view-geometry.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body }),
      );
    }
    await context.addInitScript(() => {
      window.__previewImports = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (!String(url).includes('project-worker.js')) return;
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'done' && data.project)
              window.__previewImports.push({
                steps: data.project.snapshotBranches.nodes.length,
                bookmarks: data.project.snapshots.length,
                revision: data.project.model.revision,
              });
          });
        }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = observePageErrors(page),
      requests = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('.wafercad')) requests.push(pathname);
    });
    const started = performance.now();
    await gotoWelcome(page);
    const shellMs = performance.now() - started,
      cards = [],
      frames = [];
    for (const example of BUNDLED_EXAMPLES) {
      const card = page.locator(`.welcome-example-card[data-example-id="${example.id}"]`);
      await card.scrollIntoViewIfNeeded();
      if (example.preview?.path) await card.locator('[data-preview-view="main"]').click();
      const frameElement = await card.locator('iframe').elementHandle();
      const activated = performance.now();
      await card.locator('.welcome-example-project-preview.ready').waitFor({ timeout: 180000 });
      const frame = await frameElement.contentFrame();
      const imports = await frame.evaluate(() => window.__previewImports);
      assert.equal(imports.length, 1);
      assert.equal(
        imports[0].steps,
        originals
          ? JSON.parse(
              await readFile(
                new URL('../site/' + example.path.replace(/^\.\//, ''), import.meta.url),
              ),
            ).snapshotBranches.nodes.length
          : 1,
      );
      if (!originals) assert.equal(imports[0].bookmarks, 0);
      cards.push({
        id: example.id,
        mainReadyMs: performance.now() - activated,
        fromNavigationMs: performance.now() - started,
        ...imports[0],
      });
      frames.push({ example, card, frame });
    }
    const allReadyMs = performance.now() - started;
    if (checkViews && !originals) {
      for (const { example, card, frame } of frames) {
        await card.locator('iframe').scrollIntoViewIfNeeded();
        for (const view of ['mask', 'three', 'section', 'main']) {
          await writeFile(
            output + '.progress.json',
            JSON.stringify({
              id: example.id,
              view,
              state: await frame.evaluate(() => ({
                url: location.href,
                dataset: { ...document.documentElement.dataset },
                three: { ...document.getElementById('threeHost').dataset },
              })),
            }),
          );
          await card.locator(`[data-preview-view="${view}"]`).click();
          await frame.waitForFunction(
            (view) => document.documentElement.dataset.previewView === view,
            view,
            { timeout: 30000 },
          );
          if (view === 'three')
            await frame.waitForFunction(
              () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
              null,
              { timeout: 120000 },
            );
          if (
            index === 0 &&
            ['three', 'section'].includes(view) &&
            ['three-tier-silicon-jlfets', 'fully-textured-perovskite-silicon-tandem'].includes(
              example.id,
            )
          )
            await card.screenshot({
              path: `test-results/product-review/fast-${example.id}-${view}.png`,
            });
        }
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(requests.length, BUNDLED_EXAMPLES.length);
    for (const example of BUNDLED_EXAMPLES)
      assert.ok(
        requests.includes(
          '/' + (originals ? example.path : example.previewProject.path).replace(/^\.\//, ''),
        ),
      );
    const run = { shellMs, allReadyMs, cards, requests, errors };
    runs.push(run);
    console.log('WELCOME_RUN', index + 1, JSON.stringify(run));
    await context.close();
  }
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const report = {
    baseUrl,
    originals,
    checkViews,
    headless: process.argv.includes('--headless'),
    baselineView: process.env.WAFERCAD_BASELINE_VIEW || null,
    browserVersion: browser.version(),
    runs,
    medianShellMs: median(runs.map((run) => run.shellMs)),
    medianAllReadyMs: median(runs.map((run) => run.cards.at(-1).fromNavigationMs)),
    medianCardMs: BUNDLED_EXAMPLES.map((example, index) => ({
      id: example.id,
      mainReadyMs: median(runs.map((run) => run.cards[index].mainReadyMs)),
    })),
  };
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log('WELCOME_MEDIAN', JSON.stringify(report));
} finally {
  await browser.close();
}
