import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);

// Project controls moved into Settings; top bar is branding only.
assert.equal(await page.locator('.topbar #newProjectBtn').count(), 0);
await page.locator('#settingsTab').click();
await page.locator('#settingsTools:not([hidden])').waitFor();
for (const id of ['newProjectBtn', 'openProjectInput', 'saveProjectBtn', 'xyUnitSelect'])
  assert.equal(await page.locator(`#settingsTools #${id}`).count(), 1);

// Undo/Redo moved beside Apply.
await page.locator('#operationTab').click();
await page.locator('#operationTools:not([hidden])').waitFor();
for (const id of ['applyOperationBtn', 'undoBtn', 'redoBtn'])
  assert.equal(await page.locator(`.operation-actions #${id}`).count(), 1);

// Active face is one toggle button.
const face = page.locator('#faceToggleBtn');
assert.equal(await face.textContent(), 'Front');
await face.click();
assert.equal(await face.textContent(), 'Back');
await face.click();
assert.equal(await face.textContent(), 'Front');

// Main A-B panel is explicit and persistent until collapsed.
const abPanel = page.locator('#sectionCoordsPanel');
assert.equal(await abPanel.isHidden(), true);
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
await page.locator('#sectionEditBtn').click();
assert.equal(await page.locator('#sectionEditBtn').getAttribute('aria-pressed'), 'true');

// Drag A endpoint using the same viewport geometry as the application.
const main = page.locator('#mainCanvas');
const mainBox = await main.boundingBox();
assert.ok(mainBox);
const mainData = await page.evaluate(() => ({
  width: Number(document.getElementById('baseWidth').value),
  height: Number(document.getElementById('baseHeight').value),
  ax: Number(document.getElementById('sectionAx').value),
  ay: Number(document.getElementById('sectionAy').value),
}));
const margin = 34;
const baseScale = Math.min(
  (mainBox.width - margin * 2) / mainData.width,
  (mainBox.height - margin * 2) / mainData.height,
);
const aScreen = {
  x: mainBox.x + mainBox.width / 2 + mainData.ax * baseScale,
  y: mainBox.y + mainBox.height / 2 - mainData.ay * baseScale,
};
const beforeAx = Number(await page.locator('#sectionAx').inputValue());
await page.mouse.move(aScreen.x, aScreen.y);
await page.mouse.down();
await page.mouse.move(aScreen.x + 45, aScreen.y - 15, { steps: 5 });
await page.mouse.up();
const afterAx = Number(await page.locator('#sectionAx').inputValue());
assert.notEqual(afterAx, beforeAx);
assert.equal(await abPanel.isVisible(), true);
await page.locator('#sectionPanelClose').click();
assert.equal(await abPanel.isHidden(), true);

// ROI: one-shot creation, then four corner handles resize it.
const mask = page.locator('#maskCanvas');
const maskBox = await mask.boundingBox();
assert.ok(maskBox);
await page.locator('#focusEditor > summary').click();
assert.equal((await page.locator('#focusEditor > summary').textContent()).trim(), 'ROI');
await page.locator('.roi-tool[data-tool="rect"]').click();
const p1 = { x: maskBox.x + maskBox.width * 0.38, y: maskBox.y + maskBox.height * 0.36 };
const p2 = { x: maskBox.x + maskBox.width * 0.62, y: maskBox.y + maskBox.height * 0.64 };
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move(p2.x, p2.y, { steps: 5 });
await page.mouse.up();
await page.locator('#focusEditor > summary').click();
await page.locator('#roiEditor:not([hidden])').waitFor();
const widthBefore = Number(await page.locator('#roiWidth').inputValue());
const heightBefore = Number(await page.locator('#roiHeight').inputValue());
await page.locator('#focusEditor > summary').click(); // close popover before canvas drag
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move(p1.x - 35, p1.y - 25, { steps: 5 });
await page.mouse.up();
await page.locator('#focusEditor > summary').click();
const widthAfter = Number(await page.locator('#roiWidth').inputValue());
const heightAfter = Number(await page.locator('#roiHeight').inputValue());
assert.ok(widthAfter > widthBefore);
assert.ok(heightAfter > heightBefore);

// Mask footer is gone; current selection semantics live in the header.
assert.equal(await page.locator('#maskSelectionSummary').count(), 0);
assert.equal(await page.locator('#maskCellLabel').count(), 1);

// 3D controls share one compact control style and height.
const controls = page.locator('#threePanel .three-control');
assert.equal(await controls.count(), 3);
const heights = await controls.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
assert.ok(heights.every((height) => Math.abs(height - heights[0]) < 0.5));

// No browser runtime errors during the interaction sequence.
assert.deepEqual(pageErrors, []);

await browser.close();
console.log('WaferCAD concentrated UI smoke passed.');
