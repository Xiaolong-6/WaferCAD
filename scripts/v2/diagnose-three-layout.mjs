// Read-only viewport/layout capture, not an acceptance gate.
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
const output = 'test-results/ui-v2-three-layout-probe';
await mkdir(output, { recursive: true });
const example = process.env.WAFERCAD_V2_EXAMPLE || 'metalens';
const width = Number(process.env.WAFERCAD_DIAGNOSTIC_WIDTH || 768);
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page } = await newUiPage(browser, { viewport: { width, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/app.html?start=example&example=${encodeURIComponent(example)}`);
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
  await page.locator('[data-action="view:three"]').click();
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
  );
  await waitForPaint(page);
  const sample = () =>
    page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector),
          r = node.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          cssHeight: getComputedStyle(node).height,
        };
      };
      return {
        host: box('#threeHost'),
        canvas: box('#threeHost canvas'),
        holder: box('#threeHost').height,
        container: box('#threePanel .v2-view-stage-container'),
        panel: box('#threePanel'),
        pixels: {
          width: document.querySelector('#threeHost canvas').width,
          height: document.querySelector('#threeHost canvas').height,
        },
        dataset: { ...document.getElementById('threeHost').dataset },
        camera: window.WaferCadV2Workstation.snapshot().threeCamera,
      };
    });
  const initial = await sample();
  await page.screenshot({ path: output + '/initial.png', fullPage: true });
  const phases = [];
  const record = async (phase) => {
    const value = await sample();
    phases.push({ phase, ...value });
    console.log(JSON.stringify({ phase, host: value.host, pixels: value.pixels }));
  };
  if (
    process.env.WAFERCAD_DIAGNOSTIC_INTERACT === '1' ||
    process.env.WAFERCAD_DIAGNOSTIC_DISPLAY_ONLY === '1'
  ) {
    const command = async (action) => {
      await page.locator(`[data-action="${action}"]`).click();
      await waitForPaint(page);
    };
    const modes = process.env.WAFERCAD_DIAGNOSTIC_INTERACT === '1' ? ['rotate', 'pan', 'zoom'] : [];
    for (const mode of modes) {
      if (mode !== 'rotate') await command(`tool:${mode}:three`);
      const box = await page.locator('#threeHost canvas').boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 32, y + 18, { steps: 6 });
      await page.mouse.up();
      await waitForPaint(page);
      await record(mode);
    }
    await command('fit:three');
    await record('fit');
    await command('settings:three');
    await page.locator('#threeBorders').check();
    await waitForPaint(page);
    await page.locator('#threeBorders').uncheck();
    await waitForPaint(page);
    await page.locator('#threeOpacityRange').focus();
    await page.keyboard.press('Home');
    await waitForPaint(page);
    await record('opacity-min');
    await page.keyboard.press('End');
    await waitForPaint(page);
    await record('opacity-max');
    await page.getByRole('button', { name: 'Close 3D display settings', exact: true }).click();
    await command('quality:three');
    await record('quality');
    await command('quality:three');
    await record('fast');
  }
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-action="maximize:three"]').click();
    await waitForPaint(page);
  }
  const restored = await sample();
  await page.waitForTimeout(600);
  const settled = await sample();
  await page.screenshot({ path: output + '/restored.png', fullPage: true });
  const afterCapture = await sample();
  await waitForPaint(page);
  await page.screenshot({ path: output + '/viewport.png' });
  let absoluteCanvas = null;
  if (process.env.WAFERCAD_DIAGNOSTIC_ABSOLUTE_CANVAS === '1') {
    // Isolated browser CSS experiment; does not write product styles or renderer code.
    await page.addStyleTag({ content: '.v2-three-host canvas { position: absolute; inset: 0; }' });
    await waitForPaint(page);
    absoluteCanvas = await sample();
    await page.screenshot({ path: output + '/absolute-canvas.png', fullPage: true });
  }
  const report = {
    result: 'diagnostic-only',
    example,
    width,
    initial,
    phases,
    restored,
    settled,
    afterCapture,
    absoluteCanvas,
    errors,
  };
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        example,
        width,
        initial: initial.host,
        restored: restored.host,
        settled: settled.host,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
