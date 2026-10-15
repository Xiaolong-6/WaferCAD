// Production-only docking acceptance. Requires local serve-v2.mjs and real Chromium.
// Screenshots are review evidence; this test does not approve visual baselines.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-desktop-docking');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const views = ['main', 'mask', 'three', 'section'];

function intersect(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}
async function layoutState(page) {
  return page.evaluate(() => window.WaferCadV2Workstation.snapshot().ui.desktopLayout);
}
async function measure(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.p-canvases');
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      panels: [...stage.querySelectorAll('.p-view:not([hidden])')].map((node) => {
        const r = node.getBoundingClientRect();
        return {
          name: node.dataset.view,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      }),
      stageWidth: stage.getBoundingClientRect().width,
    };
  });
}
async function assertGrid(page, expected) {
  const { panels: visible, documentOverflow } = await measure(page);
  assert.equal(visible.length, expected);
  assert.ok(documentOverflow <= 1, 'Desktop viewport has no horizontal overflow');
  for (const [i, a] of visible.entries()) {
    assert.ok(a.width > 0 && a.height > 0, 'Every visible panel has positive dimensions');
    for (const b of visible.slice(i + 1))
      assert.ok(intersect(a, b) <= 2, 'Panels do not overlap: ' + a.name + ' / ' + b.name);
  }
}
async function setTemplate(page, id) {
  const header = page.locator('#mainPanel [data-slot="view.main.header"]');
  await header.focus();
  await header.press('Alt+Enter');
  const cell = page.locator('.v2-dock-cell[data-dock-preset="' + id + '"][data-dock-slot="0"]');
  await cell.waitFor({ state: 'visible' });
  assert.equal(await cell.isDisabled(), false, 'Template ' + id + ' must fit this viewport');
  await cell.click();
  await waitForPaint(page);
  assert.equal((await layoutState(page)).preset, id);
}
async function verifyIdentity(page) {
  assert.equal(
    await page.evaluate(
      () =>
        window.__dockOriginalMain === document.querySelector('#mainCanvas') &&
        window.__dockOriginalMask === document.querySelector('#maskCanvas') &&
        window.__dockOriginalSection === document.querySelector('#sectionCanvas') &&
        window.__dockOriginalThree === document.querySelector('#threeHost'),
    ),
    true,
  );
}
try {
  for (const width of [1440, 1024, 821]) {
    const { context, page } = await newUiPage(browser, {
      viewport: { width, height: 960 },
    });
    try {
      const errors = observePageErrors(page);
      await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 120000,
      });
      await page.waitForFunction(
        () => document.querySelector('#threeHost')?.dataset.renderState === 'ready',
        null,
        {
          timeout: 60000,
        },
      );
      await waitForPaint(page);
      const controls = await page
        .locator('.p-desktop-dock-actions [data-action]')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.action));
      assert.deepEqual(controls, ['dock:overview', ...views.map((view) => 'dock:view:' + view)]);
      assert.equal(await page.locator('.p-section-dock-actions:visible').count(), 0);
      await assertGrid(page, 4);
      await page.evaluate(() => {
        window.__dockOriginalMain = document.querySelector('#mainCanvas');
        window.__dockOriginalMask = document.querySelector('#maskCanvas');
        window.__dockOriginalSection = document.querySelector('#sectionCanvas');
        window.__dockOriginalThree = document.querySelector('#threeHost');
        window.__dockOriginalModel = JSON.stringify(window.WaferCadV2Workstation.snapshot().model);
      });
      await page.screenshot({
        path: resolve(output, 'overview-' + width + '.png'),
      });
      await page.locator('[data-action="dock:close:mask"]').click();
      await assertGrid(page, 3);
      assert.equal(
        await page.locator('[data-action="dock:view:mask"]').getAttribute('aria-pressed'),
        'false',
      );
      await page.locator('[data-action="dock:view:mask"]').click();
      await assertGrid(page, 4);
      await verifyIdentity(page);
      await page.locator('#threePanel [data-action="maximize:three"]').click();
      await assertGrid(page, 1);
      assert.equal((await layoutState(page)).maximized, 'three');
      await page.locator('#threePanel [data-action="maximize:three"]').click();
      await assertGrid(page, 4);
      assert.equal((await layoutState(page)).maximized, null);
      const unchanged = await page.evaluate(
        () =>
          JSON.stringify(window.WaferCadV2Workstation.snapshot().model) ===
          window.__dockOriginalModel,
      );
      assert.equal(unchanged, true, 'Docking must not mutate the physical model');
      await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
      await assertGrid(page, 4);

      // Presets and drag/keyboard acceptance run once at comfortable desktop width.
      if (width === 1440) {
        for (const id of [
          'four-left',
          'four-right',
          'four-top',
          'four-bottom',
          'four-columns',
          'four-rows',
          'four-corner',
          'four-grid',
        ]) {
          await setTemplate(page, id);
          await assertGrid(page, 4);
          if (id === 'four-columns') {
            const compact = await page.locator('#sectionPanel').evaluate((panel) => ({
              compact: panel.querySelector('.v2-section-body').dataset.compactLegend,
              sectionWidth: panel.querySelector('#sectionCanvas').getBoundingClientRect().width,
              legendHidden: panel.querySelector('.v2-section-legend').hidden,
            }));
            assert.equal(
              compact.compact,
              'true',
              'Four-column Section uses compact Layers presentation',
            );
            assert.equal(
              compact.legendHidden,
              true,
              'Narrow Section defaults to a full-width slice',
            );
            assert.ok(compact.sectionWidth >= 120, 'Section keeps a usable slice width');
            const beforeLayers = await page.evaluate(
              () => window.WaferCadV2Workstation.snapshot().sectionLayersVisible,
            );
            await page
              .locator('#sectionPanel [data-action="legend"]')
              .evaluate((button) => button.click());
            await waitForPaint(page);
            assert.equal(
              await page
                .locator('#sectionPanel .v2-section-legend')
                .evaluate((node) => node.hidden),
              false,
              'Layers can be temporarily opened',
            );
            await page
              .locator('#sectionPanel [data-action="legend"]')
              .evaluate((button) => button.click());
            assert.equal(
              await page.evaluate(
                () => window.WaferCadV2Workstation.snapshot().sectionLayersVisible,
              ),
              beforeLayers,
              'Compact Layers presentation never changes saved visibility',
            );
          }
          await page.screenshot({ path: resolve(output, id + '.png') });
        }
        const ratiosBefore = (await layoutState(page)).tracks['four-grid'];
        const divider = page.locator('.v2-dock-divider-columns').first();
        await divider.waitFor({ state: 'visible' });
        const rect = await divider.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width / 2 + 35, rect.y + rect.height / 2, {
          steps: 5,
        });
        await page.mouse.up();
        await page.waitForFunction(() =>
          Boolean(window.WaferCadV2Workstation.snapshot().ui.desktopLayout.tracks['four-grid']),
        );
        assert.notDeepEqual((await layoutState(page)).tracks['four-grid'], ratiosBefore);
        await verifyIdentity(page);

        // Real pointer drag from titlebar onto another panel swaps slots.
        const beforeSwap = (await layoutState(page)).order;
        const source = await page.locator('#mainPanel .v2-view-title').boundingBox();
        const target = await page.locator('#maskPanel').boundingBox();
        await page.mouse.move(source.x + 18, source.y + source.height / 2);
        await page.mouse.down();
        // Drop near the lower Mask canvas, clear of the top Snap palette.
        await page.mouse.move(target.x + target.width - 50, target.y + target.height - 45, {
          steps: 12,
        });
        await page.mouse.up();
        await waitForPaint(page);
        assert.notDeepEqual((await layoutState(page)).order, beforeSwap);
        await verifyIdentity(page);

        await page.locator('[data-action="dock:close:section"]').click();
        for (const id of [
          'three-left',
          'three-right',
          'three-top',
          'three-bottom',
          'three-columns',
          'three-rows',
        ]) {
          await setTemplate(page, id);
          await assertGrid(page, 3);
          await page.screenshot({ path: resolve(output, id + '.png') });
        }
        await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
      }
      assert.deepEqual(errors, [], 'No browser page errors during docking');
    } finally {
      await context.close();
    }
  }
  // A compact viewport must still use its approved five-action bottom navigation.
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const errors = observePageErrors(page);
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    assert.equal(await page.locator('.p-desktop-dock-actions:visible').count(), 0);
    assert.equal(await page.locator('.v2-dock-divider:visible').count(), 0);
    assert.equal(await page.locator('.p-nav [data-action]').count(), 5);
    assert.equal(
      await page.locator('.p-nav').evaluate((node) => getComputedStyle(node).position),
      'fixed',
    );
    await page.screenshot({ path: resolve(output, 'mobile-unchanged-390.png') });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log('Desktop docking acceptance passed; evidence:', output);
} finally {
  await browser.close();
}
