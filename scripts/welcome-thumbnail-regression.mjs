import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import { gotoWelcome, installPinnedThreeRoute, observePageErrors } from './test-helpers/ui.mjs';
const output = process.argv[2] || 'test-results/welcome-thumbnails.json';
const repeat = Number(process.argv[3] || 3);
const interaction = process.argv.includes('--check-interaction');
const headless = process.argv.includes('--headless');
const browser = await chromium.launch({
  headless,
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
await mkdir('test-results/product-review', { recursive: true });
const runs = [];
try {
  for (let index = 0; index < repeat; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await installPinnedThreeRoute(context);
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
              });
          });
        }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = observePageErrors(page),
      requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    const started = performance.now();
    await gotoWelcome(page);
    const shellMs = performance.now() - started;
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.welcome-example-project-fallback')]
          .filter((img) => {
            const r = img.getBoundingClientRect();
            return r.top < innerHeight && r.bottom > 0;
          })
          .every((img) => img.complete && img.naturalWidth === 640),
      null,
      { timeout: 10000 },
    );
    const firstVisibleMs = performance.now() - started;
    for (const example of BUNDLED_EXAMPLES) {
      const card = page.locator(`.welcome-example-card[data-example-id="${example.id}"]`);
      await card.scrollIntoViewIfNeeded();
      await card.locator('img').evaluate((img) => img.decode());
      assert.equal(await card.locator('iframe').getAttribute('src'), null);
      assert.equal(
        await card.locator('[data-preview-view="three"]').getAttribute('aria-selected'),
        'true',
      );
    }
    const allThumbnailsMs = performance.now() - started;
    assert.equal(
      requests.filter((path) => path.endsWith('.wafercad') || path === '/app.html').length,
      0,
    );
    for (const module of [
      '/project-io.js',
      '/project-schema.js',
      '/layout-io.js',
      '/gds.js',
      '/oasis.js',
    ])
      assert.ok(!requests.includes(module), module + ' must load only after import/interaction');
    const coldRequests = [...requests];
    if (index === 0) {
      await page.locator('.welcome-example-card').first().scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'test-results/product-review/welcome-thumbnails-desktop.png',
        fullPage: true,
      });
    }
    if (interaction) {
      for (const id of ['fully-textured-perovskite-silicon-tandem', 'three-tier-silicon-jlfets']) {
        const card = page.locator(`.welcome-example-card[data-example-id="${id}"]`);
        await card.locator('.welcome-example-preview-start').scrollIntoViewIfNeeded();
        await card.locator('.welcome-example-preview-start').focus();
        await page.keyboard.press('Enter');
        await card.locator('.welcome-example-project-preview.ready').waitFor({ timeout: 120000 });
        const frame = await (await card.locator('iframe').elementHandle()).contentFrame();
        assert.deepEqual(await frame.evaluate(() => window.__previewImports), [
          { steps: 1, bookmarks: 0 },
        ]);
        await frame.waitForFunction(
          () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
          null,
          { timeout: 120000 },
        );
        for (const view of ['mask', 'section', 'main', 'three']) {
          await card.locator(`[data-preview-view="${view}"]`).click();
          await frame.waitForFunction(
            (view) => document.documentElement.dataset.previewView === view,
            view,
            { timeout: 30000 },
          );
        }
        assert.equal(
          requests.filter((path) => path === `/examples/previews/${id}.wafercad`).length,
          1,
        );
      }
      const idle = page.locator(
        '.welcome-example-card[data-example-id="photodetector-literature"]',
      );
      assert.equal(await idle.locator('iframe').getAttribute('src'), null);
      await idle.locator('[data-preview-view="mask"]').click();
      await idle.locator('.welcome-example-project-preview.ready').waitFor({ timeout: 60000 });
      const frame = await (await idle.locator('iframe').elementHandle()).contentFrame();
      await frame.waitForFunction(
        () => document.documentElement.dataset.previewView === 'mask',
        null,
        { timeout: 30000 },
      );
      for (const id of ['perc-point-contact-solar-cell', 'suspended-silica-microdisk'])
        assert.equal(
          await page
            .locator(`.welcome-example-card[data-example-id="${id}"] iframe`)
            .getAttribute('src'),
          null,
        );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(new URL(page.url()).origin);
      await gotoWelcome(page);
      await page
        .locator('.welcome-example-card')
        .first()
        .locator('img')
        .evaluate((img) => img.decode());
      await page.screenshot({
        path: 'test-results/product-review/welcome-thumbnails-mobile.png',
        fullPage: true,
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const native = page.locator(
        '.welcome-example-card[data-example-id="three-tier-silicon-jlfets"]',
      );
      const unavailable = '**/examples/previews/three-tier-silicon-jlfets.wafercad';
      await context.route(unavailable, (route) =>
        route.fulfill({ status: 503, body: 'Unavailable' }),
      );
      await native.locator('.welcome-example-preview-start').click();
      await native.locator('.welcome-example-project-preview.error').waitFor({ timeout: 30000 });
      assert.equal(
        await native.locator('img').evaluate((img) => getComputedStyle(img).opacity),
        '1',
      );
      assert.equal(
        await native.locator('.welcome-example-preview-start').textContent(),
        'Retry preview',
      );
      await context.unroute(unavailable);
      await native.locator('.welcome-example-preview-start').click();
      await native.locator('.welcome-example-project-preview.ready').waitFor({ timeout: 120000 });
      await native.locator('.welcome-example-open').click();
      await page.waitForFunction(
        () =>
          document.getElementById('statusText')?.textContent ===
          'Opened three-tier-silicon-jlfets.wafercad.',
        null,
        { timeout: 120000 },
      );
      assert.deepEqual(await page.evaluate(() => window.__previewImports), [
        { steps: 40, bookmarks: 5 },
      ]);
      assert.ok(requests.includes('/examples/three-tier-silicon-jlfets.wafercad'));
    }
    assert.deepEqual(errors, []);
    runs.push({ shellMs, firstVisibleMs, allThumbnailsMs, coldRequests, interaction, errors });
    await context.close();
  }
  const median = (key) =>
    runs.map((run) => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const report = {
    browserVersion: browser.version(),
    headless,
    runs,
    medianShellMs: median('shellMs'),
    medianFirstVisibleMs: median('firstVisibleMs'),
    medianAllThumbnailsMs: median('allThumbnailsMs'),
  };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
