// Native v2 layout acceptance at both desktop and mobile widths, after the
// approved Legacy source sunset. Retains Process overflow and mode assertions.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { selectScientificView } from './v2/desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const output = resolve('test-results/visual-diff/current-v2');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();

try {
  for (const { width, height, mobile } of [
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${base.replace(/\/$/, '')}/app.html?start=empty`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      if (mobile) await page.locator('.p-nav [data-action="show-editor"]').click();
      await page.locator('.p-nav [data-action="domain:process"]').click();
      await page.locator('#operationTools').waitFor({ state: 'visible' });

      // Verify the physical rendered widths rather than checking CSS text.
      // The mobile editor has one document scroller; an offscreen Apply button
      // is valid vertically, but must never clip horizontally.
      for (const operation of ['add', 'grow', 'etch', 'implant', 'electrical', 'record']) {
        await page.locator('#operationType').selectOption(operation);
        await waitForPaint(page);
        const bounds = await page.evaluate(() => {
          const panel = document.querySelector('.p-inspector');
          const content = panel.querySelector('.p-panel-content');
          const input = document.querySelector('#operationType');
          const apply = document.querySelector('#applyOperationBtn');
          const rect = (element) => {
            const { left, right, width } = element.getBoundingClientRect();
            return { left, right, width };
          };
          return {
            screen: document.documentElement.clientWidth,
            panel: rect(panel),
            input: rect(input),
            action: rect(apply),
            horizontalOverflow: content.scrollWidth - content.clientWidth,
            documentOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        for (const [label, box] of [
          ['Process panel', bounds.panel],
          ['Operation selector', bounds.input],
          ['Apply action', bounds.action],
        ]) {
          assert.ok(box.width > 12, `${operation}: ${label} is collapsed`);
          assert.ok(box.left >= bounds.panel.left - 3, `${operation}: ${label} overflows left`);
          assert.ok(box.right <= bounds.panel.right + 3, `${operation}: ${label} overflows right`);
        }
        assert.ok(bounds.panel.right <= width + 3, `${operation}: Process panel escapes viewport`);
        assert.ok(bounds.horizontalOverflow <= 3, `${operation}: Process panel clips content`);
        assert.ok(bounds.documentOverflow <= 3, `${operation}: document horizontally scrolls`);
      }
      await page.locator('#operationType').selectOption('add');
      await page.locator('[data-action="process-mode:recipe"]').click();
      assert.equal(
        await page.locator('[data-process-input-mode="recipe"]').getAttribute('aria-pressed'),
        'true',
      );
      await page.locator('[data-action="process-mode:step"]').click();
      assert.equal(
        await page.locator('[data-process-input-mode="manual"]').getAttribute('aria-pressed'),
        'true',
      );
      await page.screenshot({
        path: resolve(output, `process-${width}x${height}.png`),
        animations: 'disabled',
      });
      if (mobile) {
        await page.locator('.p-nav [data-action="return-results"]').click();
      } else {
        await selectScientificView(page, 'main', width);
      }
      await page.locator('#mainPanel').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#mainCanvas').evaluate((canvas) => canvas.width)) > 100);
      assert.deepEqual(errors, [], 'No production v2 browser exceptions');
      console.log(`Native v2 Process/Main layout contract passed at ${width}x${height}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
