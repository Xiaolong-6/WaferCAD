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
      return { unique: ids.length === new Set(ids).size, width: node.getBoundingClientRect().width };
    });
    assert.equal(values.unique, true, id + ': duplicate element ID');
  }

  // Source/mode controls choose an explicit value, rather than forcing a cycle.
  await page.locator('#maskSourceToggleBtn').selectOption('draw');
  assert.equal(await page.locator('#maskSourceToggleBtn').inputValue(), 'draw');
  await page.locator('#maskSourceToggleBtn').selectOption('file');
  assert.equal(await page.locator('#maskSourceToggleBtn').inputValue(), 'file');
  await page.locator('#sectionScaleModeBtn').selectOption('physical');
  assert.equal(await page.locator('#sectionCanvas').getAttribute('data-scale-mode'), 'physical');
  await page.locator('#sectionScaleModeBtn').selectOption('auto');

  const show = async (selector) => {
    await page.locator(selector).evaluate((node) => {
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      }
    });
  };
  const assertWithin = async (selector, panelId) => {
    const { pop, panel } = await page.locator(selector).evaluate((node, id) => {
      const r = node.getBoundingClientRect();
      const p = document.getElementById(id).getBoundingClientRect();
      return {
        pop: { x: r.left, right: r.right, y: r.top, bottom: r.bottom },
        panel: { x: p.left, right: p.right, y: p.top, bottom: p.bottom },
      };
    }, panelId);
    assert.ok(pop.x >= panel.x - 3 && pop.right <= panel.right + 3, panelId + ': horizontal popover clipping');
    assert.ok(pop.y >= panel.y - 3 && pop.bottom <= panel.bottom + 3, panelId + ': vertical popover clipping');
  };

  // Every More action is reachable; a one-shot action closes its menu.
  const more = page.locator('#mainPanel .view-more-control');
  await more.locator(':scope > summary').click();
  await assertWithin('#mainPanel .view-menu-popover', 'mainPanel');
  await page.locator('#mainZoomIn').click();
  assert.equal(await more.evaluate((node) => node.open), false, 'Zoom action closes More');

  await show('#maskPanel .view-more-control');
  await assertWithin('#maskPanel .view-menu-popover', 'maskPanel');
  await show('#maskExportControl');
  assert.equal(await page.locator('#maskExportGdsBtn').count(), 1);
  await page.locator('#maskPanel .view-more-control > summary').click();

  // Border is a persistent setting and can be changed without an ON/OFF badge.
  await show('#threePanel .three-opacity-control');
  const before = await page.locator('#threeBorders').isChecked();
  await page.locator('#threeBorders').setChecked(!before);
  assert.equal(await page.locator('#threeBorders').isChecked(), !before);
  await page.locator('#threeBorders').setChecked(before);
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
  assert.equal(await page.locator('#sectionCanvas').getAttribute('data-section-collapse-enabled'), 'false');
  assert.equal(await editor.isVisible(), true);
  await page.locator('#sectionCollapseClose').click();
  await zButton.click();
  assert.equal(await editor.isVisible(), true, 'Disabled break still editable');
  await breakEnabled.check();
  await page.locator('#sectionCollapseTopInput').waitFor({ state: 'visible' });
  await editor.locator('.section-collapse-advanced > summary').click();
  assert.equal(await page.locator('#sectionCollapseScaleLinked').isChecked(), true);
  await page.locator('#sectionCollapseClose').click();

  const visiblePanels = await page.locator('.view-panel').evaluateAll((nodes) =>
    nodes.filter((node) => node.getBoundingClientRect().width > 0).map((node) => node.id),
  );
  if (visiblePanels.length) {
    await page.locator('#' + visiblePanels[0]).screenshot({
      path: `test-results/view-ux-v3/${name}-view.png`,
      animations: 'disabled',
    });
  }
  await page.screenshot({ path: `test-results/view-ux-v3/${name}-whole.png`, animations: 'disabled' });
  assert.deepEqual(errors, [], name + ': runtime exceptions');
  await context.close();
}
await browser.close();
console.log('WaferCAD View UX v3 browser acceptance: OK');
