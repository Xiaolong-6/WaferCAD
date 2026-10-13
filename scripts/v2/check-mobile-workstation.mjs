// Production mobile Workstation contracts. Never replace visual baselines here.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-mobile');
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
const cases = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

try {
  for (const { width, height } of cases) {
    const { context, page } = await newUiPage(browser, {
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    try {
      const errors = observePageErrors(page);
      await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 120000,
      });
      await waitForPaint(page);

      const root = page.locator('.p-workbench');
      const editor = page.locator('.p-inspector');
      const stage = page.locator('.p-stage');
      const nav = page.locator('.p-nav');
      const mainCanvas = page.locator('#mainCanvas');
      await mainCanvas.waitFor({ state: 'visible' });
      await page.evaluate(() => {
        window.__mobileCanvasIdentity = document.querySelector('#mainCanvas');
      });
      assert.equal(await root.getAttribute('data-mobile'), 'view');
      assert.equal(await stage.isVisible(), true);
      assert.equal(await editor.isVisible(), false);

      await page.locator('[data-action="show-editor"]').click();
      await waitForPaint(page);
      assert.equal(await root.getAttribute('data-mobile'), 'edit');
      assert.equal(await editor.isVisible(), true);
      assert.equal(await stage.isVisible(), false);
      assert.equal(await nav.isVisible(), true);

      const processNav = page.locator('.p-nav [data-action="domain:process"]');
      await processNav.click();
      assert.equal(await page.locator('#operationTools').isVisible(), true);
      await page.evaluate(() => {
        window.__mobileNavIdentity = document.querySelector('.p-nav [data-action="domain:process"]');
      });

      const dimensions = await page.evaluate(() => {
        const shell = document.querySelector('.p-workbench').getBoundingClientRect();
        const navigation = document.querySelector('.p-nav').getBoundingClientRect();
        const inspector = document.querySelector('.p-inspector').getBoundingClientRect();
        const panel = document.querySelector('.p-panel-content');
        return {
          shell: [shell.top, shell.bottom],
          nav: [navigation.top, navigation.bottom],
          inspector: [inspector.top, inspector.bottom],
          available: window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          bodyScrollHeight: document.body.scrollHeight,
          panelScrollHeight: panel.scrollHeight,
          panelClientHeight: panel.clientHeight,
        };
      });
      assert.ok(dimensions.shell[0] >= 0 && dimensions.shell[1] <= height + 2);
      assert.ok(dimensions.inspector[0] >= dimensions.nav[1] - 1);
      assert.ok(dimensions.inspector[1] <= height + 1);
      assert.ok(dimensions.horizontalOverflow <= 1, 'No document horizontal overflow');
      assert.ok(dimensions.bodyScrollHeight <= height + 2, 'Document must not own editor scroll');
      assert.ok(
        dimensions.panelScrollHeight > dimensions.panelClientHeight,
        'Process form scrolls inside the inspector',
      );

      const label = page.locator('#layerName');
      await label.fill('Mobile draft remains');
      const beforeScroll = await nav.boundingBox();
      await page.locator('.p-panel-content').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await waitForPaint(page);
      const afterScroll = await nav.boundingBox();
      assert.ok(Math.abs(afterScroll.y - beforeScroll.y) <= 1, 'Navigation stays fixed');

      const touch = await processNav.boundingBox();
      assert.ok(touch.width >= 44 && touch.height >= 44, 'Primary touch target >= 44px');
      await page.locator('[data-action="return-results"]').click();
      await waitForPaint(page);
      assert.equal(await stage.isVisible(), true);
      assert.equal(await editor.isVisible(), false);
      assert.equal(
        await page.evaluate(() => window.__mobileCanvasIdentity === document.querySelector('#mainCanvas')),
        true,
        'Canvas host retains identity between panes',
      );
      await page.locator('[data-action="show-editor"]').click();
      assert.equal(await label.inputValue(), 'Mobile draft remains');
      assert.equal(
        await page.evaluate(
          () => window.__mobileNavIdentity === document.querySelector('.p-nav [data-action="domain:process"]'),
        ),
        true,
        'Navigation control retains identity after shell renders',
      );

      // A height-only resize (keyboard/browser chrome) must not recreate controls.
      await page.setViewportSize({ width, height: height - 90 });
      await waitForPaint(page);
      assert.equal(await root.getAttribute('data-mobile'), 'edit');
      assert.equal(await label.inputValue(), 'Mobile draft remains');
      assert.equal(
        await page.evaluate(
          () => window.__mobileNavIdentity === document.querySelector('.p-nav [data-action="domain:process"]'),
        ),
        true,
      );
      await page.setViewportSize({ width, height });
      await page.locator('.p-nav [data-action="domain:history"]').click();
      await waitForPaint(page);
      const historyScroll = page.locator('.p-history-scroll');
      await historyScroll.waitFor({ state: 'visible' });
      const historyLayout = await historyScroll.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return { height: bounds.height, overflow: getComputedStyle(node).overflowY };
      });
      assert.ok(historyLayout.height > 0);
      assert.equal(historyLayout.overflow, 'auto');

      await page.screenshot({
        path: resolve(output, `mobile-${width}x${height}-history.png`),
      });
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      console.log(`Mobile Workstation ${width}x${height}: OK`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
