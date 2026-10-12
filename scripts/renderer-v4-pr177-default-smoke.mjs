// Default UI v2 + retained Legacy integration over the SAME scientific
// three-view.js; run only on a temporary merge of PR174 with current main.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from './test-helpers/ui.mjs';

const base = process.env.WAFERCAD_URL || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
let context;
try {
  const launched = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  context = launched.context;
  const page = launched.page;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true',
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  const initial = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model);
  await page.locator('[data-action="view:three"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost')?.dataset.renderState === 'ready' &&
      document.querySelector('#threeHost canvas'),
    null,
    { timeout: 120000 },
  );
  const host = page.locator('#threeHost');
  assert.equal(await host.locator('canvas').count(), 1);
  assert.equal(
    await page.locator('#threePanel [data-action="tool:rotate:three"]').getAttribute('aria-pressed'),
    'true',
  );
  await page.locator('#threePanel [data-action="tool:pan:three"]').click();
  assert.equal(await host.getAttribute('data-v2-gesture'), 'pan');
  await page.locator('#threePanel [data-action="tool:zoom:three"]').click();
  assert.equal(await host.getAttribute('data-wheel-zoom'), 'true');
  assert.equal(await host.getAttribute('data-v2-gesture'), 'pan');
  assert.deepEqual(
    await page.evaluate(() => window.WaferCadV2Workstation.snapshot().model),
    initial,
    '3D gesture toggles must never edit wafer geometry',
  );
  assert.deepEqual(errors, []);
  await page.goto(base + '/app-legacy.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === 'true',
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.locator('#threeHost').count(), 1);
  assert.notEqual(await page.locator('html').getAttribute('data-ui'), 'v2');
  assert.deepEqual(errors, []);
  console.log('RENDERER_PR177_DEFAULT_AND_LEGACY_PASS');
} finally {
  if (context) await context.close();
  await browser.close();
}
