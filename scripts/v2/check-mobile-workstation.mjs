// Production mobile Workstation contracts. Never replace visual baselines here.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-mobile');
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
// Dispatch a real emulated touch stream (not scrollTop assignment). A pointer
// on the page margin must scroll the document without invoking canvas gestures.
async function swipeDocumentUp(page, width, height) {
  const session = await page.context().newCDPSession(page);
  const x = width - 5;
  const startY = Math.round(height * 0.78);
  const distance = Math.round(height * 0.58);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY }],
    });
    for (let i = 1; i <= 10; i += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY - (distance * i) / 10 }],
      });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
  } finally {
    await session.detach();
  }
}

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
      const viewDefaults = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().local);
      for (const name of ['main', 'mask', 'section']) {
        assert.equal(viewDefaults[name].panEnabled, true, `${name}: default Pan`);
        assert.equal(viewDefaults[name].zoomEnabled, true, `${name}: default Zoom`);
      }
      assert.equal(viewDefaults.three.mode, 'rotate', '3D defaults to orbit');
      assert.equal(viewDefaults.three.zoomEnabled, true, '3D Zoom is available immediately');

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
        window.__mobileNavIdentity = document.querySelector(
          '.p-nav [data-action="domain:process"]',
        );
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
      assert.ok(dimensions.shell[0] >= 0);
      assert.ok(dimensions.inspector[0] >= dimensions.nav[1] - 1);
      assert.ok(dimensions.horizontalOverflow <= 1, 'No document horizontal overflow');
      assert.ok(dimensions.bodyScrollHeight > height + 2, 'Long Process form expands document');
      assert.ok(
        dimensions.panelScrollHeight <= dimensions.panelClientHeight + 2,
        'Process form must not own a second vertical scroll',
      );
      const editScrollContract = await page.evaluate(() => ({
        body: getComputedStyle(document.body).overflowY,
        panel: getComputedStyle(document.querySelector('.p-panel-content')).overflowY,
        document: getComputedStyle(document.scrollingElement).overflowY,
      }));
      assert.equal(editScrollContract.body, 'auto', 'Edit permits normal body scrolling');
      assert.equal(editScrollContract.panel, 'visible', 'Inspector content has no inner scroll');

      const label = page.locator('#layerName');
      await label.fill('Mobile draft remains');
      const beforeScroll = await nav.boundingBox();
      await page.evaluate(() => window.scrollTo(0, 0));
      await swipeDocumentUp(page, width, height);
      const documentOffset = await page.evaluate(() => document.scrollingElement.scrollTop);
      const afterScroll = await nav.boundingBox();
      assert.ok(documentOffset > 20, 'Touch swipe scrolls the document');
      assert.ok(afterScroll.y < beforeScroll.y - 20, 'Navigation follows document scroll');

      const touch = await processNav.boundingBox();
      assert.ok(
        touch.width >= 44 && touch.height >= 44,
        `Primary touch target >= 44px; measured ${touch.width} × ${touch.height}`,
      );
      // The Process pane also exposes a contextual View results action.
      // Exercise the persistent mobile chrome control explicitly.
      // Trigger the remote topbar without Playwright auto-scrolling it into view:
      // a real switch must preserve the offscreen document position.
      await page.locator('.p-mobile-return [data-action="return-results"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.equal(await stage.isVisible(), true);
      assert.equal(await editor.isVisible(), false);
      assert.ok(
        Math.abs(await page.evaluate(() => window.scrollY)) <= 1,
        'Canvas View starts at the top without a second document scroller',
      );
      assert.equal(
        await page.evaluate(
          () => window.__mobileCanvasIdentity === document.getElementById('mainCanvas'),
        ),
        true,
        'Canvas host retains identity between panes',
      );
      await page.locator('[data-action="show-editor"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.ok(
        Math.abs((await page.evaluate(() => window.scrollY)) - documentOffset) <= 3,
        'Edit returns to the previous document position',
      );
      assert.equal(await label.inputValue(), 'Mobile draft remains');
      assert.equal(
        await page.evaluate(
          () =>
            window.__mobileNavIdentity ===
            document.querySelector('.p-nav [data-action="domain:process"]'),
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
          () =>
            window.__mobileNavIdentity ===
            document.querySelector('.p-nav [data-action="domain:process"]'),
        ),
        true,
      );
      await page.setViewportSize({ width, height });
      await page.locator('.p-nav [data-action="domain:history"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.ok((await page.evaluate(() => window.scrollY)) <= 1, 'New domain begins at top');
      const historyScroll = page.locator('.p-history-scroll');
      await historyScroll.waitFor({ state: 'visible' });
      const historyLayout = await historyScroll.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return { height: bounds.height, overflow: getComputedStyle(node).overflowY };
      });
      assert.ok(historyLayout.height > 0);
      assert.equal(historyLayout.overflow, 'visible', 'History participates in document flow');
      await page.locator('.p-nav [data-action="domain:process"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.ok(
        Math.abs((await page.evaluate(() => window.scrollY)) - documentOffset) <= 3,
        'Returning to Process restores its own scroll position',
      );
      await page.locator('[data-action="process-mode:recipe"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.equal(
        await page.locator('#recipeStepsPane').evaluate((node) => getComputedStyle(node).overflowY),
        'visible',
        'Recipe steps scroll with the document',
      );
      await page.locator('[data-action="process-mode:code"]').evaluate((node) => node.click());
      await waitForPaint(page);
      assert.equal(
        await page.locator('#recipeCodePane').evaluate((node) => getComputedStyle(node).overflowY),
        'visible',
        'Recipe code pane does not create a second document scroller',
      );
      await page.locator('.p-nav [data-action="domain:history"]').evaluate((node) => node.click());
      await waitForPaint(page);

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
