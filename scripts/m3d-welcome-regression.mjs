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
  // The Border state is communicated by the common selected color, not an
  // extra ON/OFF caption. Preserve the restored checkbox and click behavior.
  const border = page.locator('#threeBorderControl');
  const state = async () =>
    border.evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color,
      outline: getComputedStyle(node).borderColor,
      label: node.textContent.trim(),
    }));
  assert.equal(await border.locator('.three-border-status').count(), 0);
  if (await page.locator('#threeBorders').isChecked()) await border.click();
  const off = await state();
  assert.equal(off.label, 'Border');
  await border.click();
  assert.equal(await page.locator('#threeBorders').isChecked(), true);
  const on = await state();
  assert.equal(on.label, 'Border');
  assert.notEqual(on.fill, off.fill, 'Selected Border must have a distinct fill');
  assert.notEqual(on.color, off.color, 'Selected Border must have a distinct text color');
  await border.click();
  assert.equal(await page.locator('#threeBorders').isChecked(), false);
  assert.deepEqual(await state(), off);
  assert.deepEqual(errors, [], 'M3D welcome opening caused page errors');
  await page.screenshot({
    path: 'test-results/m3d/welcome/m3d-welcome-opened.png',
    fullPage: true,
    animations: 'disabled',
  });
} finally {
  await browser.close();
}
