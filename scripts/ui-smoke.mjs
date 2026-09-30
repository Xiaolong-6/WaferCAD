import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);

// Settings owns project controls and XY units.
await page.locator('#settingsTab').click();
await page.locator('#settingsTools:not([hidden])').waitFor();
for (const id of ['newProjectBtn', 'openProjectInput', 'saveProjectBtn', 'xyUnitSelect']) {
  assert.equal(await page.locator(`#settingsTools #${id}`).count(), 1);
}

// Operation controls remain usable after the toolbar reorganization.
await page.locator('#operationTab').click();
await page.locator('#operationTools:not([hidden])').waitFor();
for (const id of ['applyOperationBtn', 'undoBtn', 'redoBtn', 'faceToggleBtn']) {
  assert.equal(await page.locator(`#operationTools #${id}`).count(), 1);
}
const face = page.locator('#faceToggleBtn');
assert.equal((await face.textContent()).trim(), 'Front');
await face.click();
assert.equal((await face.textContent()).trim(), 'Back');
await face.click();

// A-B panel can be opened/collapsed. Endpoint dragging is intentionally not a CI gate yet.
const abPanel = page.locator('#sectionCoordsPanel');
assert.equal(await abPanel.isHidden(), true);
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
await page.locator('#sectionPanelClose').click();
assert.equal(await abPanel.isHidden(), true);

// ROI creation must remain one-shot and editable.
const mask = page.locator('#maskCanvas');
const box = await mask.boundingBox();
assert.ok(box);
await page.locator('#focusEditor > summary').click();
assert.equal((await page.locator('#focusEditor > summary').textContent()).trim(), 'ROI');
await page.locator('.roi-tool[data-tool="rect"]').click();
await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 });
await page.mouse.up();
await page.locator('#focusEditor > summary').click();
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Number(await page.locator('#roiWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#roiHeight').inputValue()) > 0);

// 3D inspection controls should operate without runtime errors.
await page.locator('.three-opacity-control > summary').click();
await page.locator('#threeOpacityRange').fill('0.5');
await page.locator('#threeBorderControl').click();
assert.equal(await page.locator('#threeBorders').isChecked(), true);
await page.locator('#fit3dBtn').click();

assert.equal(await page.locator('#maskSelectionSummary').count(), 0);
assert.deepEqual(errors, []);
await browser.close();

// Core editor must still boot when the external Three.js CDN is unavailable.
const degradedBrowser = await chromium.launch({ headless: true });
const degradedContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
await degradedContext.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
const degraded = await degradedContext.newPage();
const degradedErrors = [];
degraded.on('pageerror', (error) => degradedErrors.push(error.message));
await degraded.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await degraded.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);
assert.equal(
  (await degraded.locator('#threeStats').textContent()).trim(),
  'dependency unavailable',
);
assert.equal(await degraded.locator('#mainCanvas').count(), 1);
assert.equal(await degraded.locator('#maskCanvas').count(), 1);
assert.deepEqual(degradedErrors, []);
await degradedContext.close();
await degradedBrowser.close();

console.log('WaferCAD UI smoke: OK');
