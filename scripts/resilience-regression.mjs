import assert from 'node:assert/strict';
import { baseUrl, launchBrowser, observePageErrors } from './test-helpers/ui.mjs';

// Core editor must still boot when the external Three.js CDN is unavailable.
const degradedBrowser = await launchBrowser();
const degradedContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
let blockedThreeRequests = 0;
await degradedContext.route('https://cdn.jsdelivr.net/**', (route) => {
  blockedThreeRequests++;
  return route.fulfill({ status: 503, body: '' });
});
const degraded = await degradedContext.newPage();
const degradedErrors = observePageErrors(degraded);
await degraded.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await degraded.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Ready. Create a base or import a layout.',
  null,
  { timeout: 30000 },
);
assert.ok(blockedThreeRequests > 0);
assert.equal(
  (await degraded.locator('#threeStats').textContent()).trim(),
  'dependency unavailable',
);
assert.match(
  await degraded.locator('#threeHost').textContent(),
  /Three\.js resources could not be loaded/,
);
assert.equal(await degraded.locator('#mainCanvas').count(), 1);
assert.equal(await degraded.locator('#maskCanvas').count(), 1);
assert.deepEqual(degradedErrors, []);
await degradedContext.close();

// A browser/environment that loads Three.js but cannot create WebGL must leave
// the 2D editor usable and replace the loading state with an explicit diagnosis.
const noWebGlContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
await noWebGlContext.addInitScript(() => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
    return originalGetContext.call(this, type, ...args);
  };
});
const noWebGl = await noWebGlContext.newPage();
const noWebGlErrors = observePageErrors(noWebGl);
await noWebGl.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await noWebGl.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Ready. Create a base or import a layout.',
  null,
  { timeout: 30000 },
);
await noWebGl.waitForFunction(
  () => (document.getElementById('threeStats')?.textContent || '').trim() === 'WebGL unavailable',
  null,
  { timeout: 30000 },
);
assert.equal(await noWebGl.locator('#threeHost').getAttribute('data-three-unavailable-reason'), 'webgl');
assert.match(
  await noWebGl.locator('#threeHost').textContent(),
  /could not create a WebGL context/,
);
assert.equal(await noWebGl.locator('#threeHost').evaluate((node) => node.classList.contains('three-loading')), false);
assert.equal(await noWebGl.locator('#mainCanvas').count(), 1);
assert.equal(await noWebGl.locator('#maskCanvas').count(), 1);
assert.deepEqual(noWebGlErrors, []);
await noWebGlContext.close();
await degradedBrowser.close();

console.log('WaferCAD resilience regression: OK');
