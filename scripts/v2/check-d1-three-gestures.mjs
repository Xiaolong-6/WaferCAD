// D1 gate: prove the REAL 3D OrbitControls camera changes under v2 Pan/Zoom.
// These are presentation gestures only; no second renderer/scientific model.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
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
assert.ok(!fixture || fixtures[fixture], 'Known D1 camera test fixture');
const output = resolve(repo, `test-results/ui-v2-d1-camera${fixture ? `-${fixture}` : ''}`);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const evidence = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  fixture: fixture || 'Base',
  widths: [],
  errors: [],
  result: 'running',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/build-info.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ commit: evidence.sha }));
    }
    const file = resolve(site, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(`${site}${sep}`)) return res.writeHead(403).end();
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
const length = (a) => Math.hypot(...a);
const difference = (a, b) => a.map((v, i) => v - b[i]);
const closeEnough = (a, b, tolerance) => length(difference(a, b)) <= tolerance;
let browser;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
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
    await page.goto(`${base}/app-v2-real.html`);
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' || document.body.dataset.ready === 'error',
      null,
      { timeout: 120000 },
    );
    assert.equal(await page.locator('body').getAttribute('data-ready'), 'true');
    if (fixture) {
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
    await page.waitForFunction(
      () =>
        document.querySelector('#threeHost canvas') &&
        document.getElementById('threeHost').dataset.renderPhase === 'complete' &&
        window.WaferCadV2RealBridge.getThreeCamera(),
      null,
      { timeout: 120000 },
    );
    await page.evaluate(() => {
      window.d1CameraCanvas = document.querySelector('#threeHost canvas');
      if (!window.d1CameraCanvas) throw Error('Real WebGL canvas not initialized');
      document.addEventListener(
        'pointerdown',
        (event) => {
          if (event.target === window.d1CameraCanvas) window.d1LastPointerId = event.pointerId;
        },
        true,
      );
    });
    evidence.renderer = await page.evaluate(() => {
      const gl = window.d1CameraCanvas.getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const name = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      return {
        name,
        gpuClass: /swiftshader|llvmpipe|software/i.test(name)
          ? 'software WebGL'
          : 'unclassified; hardware not established',
      };
    });

    async function camera() {
      return page.evaluate(() => window.WaferCadV2RealBridge.getThreeCamera());
    }
    async function drag3d(dx, dy) {
      const frameBefore = await page
        .locator('#threeHost')
        .getAttribute('data-renderer-frame-serial');
      const box = await page.locator('#threeHost canvas').boundingBox();
      assert.ok(box && box.width > 100 && box.height > 100, 'WebGL viewport visible');
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      assert.equal(
        await page.evaluate(
          ({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            return hit?.tagName === 'CANVAS' && document.getElementById('threeHost').contains(hit);
          },
          { x, y },
        ),
        true,
        'Pan/Zoom must start on the real 3D canvas, not on an overlay',
      );
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      await page.mouse.up();
      assert.equal(
        await page
          .locator('#threeHost')
          .evaluate((node) => node.hasPointerCapture(window.d1LastPointerId)),
        false,
        'Custom pointer capture released after drag',
      );
      await waitForPaint(page);
      await page.waitForFunction(
        (before) => {
          const d = document.getElementById('threeHost').dataset;
          return d.renderPhase === 'complete' && Number(d.rendererFrameSerial) > Number(before);
        },
        frameBefore,
        { timeout: 120000 },
      );
    }

    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.locator('[data-action="view:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost').dataset.renderPhase === 'complete',
        null,
        { timeout: 120000 },
      );
      const before = await camera();
      assert.ok(before && before.position && before.target, 'Actual camera state must exist');
      await page.locator('[data-action="v2-three-pan"]').click();
      assert.equal(
        await page.locator('[data-action="v2-three-pan"]').getAttribute('aria-pressed'),
        'true',
      );
      await drag3d(40, 20);
      const afterPan = await camera();
      const originalOffset = difference(before.position, before.target);
      const translatedOffset = difference(afterPan.position, afterPan.target);
      assert.ok(
        length(difference(afterPan.target, before.target)) > 0.001,
        'Pan must translate the original camera target',
      );
      assert.ok(
        closeEnough(
          originalOffset,
          translatedOffset,
          0.000001 * Math.max(1, length(originalOffset)),
        ),
        'Pan must retain relative camera direction/distance',
      );
      await page.locator('[data-action="v2-three-zoom"]').click();
      assert.equal(
        await page.locator('[data-action="v2-three-pan"]').getAttribute('aria-pressed'),
        'false',
      );
      await drag3d(0, 45);
      const afterZoom = await camera();
      const ratio =
        length(difference(afterZoom.position, afterZoom.target)) /
        length(difference(afterPan.position, afterPan.target));
      assert.ok(ratio > 1.1 && ratio < 2, `Zoom must change actual camera distance: ${ratio}`);
      assert.ok(
        closeEnough(
          afterPan.target,
          afterZoom.target,
          0.000001 * Math.max(1, length(afterPan.target)),
        ),
        'Zoom must preserve target',
      );
      await page.locator('[data-action="v2-three-zoom"]').click();
      assert.equal(await page.locator('#threeHost').getAttribute('data-v2-gesture'), 'orbit');
      assert.equal(
        await page.evaluate(
          () => document.querySelector('#threeHost canvas') === window.d1CameraCanvas,
        ),
        true,
        'Original WebGL canvas must persist throughout gestures',
      );
      evidence.widths.push({
        width,
        targetShift: length(difference(afterPan.target, before.target)),
        panRelativeError: length(difference(originalOffset, translatedOffset)),
        zoomRatio: ratio,
        viewport: await page.locator('#threeHost canvas').boundingBox(),
      });
      await page.screenshot({ path: resolve(output, `camera-${width}.png`), fullPage: true });
    }
    const beforeOrbit = await camera();
    await drag3d(28, 14);
    const afterOrbit = await camera();
    const offsetBefore = difference(beforeOrbit.position, beforeOrbit.target);
    const offsetAfter = difference(afterOrbit.position, afterOrbit.target);
    evidence.restoredOrbitShift = length(difference(offsetBefore, offsetAfter));
    assert.ok(
      evidence.restoredOrbitShift > 0.0001 * length(offsetBefore),
      'Default OrbitControls must really rotate after leaving custom gesture mode',
    );
    await page.locator('[data-action="v2-three-pan"]').click();
    const cancelBox = await page.locator('#threeHost canvas').boundingBox();
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
    await page.mouse.down();
    assert.equal(
      await page
        .locator('#threeHost')
        .evaluate((node) => node.hasPointerCapture(window.d1LastPointerId)),
      true,
      'Pan owns actual drag capture',
    );
    await page.locator('[data-action="view:main"]').focus();
    await page.keyboard.press('Enter');
    await waitForPaint(page);
    assert.equal(
      await page
        .locator('#threeHost')
        .evaluate((node) => node.hasPointerCapture(window.d1LastPointerId)),
      false,
      'View hide releases an active drag',
    );
    await page.mouse.up();
    evidence.hideCapture = 'released through actual keyboard navigation while dragging';
    assert.deepEqual(evidence.errors, [], 'No browser JS/console errors');
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
