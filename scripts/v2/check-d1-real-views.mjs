// M3 D1 experimental real-view gate (not M2 mock / not approved visual baseline).
// Run with WAFERCAD_THREE_DIR pointing to pinned node_modules/three.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const site = resolve(repo, 'site');
const output = resolve(repo, 'test-results/ui-v2-d1-real');
const contentTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gds': 'application/octet-stream',
};
const server = createServer(async (req, res) => {
  try {
    const target = resolve(site, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
    if (!target.startsWith(`${site}${sep}`)) return res.writeHead(403).end();
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

const evidence = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  route: 'app-v2-real.html',
  acceptance: 'experimental real-view wiring; screenshot review and M1.5 comparison separate',
  errors: [],
  widths: [],
  result: 'running',
};
let browser;
await mkdir(output, { recursive: true });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
try {
  browser = await launchBrowser();
  evidence.browser = browser.version();
  const { context, page } = await newUiPage(browser);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    page.on('pageerror', (error) => evidence.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.errors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/app-v2-real.html`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' ||
      document.body.dataset.ready === 'error', null, { timeout: 120000 });
    assert.equal(await page.locator('body').getAttribute('data-ready'), 'true',
      'Real app must boot, not display an error or a placeholder');
    assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appReady), 'true');
    assert.equal(await page.evaluate(() => window.WaferCadV2RealBridge?.ready), true);
    assert.equal(await page.evaluate(() => Boolean(window.WaferCadV2Shell)), false,
      'Mock presenter must not run');
    await page.evaluate(() => {
      window.d1OriginalStages = new Map(
        ['main', 'mask', 'three', 'section'].map((key) =>
          [key, window.WaferCadV2RealBridge.getSlot(`view.${key}.stage`)]),
      );
      window.d1OriginalButtons = new Map(
        ['mainZoomFit', 'maskZoomFit', 'fit3dBtn', 'mainMaxBtn', 'threeMaxBtn']
          .map((key) => [key, document.getElementById(key)]),
      );
      if (document.querySelectorAll('#mainCanvas').length !== 1 ||
          document.querySelectorAll('#maskCanvas').length !== 1 ||
          document.querySelectorAll('#sectionCanvas').length !== 1 ||
          document.querySelectorAll('#threeHost').length !== 1)
        throw Error('Missing or duplicate scientific host ID');
    });

    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await waitForPaint(page);
      await page.locator('[data-action="view:main"]').click();
      // The narrow v2 shell intentionally hides mode controls and forces Single.
      if (width > 820) {
        await page.locator('[data-action="mode:single"]').click();
        await page.locator('[data-action="mode:overview"]').click();
        await page.locator('[data-action="mode:split"]').click();
        await page.locator('[data-key="split-left"]').selectOption('mask');
        await page.locator('[data-key="split-right"]').selectOption('main');
        assert.deepEqual(
          await page.evaluate(() => JSON.parse(sessionStorage.getItem('wafercad.workstation-split-views.v1'))),
          ['mask', 'main'],
        );
        await page.locator('[data-action="mode:single"]').click();
      }
      await page.locator('#mainMaxBtn').click();
      assert.equal(await page.locator('#mainMaxBtn').getAttribute('aria-pressed'), 'true');
      await page.locator('#mainMaxBtn').click();
      assert.equal(await page.locator('#mainMaxBtn').getAttribute('aria-pressed'), 'false');
      const fit = page.locator('#mainZoomFit');
      if (!(await fit.isVisible()))
        await page.locator('#mainPanel .view-more-control > summary').click();
      await fit.click();
      await page.evaluate(() => {
        if (!window.WaferCadV2RealBridge.verifyNativeIdentity())
          throw Error('Scientific host re-created or detached');
        for (const [key, node] of window.d1OriginalStages)
          if (window.WaferCadV2RealBridge.getSlot(`view.${key}.stage`) !== node)
            throw Error(`Stage identity changed: ${key}`);
        for (const [id, node] of window.d1OriginalButtons)
          if (document.getElementById(id) !== node)
            throw Error(`Native control identity changed: ${id}`);
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
        if (new Set(ids).size !== ids.length) throw Error('Duplicate IDs');
      });
      const values = await page.evaluate(() => ({
        width: innerWidth,
        liveCanvas: ['mainCanvas', 'maskCanvas', 'sectionCanvas'].filter((id) =>
          document.getElementById(id) instanceof HTMLCanvasElement).length,
        glCanvasCount: document.querySelectorAll('#threeHost canvas').length,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        restored: document.getElementById('mainMaxBtn').textContent.trim(),
      }));
      assert.equal(values.liveCanvas, 3);
      assert.equal(values.restored, 'Max');
      // Browser/GPU fallback is evidence, never silently called hardware rendering.
      evidence.widths.push(values);
      await page.screenshot({ path: resolve(output, `real-${width}.png`), fullPage: true });
    }
    assert.deepEqual(evidence.errors, [], 'No JS page/console errors');
    evidence.result = 'pass';
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await context.close();
  }
} catch (error) {
  evidence.result = 'fail';
  evidence.failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser?.close();
  await new Promise((done) => server.close(done));
}
