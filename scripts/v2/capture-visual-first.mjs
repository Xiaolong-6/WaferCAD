// Fast, read-only screenshot evidence for visual-first development.
// Capturing is not AI/human approval, a pixel baseline, or a science oracle.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, waitForPaint } from '../test-helpers/ui.mjs';

const output = resolve(process.env.WAFERCAD_VISUAL_OUTPUT || 'test-results/visual-first');
const example = process.env.WAFERCAD_VISUAL_EXAMPLE || 'jlfet';
assert.match(example, /^[a-z0-9-]+$/, 'Use a published example slug');
const port = String(process.env.WAFERCAD_VISUAL_PORT || 4189);
const external = process.env.WAFERCAD_V2_BASE;
const base = external || 'http://127.0.0.1:' + port;
const cases = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
if (process.env.WAFERCAD_VISUAL_SMALL === '1') cases.push({ width: 360, height: 640 });

await mkdir(output, { recursive: true });
const report = {
  example,
  base,
  reviewStatus: 'unreviewed',
  captureStatus: 'running',
  captures: [],
  errors: [],
  warnings: [],
};
const server = external
  ? null
  : spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
      cwd: resolve('.'),
      env: { ...process.env, WAFERCAD_V2_PORT: port },
      stdio: 'ignore',
    });
let browser;
try {
  let available = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(base + '/app.html');
      if (response.ok) {
        available = true;
        break;
      }
    } catch {
      // The locally spawned preview server may not have started yet.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(available, 'Visual-first preview server must respond');
  browser = await launchBrowser();
  report.browser = browser.version();
  for (const { width, height } of cases) {
    const context = await browser.newContext({ viewport: { width, height } });
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.goto(base + '/app.html?start=example&example=' + example, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      await page.screenshot({ path: resolve(output, 'initial-' + width + '.png') });
      const initial = await page.evaluate(() => {
        const state = window.WaferCadV2Workstation.snapshot();
        return {
          source: state.source,
          layers: state.model.layers.length,
          steps: state.workflow.steps.length,
          mode: state.ui.mode,
        };
      });
      assert.ok(initial.layers > 0, 'Capture a real example, not a placeholder');
      for (const view of ['main', 'mask', 'three', 'section']) {
        await page.evaluate((name) => {
          // Section has its own dock: maximize on desktop, use the mobile
          // Section action in portrait. An Overview screenshot is not proof
          // that the dedicated Section view can be selected.
          const actions =
            name === 'section'
              ? width <= 820
                ? ['mobile-section']
                : ['maximize:section']
              : ['view:' + name];
          const button = actions
            .map((action) => document.querySelector('button[data-action="' + action + '"]'))
            .find(Boolean);
          if (!button) throw new Error('View selector is missing: ' + name);
          button.click();
        }, view);
        await waitForPaint(page);
        const sectionState =
          view === 'section'
            ? await page.evaluate(() => {
                const ui = window.WaferCadV2Workstation.snapshot().ui;
                return { view: ui.view, maximize: ui.maximize };
              })
            : null;
        if (sectionState) {
          if (width <= 820) assert.equal(sectionState.view, 'section', 'Portrait Section tab');
          else assert.equal(sectionState.maximize, 'section', 'Desktop Section maximized');
        }
        if (view === 'three') {
          try {
            await page.waitForFunction(
              () => {
                const host = document.getElementById('threeHost');
                return host?.querySelector('canvas') && host.dataset.renderPhase === 'complete';
              },
              null,
              { timeout: 20000 },
            );
          } catch {
            report.warnings.push('3D frame readiness not confirmed at ' + width + 'px');
          }
        }
        const filename = view + '-' + width + '.png';
        await page.screenshot({ path: resolve(output, filename) });
        const panel = page.locator('#' + view + 'Panel');
        assert.ok(await panel.isVisible(), 'Selected view must be visible: ' + view + '/' + width);
        await panel.screenshot({ path: resolve(output, view + '-' + width + '-panel.png') });
        report.captures.push({
          width,
          height,
          view,
          screenshot: filename,
          initial,
          frame:
            view === 'three'
              ? await page.locator('#threeHost').getAttribute('data-render-phase')
              : null,
        });
      }
    } finally {
      await context.close();
    }
  }
  assert.equal(report.errors.length, 0, 'No uncaught browser errors during visual capture');
  report.captureStatus = 'complete';
  console.log('Visual evidence captured at ' + output);
  console.log('Screenshots must be examined by an AI or human before visual acceptance.');
} catch (error) {
  report.captureStatus = 'failed';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill();
}
