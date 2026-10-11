// Cross-platform preflight for the exact local HTTP route used by the
// RTX 3060 runner. This does NOT establish real hardware pixel parity.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startRendererHardwareSite } from './test-helpers/renderer-hardware-site.mjs';

const diagnostics = [];
const server = await startRendererHardwareSite(process.cwd(), (entry) => {
  diagnostics.push(entry);
  console.log('RENDERER_HTTP_DIAGNOSTIC', JSON.stringify(entry));
});
let browser;
try {
  await server.verify();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const response = await page.goto(server.url + '/app.html?rendererV3RoiTrace=1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  assert.equal(response?.status(), 200, 'Chromium failed to navigate to app.html');
  assert.ok(
    (await page.locator('html').count()) === 1,
    'Chromium did not receive an HTML document',
  );
  console.log(
    'RENDERER_HTTP_PREFLIGHT_PASS',
    JSON.stringify({ platform: process.platform, status: response.status() }),
  );
} catch (error) {
  console.error('RENDERER_HTTP_PREFLIGHT_FAIL', String(error));
  console.error('RENDERER_HTTP_TRACE', JSON.stringify(diagnostics));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await server.close();
}
