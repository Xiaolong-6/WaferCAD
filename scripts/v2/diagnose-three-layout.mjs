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
  await page.goto(`${base}/app-v2-workstation.html?example=${encodeURIComponent(example)}`);
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
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-action="maximize:three"]').click();
    await waitForPaint(page);
  }
  const restored = await sample();
  await page.waitForTimeout(600);
  const settled = await sample();
  await page.screenshot({ path: output + '/restored.png', fullPage: true });
  const report = { result: 'diagnostic-only', example, width, initial, restored, settled, errors };
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
