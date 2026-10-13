// Contextual Tooltip acceptance: current production entry, real mouse and keyboard.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, observePageErrors } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-tooltip-review');
await mkdir(output, { recursive: true });
const report = { cases: [], errors: [] };
const browser = await launchBrowser();
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      report.errors.push(...observePageErrors(page));
      await page.goto(`${base}/app.html?start=empty`);
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const mobile = width <= 820;
      const mode = page.locator(mobile ? '[data-action="domain:project"]' : '[data-action="mode:single"]');
      assert.equal(await mode.getAttribute('data-help'), mobile ? 'shell.navigation' : 'shell.single');
      assert.equal(
        await mode.getAttribute('title'),
        null,
        'opted-in controls have no native title',
      );
      await mode.hover();
      await page.locator('.wc-context-tooltip:visible').waitFor({ timeout: 5000 });
      assert.match(
        await page.locator('.wc-context-tooltip').innerText(),
        mobile ? /Workspace panel/ : /Single view/,
      );
      assert.equal(await page.locator('.wc-context-tooltip').getAttribute('role'), 'tooltip');
      assert.equal(await mode.getAttribute('aria-describedby'), 'wc-context-tooltip');
      assert.equal(
        await page
          .locator('.wc-context-tooltip')
          .evaluate((node) => getComputedStyle(node).pointerEvents),
        'none',
      );
      await page.mouse.move(0, 0);
      await page.locator('.wc-context-tooltip').waitFor({ state: 'hidden' });
      assert.equal(await mode.getAttribute('aria-describedby'), null);
      await mode.focus();
      await page.locator('.wc-context-tooltip:visible').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.wc-context-tooltip').waitFor({ state: 'hidden' });
      await mode.evaluate((node) => node.blur());
      await mode.focus();
      await page.locator('.wc-context-tooltip:visible').waitFor();
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.locator('.wc-context-tooltip').waitFor({ state: 'hidden' });
      assert.deepEqual(
        await page
          .locator('#wc-context-tooltip')
          .evaluate((node) => [
            node.ownerDocument.querySelectorAll('#wc-context-tooltip').length,
            node.querySelectorAll('svg,img,button').length,
          ]),
        [1, 0],
        'One plain-text surface with no help icon or duplicate',
      );
      if (width === 1440) {
        const colorTrigger = page.locator('#sectionPanel .v2-legend-palette-trigger').first();
        assert.equal(await colorTrigger.getAttribute('data-help'), 'section.color');
        assert.equal(await colorTrigger.getAttribute('title'), null);
        await colorTrigger.hover();
        await page.locator('.wc-context-tooltip:visible').waitFor();
        assert.match(await page.locator('.wc-context-tooltip').innerText(), /Change display color/);
        await colorTrigger.click();
        const colorChoice = page.locator('#sectionPanel .v2-legend-swatch-choice').first();
        assert.equal(await colorChoice.getAttribute('data-help'), 'section.color.option');
        assert.equal(await colorChoice.getAttribute('title'), null);
        await colorChoice.hover();
        await page.locator('.wc-context-tooltip:visible').waitFor();
        assert.match(await page.locator('.wc-context-tooltip').innerText(), /Apply color/);
        await page.locator('[data-action="domain:process"]').click();
        const face = page.locator('#faceToggleBtn');
        assert.equal(await face.getAttribute('data-help'), 'process.face');
        await face.selectOption('both');
        await face.focus();
        await page.locator('.wc-context-tooltip:visible').waitFor();
        assert.match(
          await page.locator('.wc-context-tooltip').innerText(),
          /front, then the back.*two separate material layers/s,
        );
        const process = page.locator('#applyOperationBtn');
        assert.equal(await process.getAttribute('data-help'), 'process.apply');
        await page.locator('[data-action="domain:project"]').click();
        await page.locator('.wc-context-tooltip').waitFor({ state: 'hidden' });
      }
      report.cases.push({ width, mouse: true, keyboard: true, rerender: true });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
