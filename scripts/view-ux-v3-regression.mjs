// Four-view UX v3 acceptance: real browser interactions, accessible actions,
// responsive overflow, Z break and no accidental geometry mutations.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import {
  gotoWelcome,
  launchBrowser,
  newUiPage,
  observePageErrors,
  waitForAppReady,
  waitForPaint,
} from './test-helpers/ui.mjs';

await mkdir('test-results/view-ux-v3', { recursive: true });
const browser = await launchBrowser();
const cases = [
  { name: 'desktop', viewport: { width: 1440, height: 960 } },
  { name: 'split', viewport: { width: 920, height: 720 } },
  { name: 'phone', viewport: { width: 390, height: 820 } },
];

for (const { name, viewport } of cases) {
  const { page, context } = await newUiPage(browser, { viewport });
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  await page.locator('#welcomeEmptyBtn').click();
  await waitForAppReady(page);
  await waitForPaint(page);

  for (const id of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
    const panel = page.locator('#' + id);
    assert.equal(await panel.locator('.view-more-control').count(), 1, id + ': More control');
    const values = await panel.evaluate((node) => {
      const ids = [...node.querySelectorAll('[id]')].map((item) => item.id);
      return {
        unique: ids.length === new Set(ids).size,
        width: node.getBoundingClientRect().width,
      };
    });
    assert.equal(values.unique, true, id + ': duplicate element ID');
  }

  // Real workstation tabs are required in compact viewports: hidden
  // controls must be made visible through their public navigation.
  const activateView = async (view) => {
    await page.locator(`.workstation-view-tabs > button[data-view="${view}"]`).click();
    await page
      .locator(`#${{ main: 'mainPanel', mask: 'maskPanel', three: 'threePanel' }[view]}`)
      .waitFor({ state: 'visible' });
    // The ResizeObserver can relocate lower-priority tools after view switches.
    // Wait for the layout to settle before probing their actual user entry path.
    await waitForPaint(page);
    await waitForPaint(page);
  };

  // Source/mode controls choose an explicit value, rather than forcing a cycle.
  await activateView('mask');
  await page.locator('#maskSourceToggleBtn').selectOption('draw');
  assert.equal(await page.locator('#maskSourceToggleBtn').inputValue(), 'draw');
  await page.locator('#maskSourceToggleBtn').selectOption('file');
  assert.equal(await page.locator('#maskSourceToggleBtn').inputValue(), 'file');
  if (await page.locator('#sectionBody').isHidden()) {
    await page.locator('.workstation-section-collapse').click();
  }
  await page.locator('#sectionScaleModeBtn').selectOption('physical');
  assert.equal(await page.locator('#sectionCanvas').getAttribute('data-scale-mode'), 'physical');
  await page.locator('#sectionScaleModeBtn').selectOption('auto');

  const assertWithin = async (selector, panelId) => {
    const { pop, panel } = await page.locator(selector).evaluate((node, id) => {
      const r = node.getBoundingClientRect();
      const p = document.getElementById(id).getBoundingClientRect();
      return {
        pop: { x: r.left, right: r.right, y: r.top, bottom: r.bottom },
        panel: { x: p.left, right: p.right, y: p.top, bottom: p.bottom },
      };
    }, panelId);
    assert.ok(
      pop.x >= panel.x - 3 && pop.right <= panel.right + 3,
      panelId + ': horizontal popover clipping',
    );
    assert.ok(
      pop.y >= panel.y - 3 && pop.bottom <= panel.bottom + 3,
      panelId + ': vertical popover clipping',
    );
  };

  // Every More action is reachable; a one-shot action closes its menu.
  await activateView('main');
  const more = page.locator('#mainPanel .view-more-control');
  await more.locator(':scope > summary').click();
  await assertWithin('#mainPanel .view-menu-popover', 'mainPanel');
  await page.locator('#mainZoomIn').click();
  assert.equal(await more.evaluate((node) => node.open), false, 'Zoom action closes More');

  await activateView('mask');
  await page.locator('#maskPanel .view-more-control > summary').click();
  await assertWithin('#maskPanel .view-menu-popover', 'maskPanel');
  await page.locator('#maskExportControl > summary').click();
  assert.equal(await page.locator('#maskExportGdsBtn').count(), 1);
  await page.locator('#maskPanel .view-more-control > summary').click();

  // Border is a persistent setting and can be changed without an ON/OFF badge.
  await activateView('three');
  // In compact workspaces Display is deliberately reparented under More.
  // Exercise that actual navigation rather than clicking a hidden summary.
  const threeDisplay = page.locator('#threePanel .three-opacity-control');
  await page.waitForFunction(() => {
    const panel = document.getElementById('threePanel');
    const control = panel?.querySelector('.three-opacity-control');
    const width = panel?.getBoundingClientRect().width || 0;
    return width > 0 && Boolean(control?.closest('.view-overflow-secondary')) === width < 510;
  });
  const more3d = page.locator('#threePanel .view-more-control');
  if (await threeDisplay.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))) {
    if (!(await more3d.evaluate((node) => node.open))) {
      await more3d.locator(':scope > summary').click();
    }
  }
  const summary3d = threeDisplay.locator(':scope > summary');
  assert.equal(
    await summary3d.isVisible(),
    true,
    '3D Display must be reachable from its header or open More',
  );
  await summary3d.click();
  const before = await page.locator('#threeBorders').isChecked();
  await page.locator('#threeBorderControl').click();
  assert.equal(await page.locator('#threeBorders').isChecked(), !before);
  await page.locator('#threeBorderControl').click();
  await page.locator('#threePanel .three-opacity-control > summary').click();

  // The Z-axis break header button is an editor entry. It always opens, even
  // while the display break is disabled. Underlying physical model stays intact.
  const zButton = page.locator('#sectionCollapseAxisBtn');
  await zButton.click();
  const editor = page.locator('#sectionCollapseEditor');
  await editor.waitFor({ state: 'visible' });
  await assertWithin('#sectionCollapseEditor', 'sectionPanel');
  const breakEnabled = page.locator('#sectionCollapseEnabled');
  await breakEnabled.uncheck();
  assert.equal(
    await page.locator('#sectionCanvas').getAttribute('data-section-collapse-enabled'),
    'false',
  );
  assert.equal(await editor.isVisible(), true);
  await page.locator('#sectionCollapseClose').click();
  await zButton.click();
  assert.equal(await editor.isVisible(), true, 'Disabled break still editable');
  await breakEnabled.check();
  await page.locator('#sectionCollapseTopInput').waitFor({ state: 'visible' });
  await editor.locator('.section-collapse-advanced > summary').click();
  assert.equal(await page.locator('#sectionCollapseScaleLinked').isChecked(), true);
  await page.locator('#sectionCollapseClose').click();

  const visiblePanels = await page
    .locator('.view-panel')
    .evaluateAll((nodes) =>
      nodes.filter((node) => node.getBoundingClientRect().width > 0).map((node) => node.id),
    );
  if (visiblePanels.length) {
    await page.locator('#' + visiblePanels[0]).screenshot({
      path: `test-results/view-ux-v3/${name}-view.png`,
      animations: 'disabled',
    });
  }
  await page.screenshot({
    path: `test-results/view-ux-v3/${name}-whole.png`,
    animations: 'disabled',
  });
  assert.deepEqual(errors, [], name + ': runtime exceptions');
  await context.close();
}
await browser.close();
console.log('WaferCAD View UX v3 browser acceptance: OK');
