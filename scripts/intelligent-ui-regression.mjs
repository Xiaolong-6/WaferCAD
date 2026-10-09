// Browser acceptance for the Intelligent UI shell. Exercises real workspace actions,
// inspector composition and responsive layout rather than only CSS snapshots.
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

await mkdir('test-results/intelligent-ui', { recursive: true });
const browser = await launchBrowser();
const cases = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, docked: true },
  { name: 'laptop', viewport: { width: 1024, height: 768 }, docked: false },
  { name: 'phone', viewport: { width: 390, height: 820 }, docked: false },
];

try {
  for (const { name, viewport, docked } of cases) {
    const { page, context } = await newUiPage(browser, { viewport });
    const errors = observePageErrors(page);
    try {
      await gotoWelcome(page);
      await page.locator('#welcomeEmptyBtn').click();
      await waitForAppReady(page);
      await waitForPaint(page);

      assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('intelligent-ui')), true);
      assert.equal(
        await page.locator('html').evaluate((node) => node.classList.contains('intelligent-ui-docked')),
        docked,
        name + ': adaptive inspector',
      );

      const action = page.locator('#intelligentActionButton');
      assert.equal(await action.count(), 1);
      await action.click();
      const palette = page.locator('#intelligentCommandPalette');
      await palette.waitFor({ state: 'visible' });
      const input = page.locator('#intelligentCommandInput');
      await input.fill('History');
      assert.equal(await palette.locator('[role="option"]').count(), 1);
      await input.press('Enter');
      await palette.waitFor({ state: 'hidden' });

      assert.equal(
        await page.locator('.workstation-rail-button[data-tool="snapshots"]').getAttribute('aria-pressed'),
        'true',
        name + ': command opens existing History interface',
      );

      await page.keyboard.press('Control+k');
      await palette.waitFor({ state: 'visible' });
      await input.fill('Mask view');
      await input.press('Enter');
      assert.equal(await page.locator('#maskPanel').isVisible(), true, 'command switches live view');

      await page.keyboard.press('Control+k');
      await palette.waitFor({ state: 'visible' });
      await input.press('Escape');
      await palette.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#toolPanel').evaluate((node) => node.classList.contains('open')), true, 'Escape preserves inspector');

      if (docked) {
        const boxes = await page.evaluate(() => {
          const panel = document.getElementById('toolPanel').getBoundingClientRect();
          const workspace = document.querySelector('.workspace').getBoundingClientRect();
          return { panelRight: panel.right, workspaceLeft: workspace.left, panelWidth: panel.width };
        });
        assert.ok(boxes.panelWidth >= 300, 'inspector is a usable width');
        assert.ok(boxes.workspaceLeft >= boxes.panelRight - 2, 'inspector must not cover canvas');

        await page.locator('#intelligentInspectorDockBtn').click();
        assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('intelligent-ui-docked')), false);
        await page.locator('#intelligentInspectorDockBtn').click();
        assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('intelligent-ui-docked')), true);
      }

      await page.screenshot({
        path: 'test-results/intelligent-ui/' + name + '.png',
        fullPage: true,
      });
      assert.deepEqual(errors, [], name + ': no page exceptions');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log('Intelligent UI: desktop, laptop and phone browser acceptance passed');
