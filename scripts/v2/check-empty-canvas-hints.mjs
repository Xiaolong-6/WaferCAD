// Focused real-browser acceptance of v2 empty canvas hints and default Base appearance.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const output = resolve(process.env.WAFERCAD_EMPTY_HINT_OUTPUT || 'test-results/empty-canvas-hints');
const port = String(process.env.WAFERCAD_EMPTY_HINT_PORT || 4193);
const base = process.env.WAFERCAD_V2_BASE || `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });

const report = { status: 'running', cases: [], errors: [] };
const server = process.env.WAFERCAD_V2_BASE
  ? null
  : spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
      cwd: resolve('.'),
      env: { ...process.env, WAFERCAD_V2_PORT: port },
      stdio: 'ignore',
    });
let browser;

async function ready(page) {
  await page.goto(`${base}/app.html?start=empty`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  const snapshot = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(snapshot.model.layers.length, 1);
  assert.equal(snapshot.model.layers[0].color.toLowerCase(), '#dde4ec');
  assert.equal(snapshot.workflow.steps.length, 0);
  return snapshot;
}

async function showDesktop(page, view) {
  await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
  await page.locator(`#${view}Panel [data-action="maximize:${view}"]`).click();
  await waitForPaint(page);
  assert.equal(await page.locator(`#${view}Panel`).isVisible(), true);
}

async function shot(page, label) {
  const path = resolve(output, label + '.png');
  await page.screenshot({ path });
  report.cases.push({ label, screenshot: label + '.png' });
}

try {
  let available = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${base}/app.html`)).ok) {
        available = true;
        break;
      }
    } catch {
      // Local server may still be booting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  assert.ok(available, 'v2 server responded');
  browser = await launchBrowser();
  report.browser = browser.version();

  {
    const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const initial = await ready(page);
      const mainHint = page.locator('#mainPanel .v2-empty-hint');
      assert.equal(await mainHint.isVisible(), true, 'Pristine Main shows Add guidance');
      assert.equal(await mainHint.getByRole('button', { name: 'Add' }).count(), 1);
      assert.equal(await page.locator('#maskPanel .v2-empty-hint').isVisible(), true);
      const framing = await page.evaluate(() =>
        Object.fromEntries(
          ['main', 'mask', 'section', 'three'].map((name) => {
            const panel = document.getElementById(name + 'Panel');
            const panelStyle = getComputedStyle(panel);
            const head = panel.querySelector('.p-view-head');
            const headStyle = getComputedStyle(head);
            return [
              name,
              {
                width: panelStyle.borderTopWidth,
                radius: panelStyle.borderTopLeftRadius,
                divider: headStyle.borderBottomWidth,
              },
            ];
          }),
        ),
      );
      for (const [name, frame] of Object.entries(framing)) {
        assert.equal(frame.width, '1px', name + ' panel border');
        assert.equal(frame.radius, '4px', name + ' shared radius');
        assert.equal(frame.divider, '1px', name + ' titlebar divider');
      }
      report.desktopFrame = framing;
      await shot(page, 'desktop-empty-overview');
      await showDesktop(page, 'main');
      const hintPlacement = await mainHint.evaluate((node) => {
        const stage = node.closest('.v2-plan-stage').getBoundingClientRect();
        const bounds = node.getBoundingClientRect();
        return { topRatio: (bounds.top + bounds.height / 2 - stage.top) / stage.height };
      });
      assert.ok(Math.abs(hintPlacement.topRatio - 0.22) < 0.05, 'Hint stays above A–B slice');
      await shot(page, 'desktop-empty-main');
      await showDesktop(page, 'section');
      await shot(page, 'desktop-empty-section-new-base');
      await showDesktop(page, 'mask');
      await shot(page, 'desktop-empty-mask');
      await showDesktop(page, 'main');
      await mainHint.getByRole('button', { name: 'Add' }).click();
      assert.equal(
        await page.locator('.p-nav [data-action="domain:process"]').getAttribute('aria-pressed'),
        'true',
        'Add uses the actual Process editor navigation',
      );
      assert.deepEqual(
        (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        initial.model,
        'Opening the Process editor never changes scientific geometry',
      );
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#faceToggleBtn').selectOption('front');
      await page.locator('#layerName').fill('Empty hint test layer');
      await page.locator('#operationThickness').fill('0.125');
      await page.locator('#applyOperationBtn').click();
      const continuation = page.getByRole('button', {
        name: 'Create Variant & apply',
        exact: true,
      });
      if (await continuation.isVisible()) await continuation.click();
      await page.waitForFunction(
        () =>
          window.WaferCadV2Workstation.snapshot().model.layers.some(
            (layer) => layer.name === 'Empty hint test layer',
          ),
        null,
        { timeout: 120000 },
      );
      await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy);
      await waitForPaint(page);
      assert.equal(await mainHint.isVisible(), false, 'Adding a layer hides Main empty hint');
      await shot(page, 'desktop-processed-main-no-hint');
      assert.deepEqual(errors, [], 'Empty Main and Process actions are exception-free');
      report.cases.push({ label: 'add-process-and-hide', status: 'pass' });
    } finally {
      await context.close();
    }
  }

  {
    const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const initial = await ready(page);
      await page.locator('.p-nav [data-action="domain:mask"]').click();
      const maskHint = page.locator('#maskPanel .v2-empty-hint');
      assert.equal(await maskHint.isVisible(), true);
      await maskHint.getByRole('button', { name: 'Draw' }).click();
      await page.waitForFunction(
        () => window.WaferCadV2Workstation.snapshot().maskSourceMode === 'draw',
      );
      assert.equal(await maskHint.isVisible(), true, 'Empty Draw source retains useful guidance');
      await page.locator('#maskPanel [data-action="draw-tool:rect"]').click();
      const bounds = await page.locator('#maskCanvas').boundingBox();
      assert.ok(bounds, 'Mask canvas must be visible');
      await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.65, {
        steps: 8,
      });
      await page.mouse.up();
      await page.waitForFunction(
        () => window.WaferCadV2Workstation.snapshot().drawMask.shapes.length === 1,
        null,
        { timeout: 10000 },
      );
      await waitForPaint(page);
      assert.equal(await maskHint.isVisible(), false, 'Drawing a shape hides Mask empty hint');
      assert.deepEqual(
        (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        initial.model,
        'Draw Mask does not mutate substrate',
      );
      await shot(page, 'desktop-drawn-mask-no-hint');
      assert.deepEqual(errors, [], 'Draw workflow exception-free');
      report.cases.push({ label: 'draw-mask-and-hide', status: 'pass' });
    } finally {
      await context.close();
    }
  }

  {
    const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const initial = await ready(page);
      await page.locator('.p-nav [data-action="domain:mask"]').click();
      const maskHint = page.locator('#maskPanel .v2-empty-hint');
      assert.equal(await maskHint.isVisible(), true);
      const fileChooser = page.waitForEvent('filechooser', { timeout: 10000 });
      await maskHint.getByRole('button', { name: 'import' }).click();
      const chooser = await fileChooser;
      await chooser.setFiles('site/samples/klayout/gds-basic-instances.gds');
      await page.waitForFunction(
        () => {
          const state = window.WaferCadV2Workstation.snapshot();
          return (
            state.layout.name === 'gds-basic-instances.gds' &&
            state.layout.elements.length > 0 &&
            state.maskSourceMode === 'file'
          );
        },
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      assert.equal(await maskHint.isVisible(), false, 'Imported File source hides hint');
      assert.deepEqual(
        (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
        initial.model,
        'GDS import does not modify wafer material model',
      );
      await shot(page, 'desktop-imported-mask-no-hint');
      assert.deepEqual(errors, [], 'Native file chooser and import exception-free');
      report.cases.push({ label: 'import-gds-and-hide', status: 'pass' });
    } finally {
      await context.close();
    }
  }

  {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await ready(page);
      const mainHint = page.locator('#mainPanel .v2-empty-hint');
      assert.equal(await mainHint.isVisible(), true, 'Mobile Main empty hint');
      await shot(page, 'mobile-empty-main');
      // Compact View nav contains only view switches, not Process. Add must
      // reveal the editor and select Process using the normal shell workflow.
      await mainHint.getByRole('button', { name: 'Add' }).click();
      await page.waitForFunction(() => {
        const ui = window.WaferCadV2Workstation.snapshot().ui;
        return ui.mobile === 'edit' && ui.domain === 'process';
      });
      assert.equal(await page.locator('.p-inspector').isVisible(), true);
      assert.equal(await page.locator('#operationType').isVisible(), true);
      await shot(page, 'mobile-add-opens-process');
      report.cases.push({ label: 'mobile-main-add-to-process', status: 'pass' });
      await page.locator('[data-action="return-results"]').click();
      await page.waitForFunction(
        () => window.WaferCadV2Workstation.snapshot().ui.mobile === 'view',
      );
      await page.locator('[data-action="view:mask"]').click();
      await waitForPaint(page);
      assert.equal(await page.locator('#maskPanel .v2-empty-hint').isVisible(), true);
      await shot(page, 'mobile-empty-mask');
      await page.locator('[data-action="mobile-section"]').click();
      await waitForPaint(page);
      assert.equal(await page.locator('#sectionPanel').isVisible(), true);
      await shot(page, 'mobile-empty-section-new-base');
      assert.deepEqual(errors, [], 'Mobile empty views exception-free');
    } finally {
      await context.close();
    }
  }

  report.status = 'passed';
  console.log(
    'EMPTY CANVAS: Main/Mask/Section, native Add/Draw/import, mobile and frame parity PASS',
  );
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill();
}
