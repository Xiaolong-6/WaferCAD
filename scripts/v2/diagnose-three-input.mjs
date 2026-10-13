// Read-only M3D input/frame diagnostic, not an acceptance gate or performance threshold.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve(process.env.WAFERCAD_DIAGNOSTIC_OUTPUT || 'test-results/ui-v2-three-input');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  result: 'diagnostic-only',
  executable: process.env.WAFERCAD_CHROMIUM || 'locked Playwright headless shell',
  errors: [],
  noWaitAfter: process.env.WAFERCAD_DIAGNOSTIC_NO_WAIT === '1',
  dampingOffExperiment: process.env.WAFERCAD_DIAGNOSTIC_DAMPING_OFF === '1',
};
const browser = await launchBrowser();
try {
  report.browser = browser.version();
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  if (report.dampingOffExperiment) {
    // Isolated response override only; never writes the product renderer.
    const source = await readFile(resolve('site/three-view.js'), 'utf8');
    const anchor = 'if (controls) controls.enableDamping = !heavyExactTransparency;';
    if (!source.includes(anchor)) throw Error('Damping experiment anchor is missing');
    await page.route(`${base}/three-view.js`, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: source.replace(
          anchor,
          `${anchor}\n      if (gestureMode !== null && controls) controls.enableDamping = false;`,
        ),
      }),
    );
  }
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(`${base}/app.html?start=example&example=m3d`);
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, { timeout: 120000 });
  await page.locator('[data-action="view:three"]').click();
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const before = await snapshot();
  report.navigationsAfterReady = [];
  page.on('framenavigated', (frame) => report.navigationsAfterReady.push(frame.url()));
  report.webgl = await page.locator('#threeHost canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  const diagnostics = () =>
    page.evaluate(() => {
      const host = document.getElementById('threeHost');
      const button = document.querySelector('[data-action="tool:pan:three"]');
      const rect = button.getBoundingClientRect();
      return {
        frames: Number(host.dataset.rendererFrameSerial),
        frameMs: Number(host.dataset.rendererFrameMs),
        drawCalls: Number(host.dataset.rendererDrawCalls),
        triangles: Number(host.dataset.rendererDrawTriangles),
        damping: host.dataset.cameraDampingEnabled,
        mode: window.WaferCadV2Workstation.snapshot().local.three.mode,
        panRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitAction: document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('[data-action]')?.dataset.action,
      };
    });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const box = await page.locator('#threeHost canvas').boundingBox();
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 32, y + 18, { steps: 6 });
  await page.mouse.up();
  report.afterRotate = await diagnostics();
  const startedAt = performance.now();
  try {
    await page.locator('[data-action="tool:pan:three"]').click({ noWaitAfter: report.noWaitAfter });
    report.panClickSuccess = true;
  } catch (error) {
    report.panClickSuccess = false;
    report.panFailure = error.message;
  }
  report.panClickMs = performance.now() - startedAt;
  const { profile } = await cdp.send('Profiler.stop');
  const counts = new Map();
  for (const id of profile.samples || []) counts.set(id, (counts.get(id) || 0) + 1);
  report.cpuSamples = (profile.samples || []).length;
  report.topCpu = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, samples]) => ({
      samples,
      ...profile.nodes.find((node) => node.id === id).callFrame,
    }));
  report.afterClick = await diagnostics();
  const after = await snapshot();
  report.scientificUnchanged = isDeepStrictEqual(before.model, after.model);
  report.cameraRotated = !isDeepStrictEqual(before.threeCamera, after.threeCamera);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
