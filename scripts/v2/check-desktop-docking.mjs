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
async function assertDesktopShell(page) {
  const shell = await page.evaluate(() => {
    const sidebar = document.querySelector('.p-sidebar');
    const workspace = document.querySelector('.p-workspace');
    const toolbar = workspace?.querySelector('.p-desktop-dock-actions');
    const right = workspace?.getBoundingClientRect();
    const nav = toolbar?.getBoundingClientRect();
    return {
      parenthood:
        sidebar?.contains(document.querySelector('.p-topbar')) &&
        sidebar?.contains(document.querySelector('.p-nav')) &&
        sidebar?.contains(document.querySelector('.p-inspector')) &&
        workspace?.contains(document.querySelector('.p-viewbar')) &&
        workspace?.contains(document.querySelector('.p-canvases')) &&
        workspace?.contains(document.querySelector('.p-status')),
      sidebarWidth: sidebar?.getBoundingClientRect().width,
      workspaceWidth: right?.width,
      centered:
        right && nav ? Math.abs((right.left + right.right - nav.left - nav.right) / 2) : Infinity,
      projectInSidebar: Boolean(sidebar?.querySelector('[data-slot="topbar.project"]')),
      outerOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(shell.parenthood, true, 'Desktop Shell owns two stable columns');
  assert.ok(shell.sidebarWidth >= 280 && shell.workspaceWidth >= 300);
  assert.ok(shell.centered <= 2, 'View navigation is centered inside right column');
  assert.ok(shell.projectInSidebar);
  assert.ok(shell.outerOverflow <= 1);
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
      await assertDesktopShell(page);
      if (width === 1440) {
        await page.locator('.p-topbar [data-action="hide-editor"]').click();
        assert.equal(await page.locator('.p-sidebar:visible').count(), 0);
        await page.locator('.p-viewbar [data-action="expand-empty"]').click();
        await assertDesktopShell(page);
        await assertGrid(page, 4);
      }
      // Four window titlebar glyphs must match the canonical viewbar sprite.
      const titleIcons = await page.evaluate(() => {
        const expected = { main: 'main', mask: 'mask', three: 'cube', section: 'section' };
        return Object.entries(expected).map(([view, icon]) => {
          const panel = document.querySelector('#' + view + 'Panel');
          return {
            view,
            actual: panel.querySelector('.v2-dock-title-icon use')?.getAttribute('href'),
            expected: '#p-icon-' + icon,
            closeAtRight: panel.querySelector('.v2-dock-close')?.nextElementSibling == null,
          };
        });
      });
      for (const { view, actual, expected, closeAtRight } of titleIcons) {
        assert.equal(actual, expected, 'Titlebar uses matching ' + view + ' icon');
        assert.equal(closeAtRight, true, 'X is rightmost for ' + view);
      }
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
      // Workflow Mask must reopen a previously closed view and maximize it.
      await page.locator('.p-nav [data-action="domain:mask"]').click();
      await assertGrid(page, 1);
      assert.equal((await layoutState(page)).maximized, 'mask');
      assert.equal((await layoutState(page)).visible.includes('mask'), true);
      await page.locator('.p-nav [data-action="domain:mask"]').click();
      assert.equal(
        (await layoutState(page)).maximized,
        'mask',
        'Repeated Mask navigation does not restore',
      );
      await page.locator('#maskPanel [data-action="maximize:mask"]').click();
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
        const dividerAppearance = await divider.evaluate((node) => {
          const oldHandle = document.querySelector('.p-divider');
          const current = getComputedStyle(node, '::after');
          const baseline = getComputedStyle(oldHandle, '::after');
          return {
            currentWidth: current.width,
            currentHeight: current.height,
            baselineWidth: baseline.width,
            baselineHeight: baseline.height,
            background: current.backgroundColor,
            baselineBackground: baseline.backgroundColor,
          };
        });
        assert.equal(dividerAppearance.currentWidth, dividerAppearance.baselineWidth);
        assert.equal(dividerAppearance.currentHeight, dividerAppearance.baselineHeight);
        assert.equal(dividerAppearance.background, dividerAppearance.baselineBackground);
        await divider.waitFor({ state: 'visible' });
        const rect = await divider.boundingBox();
        // The row and column splitter handles cross at their centers. Grab
        // an unambiguous quarter-point rather than the overlapping intersection.
        const columnX = rect.x + rect.width / 2;
        const columnY = rect.y + rect.height / 4;
        assert.equal(
          await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest('.v2-dock-divider')?.dataset.dockAxis,
            { x: columnX, y: columnY },
          ),
          'columns',
          'Pointer must actually hit the column resize handle',
        );
        await page.mouse.move(columnX, columnY);
        await page.mouse.down();
        await page.mouse.move(columnX + 35, columnY, { steps: 5 });
        // Check the splitter WHILE the button is held, not only after release.
        // CSS grid tracks move immediately; absolute splitters must move too.
        const columnAlignment = await page.evaluate(() => {
          const rectOf = (id) => document.querySelector('#' + id + 'Panel').getBoundingClientRect();
          const main = rectOf('main');
          const mask = rectOf('mask');
          const three = rectOf('three');
          const section = rectOf('section');
          const handles = [...document.querySelectorAll('.v2-dock-divider-columns')];
          return {
            expected: [(main.right + mask.left) / 2, (three.right + section.left) / 2],
            gridColumns: document.querySelector('.p-canvases').style.gridTemplateColumns,
            savedTracks:
              window.WaferCadV2Workstation.snapshot().ui.desktopLayout.tracks['four-grid'],
            handles: handles.map((handle) => ({
              left: handle.style.left,
              axis: handle.dataset.dockAxis,
              index: handle.dataset.dockIndex,
            })),
            observed: handles.map((handle) => {
              const r = handle.getBoundingClientRect();
              return r.left + r.width / 2;
            }),
          };
        });
        assert.ok(
          columnAlignment.observed.length > 0,
          'Column splitter remains present while dragging',
        );
        for (const position of columnAlignment.observed) {
          for (const boundary of columnAlignment.expected)
            assert.ok(
              Math.abs(position - boundary) < 3,
              'Column splitter must follow live Grid boundary',
            );
        }
        await page.screenshot({ path: resolve(output, 'divider-mid-drag-columns.png') });
        console.log(
          'Live column splitter measurement',
          JSON.stringify({
            initial: rect.x + rect.width / 2,
            ...columnAlignment,
          }),
        );
        assert.ok(
          columnAlignment.observed[0] > rect.x + rect.width / 2 + 12,
          'Column splitter visibly moves during drag',
        );
        await page.mouse.up();
        await page.waitForFunction(() =>
          Boolean(window.WaferCadV2Workstation.snapshot().ui.desktopLayout.tracks['four-grid']),
        );
        await waitForPaint(page);
        assert.notDeepEqual((await layoutState(page)).tracks['four-grid'], ratiosBefore);
        await verifyIdentity(page);

        const rowDivider = page.locator('.v2-dock-divider-rows').first();
        await rowDivider.waitFor({ state: 'visible' });
        const rowRect = await rowDivider.boundingBox();
        assert.ok(rowRect, 'Row splitter remains available after a column resize');
        const rowX = rowRect.x + rowRect.width / 4;
        const rowY = rowRect.y + rowRect.height / 2;
        assert.equal(
          await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest('.v2-dock-divider')?.dataset.dockAxis,
            { x: rowX, y: rowY },
          ),
          'rows',
          'Pointer must actually hit the row resize handle',
        );
        await page.mouse.move(rowX, rowY);
        await page.mouse.down();
        await page.mouse.move(rowX, rowY + 28, { steps: 5 });
        const rowAlignment = await page.evaluate(() => {
          const rectOf = (id) => document.querySelector('#' + id + 'Panel').getBoundingClientRect();
          const main = rectOf('main');
          const mask = rectOf('mask');
          const three = rectOf('three');
          const section = rectOf('section');
          return {
            expected: [(main.bottom + three.top) / 2, (mask.bottom + section.top) / 2],
            observed: [...document.querySelectorAll('.v2-dock-divider-rows')].map((handle) => {
              const r = handle.getBoundingClientRect();
              return r.top + r.height / 2;
            }),
          };
        });
        assert.ok(rowAlignment.observed.length > 0, 'Row splitter remains present while dragging');
        for (const position of rowAlignment.observed) {
          for (const boundary of rowAlignment.expected)
            assert.ok(
              Math.abs(position - boundary) < 3,
              'Row splitter must follow live Grid boundary',
            );
        }
        assert.ok(rowAlignment.observed[0] > rowRect.y + rowRect.height / 2 + 12);
        await page.screenshot({ path: resolve(output, 'divider-mid-drag-rows.png') });
        await page.mouse.up();
        await verifyIdentity(page);

        // Real pointer drag from the EMPTY header area must swap slots without
        // squeezing the tool buttons toward the title on wide desktops.
        const beforeSwap = (await layoutState(page)).order;
        const headerGap = await page.locator('#mainPanel').evaluate((panel) => {
          const title = panel.querySelector('.v2-view-title').getBoundingClientRect();
          const controls = panel
            .querySelector('.v2-view-actions .p-toolbar')
            .getBoundingClientRect();
          const header = panel.querySelector('.p-view-head').getBoundingClientRect();
          return { left: title.right, right: controls.left, y: header.y + header.height / 2 };
        });
        assert.ok(headerGap.right - headerGap.left > 12, 'Window titlebar has an empty drag area');
        const target = await page.locator('#maskPanel').boundingBox();
        await page.mouse.move((headerGap.left + headerGap.right) / 2, headerGap.y);
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
    assert.equal(
      await page.locator('.p-sidebar').evaluate((node) => getComputedStyle(node).display),
      'contents',
      'Mobile flattens desktop hosts without a second scroll container',
    );
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
