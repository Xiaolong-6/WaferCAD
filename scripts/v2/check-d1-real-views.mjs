// M3 D1 experimental real-view gate (not M2 mock / not approved visual baseline).
// Run with WAFERCAD_THREE_DIR pointing to pinned node_modules/three.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint, chooseConfirmation } from '../test-helpers/ui.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const site = resolve(repo, 'site');
const fixtures = {
  m3d: 'm3d-selfpowered-heterogeneous-ic',
  photodetector: 'photodetector-literature',
};
const fixture = process.env.WAFERCAD_D1_FIXTURE || '';
assert.ok(!fixture || fixtures[fixture], 'Known real-view fixture');
const output = resolve(repo, `test-results/ui-v2-d1-real${fixture ? `-${fixture}` : ''}`);
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gds': 'application/octet-stream',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    // Pages creates this deploy-time asset. Supply an explicit local build fixture.
    if (pathname === '/build-info.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ commit: evidence.revision }));
      return;
    }
    const target = resolve(site, `.${decodeURIComponent(pathname)}`);
    if (!target.startsWith(`${site}${sep}`)) return res.writeHead(403).end();
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(target)] || 'application/octet-stream',
    });
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
  fixture: fixture || 'default Base',
};
let browser;
await rm(output, { recursive: true, force: true });
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
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' || document.body.dataset.ready === 'error',
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator('body').getAttribute('data-ready'),
      'true',
      'Real app must boot, not display an error or a placeholder',
    );
    assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appReady), 'true');
    assert.equal(await page.evaluate(() => window.WaferCadV2RealBridge?.ready), true);
    assert.equal(
      await page.evaluate(() => Boolean(window.WaferCadV2Shell)),
      false,
      'Mock presenter must not run',
    );
    if (fixture) {
      // Inject actual final-only project data through the existing import controller.
      // This is a D1 scientific-view fixture, not acceptance of the unconnected D3 UI.
      const filename = `${fixtures[fixture]}.wafercad`;
      await page
        .locator('#openProjectInput')
        .setInputFiles(resolve(site, 'examples/previews', filename));
      await chooseConfirmation(page);
      await page.waitForFunction(
        (name) => document.getElementById('statusText').textContent === `Opened ${name}.`,
        filename,
        { timeout: 120000 },
      );
    }
    // appReady precedes async WebGL initialization; capture identity after a complete frame.
    await page.waitForFunction(
      () =>
        document.querySelector('#threeHost canvas') &&
        Number(document.getElementById('threeHost').dataset.rendererFrameSerial) > 0 &&
        document.getElementById('threeHost').dataset.renderPhase === 'complete',
    );
    await page.evaluate(() => {
      window.d1OriginalStages = new Map(
        ['main', 'mask', 'three', 'section'].map((key) => [
          key,
          window.WaferCadV2RealBridge.getSlot(`view.${key}.stage`),
        ]),
      );
      window.d1OriginalButtons = new Map(
        [
          'mainZoomFit',
          'maskZoomFit',
          'fit3dBtn',
          'mainMaxBtn',
          'threeMaxBtn',
          'mainZoomIn',
          'mainZoomOut',
          'maskZoomIn',
          'maskZoomOut',
        ].map((key) => [key, document.getElementById(key)]),
      );
      window.d1OriginalGlCanvas = document.querySelector('#threeHost canvas');
      for (const [name, node] of [...window.d1OriginalStages, ...window.d1OriginalButtons])
        if (!node) throw Error(`Missing original node: ${name}`);
      for (const name of window.WaferCadV2ShellRegistry.defaults.slots)
        if (!window.WaferCadV2RealBridge.getSlot(name)) throw Error(`Missing named slot ${name}`);
      if (
        document.querySelectorAll('#mainCanvas').length !== 1 ||
        document.querySelectorAll('#maskCanvas').length !== 1 ||
        document.querySelectorAll('#sectionCanvas').length !== 1 ||
        document.querySelectorAll('#threeHost').length !== 1
      )
        throw Error('Missing or duplicate scientific host ID');
    });

    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await waitForPaint(page);
      await page.locator('[data-action="view:main"]').click();
      await waitForPaint(page);
      const originalScale = await page.locator('#mainCanvas').getAttribute('data-x-px-per-um');
      await page.locator('#mainPanel .v2-real-zoom > summary').click();
      await page.locator('#mainZoomIn').click();
      await waitForPaint(page);
      const zoomScale = await page.locator('#mainCanvas').getAttribute('data-x-px-per-um');
      assert.ok(
        Math.abs(Number(zoomScale) / Number(originalScale) - 1.25) < 1e-8,
        'Moved native Zoom still changes real plan scale',
      );
      await page.locator('#mainZoomFit').click();
      await waitForPaint(page);
      // The narrow v2 shell intentionally hides mode controls and forces Single.
      if (width > 820) {
        await page.locator('[data-action="mode:single"]').click();
        assert.equal(
          await page.evaluate(() => sessionStorage.getItem('wafercad.workstation-view-mode.v1')),
          'main',
        );
        await page.locator('[data-action="mode:overview"]').click();
        await page.locator('[data-action="mode:split"]').click();
        await page.locator('[data-key="split-left"]').selectOption('mask');
        await page.locator('[data-key="split-right"]').selectOption('main');
        assert.deepEqual(
          await page.evaluate(() =>
            JSON.parse(sessionStorage.getItem('wafercad.workstation-split-views.v1')),
          ),
          ['mask', 'main'],
        );
        await page.locator('[data-action="mode:single"]').click();
      }
      const clickMainAction = async (selector) => {
        // Let layout and the native ResizeObserver move responsive controls first.
        await waitForPaint(page);
        if (!(await page.locator(selector).isVisible()))
          await page.locator('#mainPanel .view-more-control > summary').click();
        await waitForPaint(page);
        await page.locator(selector).click();
      };
      await clickMainAction('#mainMaxBtn');
      assert.equal(await page.locator('#mainMaxBtn').getAttribute('aria-pressed'), 'true');
      await clickMainAction('#mainMaxBtn');
      assert.equal(await page.locator('#mainMaxBtn').getAttribute('aria-pressed'), 'false');
      const fit = page.locator('#mainZoomFit');
      if (!(await fit.isVisible()))
        await page.locator('#mainPanel .view-more-control > summary').click();
      await fit.click();
      await waitForPaint(page);
      const more = page.locator('#mainPanel .view-more-control');
      const moreSummary = more.locator(':scope > summary');
      await moreSummary.focus();
      await moreSummary.press('ArrowDown');
      await page.waitForFunction(
        () =>
          document
            .querySelector('#mainPanel .view-more-control > summary')
            .getAttribute('aria-expanded') === 'true',
      );
      assert.equal(
        await more.evaluate(
          (node) =>
            node.contains(document.activeElement) &&
            document.activeElement !== node.querySelector(':scope > summary'),
        ),
        true,
        'ArrowDown focuses a real More action',
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () =>
          document
            .querySelector('#mainPanel .view-more-control > summary')
            .getAttribute('aria-expanded') === 'false',
      );
      assert.equal(
        await moreSummary.evaluate((node) => document.activeElement === node),
        true,
        'Escape restores More trigger focus',
      );
      const mainRect = await page.locator('#mainCanvas').boundingBox();
      assert.ok(
        mainRect.width > 100 && mainRect.height > 100,
        'Main must occupy visible grid space',
      );
      assert.ok(
        mainRect.x >= 0 && mainRect.x + mainRect.width <= width,
        'Main stays inside viewport',
      );
      const roiSummary = page.locator('#focusEditor > summary');
      if (!(await roiSummary.isVisible()))
        await page.locator('#mainPanel .view-more-control > summary').click();
      await roiSummary.click();
      await page.locator('.roi-tool[data-tool="rect"]').click();
      await page.waitForFunction(() => !document.querySelector('#mainPanel details[open]'));
      await waitForPaint(page);
      const dragRect = await page.locator('#mainCanvas').boundingBox();
      const start = {
        x: dragRect.x + dragRect.width * 0.45,
        y: dragRect.y + dragRect.height * 0.45,
      };
      const end = { x: dragRect.x + dragRect.width * 0.55, y: dragRect.y + dragRect.height * 0.55 };
      evidence.currentDrag = {
        width,
        dragRect,
        hit: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, start),
      };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await page.mouse.up();
      await page.waitForFunction(() =>
        /^ROI created\./.test(document.getElementById('statusText').textContent),
      );
      const roi = await page.evaluate(() => ({
        widthUm: Number(document.getElementById('roiWidth').value),
        heightUm: Number(document.getElementById('roiHeight').value),
        scale: Number(document.getElementById('mainCanvas').dataset.xPxPerUm),
        unit: document.getElementById('roiUnitLabel').textContent,
      }));
      assert.equal(roi.unit, 'µm');
      roi.widthPixelDelta = Math.abs(roi.widthUm * roi.scale - (end.x - start.x));
      roi.heightPixelDelta = Math.abs(roi.heightUm * roi.scale - (end.y - start.y));
      assert.ok(
        roi.widthPixelDelta <= 0.25 && roi.heightPixelDelta <= 0.25,
        `Real pointer ROI round-trip exceeds 0.25px: ${JSON.stringify(roi)}`,
      );
      await page.evaluate(() => {
        if (!window.WaferCadV2RealBridge.verifyNativeIdentity())
          throw Error('Scientific host re-created or detached');
        for (const [key, node] of window.d1OriginalStages)
          if (window.WaferCadV2RealBridge.getSlot(`view.${key}.stage`) !== node)
            throw Error(`Stage identity changed: ${key}`);
        for (const [id, node] of window.d1OriginalButtons)
          if (document.getElementById(id) !== node)
            throw Error(`Native control identity changed: ${id}`);
        if (document.querySelector('#threeHost canvas') !== window.d1OriginalGlCanvas)
          throw Error('WebGL canvas identity changed');
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
        if (new Set(ids).size !== ids.length) throw Error('Duplicate IDs');
      });
      const values = await page.evaluate(() => ({
        width: innerWidth,
        liveCanvas: ['mainCanvas', 'maskCanvas', 'sectionCanvas'].filter(
          (id) => document.getElementById(id) instanceof HTMLCanvasElement,
        ).length,
        glCanvasCount: document.querySelectorAll('#threeHost canvas').length,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        restored: document.getElementById('mainMaxBtn').textContent.trim(),
      }));
      assert.equal(values.liveCanvas, 3);
      assert.equal(values.restored, 'Max');
      assert.equal(values.overflow, 0, 'No horizontal overflow');
      values.roi = roi;
      // Browser/GPU fallback is evidence, never silently called hardware rendering.
      evidence.widths.push(values);
      await page.screenshot({ path: resolve(output, `real-${width}.png`), fullPage: true });
      await page.locator('[data-action="view:three"]').click();
      await page.waitForFunction(
        () =>
          Number(document.getElementById('threeHost').dataset.rendererFrameSerial) > 0 &&
          document.getElementById('threeHost').dataset.renderPhase === 'complete',
      );
      values.three = await page.evaluate(() => {
        const host = document.getElementById('threeHost');
        const canvas = host.querySelector('canvas');
        if (canvas !== window.d1OriginalGlCanvas) throw Error('WebGL canvas replaced after ROI');
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100 || rect.x < 0 || rect.right > innerWidth)
          throw Error('WebGL view outside visible grid');
        const gl = canvas.getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
        return {
          renderer,
          gpuClass: /swiftshader|llvmpipe|software|basic render/i.test(renderer)
            ? 'software WebGL'
            : 'unclassified; hardware not established',
          frameSerial: host.dataset.rendererFrameSerial,
          drawCalls: host.dataset.rendererDrawCalls,
          drawTriangles: host.dataset.rendererDrawTriangles,
          renderPhase: host.dataset.renderPhase,
        };
      });
      await page.screenshot({ path: resolve(output, `three-${width}.png`), fullPage: true });
      await page.locator(`[data-action="${width > 820 ? 'section' : 'mobile-section'}"]`).click();
      if (width > 820) await page.locator('[data-action="section"]').click();
      await waitForPaint(page);
      const sectionRect = await page.locator('#sectionCanvas').boundingBox();
      assert.ok(
        sectionRect.width > 100 && sectionRect.height > 100,
        'Section scientific canvas is visible',
      );
      await page.screenshot({ path: resolve(output, `section-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.locator('[data-action="view:main"]').click();
    await page.locator('[data-action="mode:single"]').click();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem('wafercad.workstation-view-mode.v1')),
      'main',
    );
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    assert.equal(
      await page.locator('.p-canvases').getAttribute('data-mode'),
      'single',
      'Single survives reload',
    );
    evidence.reload = 'Single/main remembered';
    // Capture the approved prototype unchanged for manual chrome comparison.
    // Scientific content differs; these are references, not replacement pixel baselines.
    const reference = await context.newPage();
    for (const width of [1440, 1024, 768, 390]) {
      await reference.setViewportSize({ width, height: 960 });
      await reference.goto(
        `${base}/ui-v2/prototypes/a-full/index.html?example=${fixture === 'photodetector' ? fixture : 'm3d'}`,
      );
      await reference.locator('#width').selectOption(String(width));
      await reference
        .locator('#example')
        .selectOption(fixture === 'photodetector' ? fixture : 'm3d');
      await reference.frameLocator('#frame').locator('.p-workbench').waitFor({ state: 'visible' });
      await waitForPaint(reference);
      await reference.locator('#frame').screenshot({
        path: resolve(output, `m15-reference-${width}.png`),
      });
    }
    await reference.close();
    evidence.visualReference = 'unchanged M1.5 a-full; manual chrome review, not pixel equivalence';
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
