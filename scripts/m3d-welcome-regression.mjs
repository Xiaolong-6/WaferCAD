import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import {
  gotoWelcome,
  waitForAppReady,
  observePageErrors,
  launchBrowser,
  newUiContext,
} from './test-helpers/ui.mjs';
import { openFunctionPanel } from './test-helpers/product.mjs';

await mkdir('test-results/m3d/welcome', { recursive: true });
const browser = await launchBrowser();
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  const card = page.locator(
    '.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"]',
  );
  assert.equal(await card.count(), 1, 'M3D welcome card missing');
  assert.match(await card.locator('.welcome-example-summary-link').textContent(), /36 History/);
  await card.locator('img').evaluate((img) => img.decode());
  assert.equal(await card.locator('img').evaluate((img) => img.naturalWidth), 640);
  await card.locator('.welcome-example-title-link').click();
  await page.waitForURL('**/app.html?start=example&example=m3d-selfpowered-heterogeneous-ic');
  await waitForAppReady(page);
  await openFunctionPanel(page, 'snapshots', { timeout: 120000 });
  await page.locator('.history-step-wrap').first().waitFor({ timeout: 180000 });
  assert.equal(await page.locator('.history-step-wrap').count(), 36);
  // ON and OFF must remain legible in the actual 3D header, irrespective of
  // the opacity selection or color palette.
  const border = page.locator('#threeBorderControl');
  const state = async () =>
    border.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      caption: getComputedStyle(node.querySelector('.three-border-status'), '::before').content,
    }));
  // Imported projects restore their saved Border state. Start this toggle
  // scenario explicitly at OFF instead of assuming a fixed example default.
  if (await page.locator('#threeBorders').isChecked()) await border.click();
  const off = await state();
  assert.match(off.caption, /OFF/);
  await border.click();
  assert.equal(await page.locator('#threeBorders').isChecked(), true);
  const on = await state();
  assert.match(on.caption, /ON/);
  assert.notEqual(on.fill, off.fill, 'Border ON must have distinct high-contrast fill');
  await border.click();
  assert.equal(await page.locator('#threeBorders').isChecked(), false);
  assert.match((await state()).caption, /OFF/);
  assert.deepEqual(errors, [], 'M3D welcome opening caused page errors');
  await page.screenshot({
    path: 'test-results/m3d/welcome/m3d-welcome-opened.png',
    fullPage: true,
    animations: 'disabled',
  });
} finally {
  await browser.close();
}
