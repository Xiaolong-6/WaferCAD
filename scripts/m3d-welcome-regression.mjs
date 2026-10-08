import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gotoWelcome, waitForAppReady, observePageErrors } from './test-helpers/ui.mjs';
import { openFunctionPanel } from './test-helpers/product.mjs';

await mkdir('test-results/m3d/welcome', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  const card = page.locator('.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"]');
  assert.equal(await card.count(), 1, 'M3D welcome card missing');
  assert.match(await card.locator('.welcome-example-summary-link').textContent(), /36 History/);
  assert.equal(await card.locator('img').evaluate((img) => img.complete && img.naturalWidth), 640);
  await card.locator('.welcome-example-title-link').click();
  await page.waitForURL('**/app.html?start=example&example=m3d-selfpowered-heterogeneous-ic');
  await waitForAppReady(page);
  await openFunctionPanel(page, 'snapshots', { timeout: 120000 });
  await page.locator('.history-step-wrap').first().waitFor({ timeout: 180000 });
  assert.equal(await page.locator('.history-step-wrap').count(), 36);
  assert.deepEqual(errors, [], 'M3D welcome opening caused page errors');
  await page.screenshot({
    path: 'test-results/m3d/welcome/m3d-welcome-opened.png',
    fullPage: true,
    animations: 'disabled',
  });
} finally {
  await browser.close();
}
