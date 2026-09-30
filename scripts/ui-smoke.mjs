import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel, modelBoundsZ } = await import('../site/model.js');
const { circleMulti, pointInMulti } = await import('../site/vector-geometry.js');

const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const launchOptions = {
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
};
const browser = await chromium.launch(launchOptions);
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

// XYZ unit switching converts physical Z drafts as well as X/Y drafts.
await page.locator('#xyUnitSelect').selectOption('nm');
assert.equal(await page.locator('#baseThicknessUnit').textContent(), 'nm');
assert.equal(await page.locator('#operationThicknessUnit').textContent(), 'nm');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12000);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3000);
await page.locator('#xyUnitSelect').selectOption('um');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3);
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

// Exercise Conformal through the real UI path, then save and inspect the canonical model.
const conformalFixture = createModel({
  shape: 'circle',
  width: 100000,
  height: 100000,
  thickness: 12,
});
applyOperation(conformalFixture, {
  type: 'etch',
  thickness: 2,
  area: circleMulti(10000),
});
const conformalProject = projectForBenchmark({
  model: conformalFixture,
  section: { a: [-7000, 0], b: [7000, 0] },
});
await page.locator('#settingsTab').click();
await page.locator('#openProjectInput').setInputFiles({
  name: 'ui-conformal-round-trench.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(conformalProject)),
});
await page.waitForFunction(() =>
  (document.getElementById('statusText')?.textContent || '').startsWith('Opened'),
);
await page.locator('#operationTab').click();
await page.locator('#operationType').selectOption('add');
await page.locator('#operationArea').selectOption('full');
await page.locator('#growthMode').selectOption('conformal');
await page.locator('#operationThickness').fill('1');
await page.locator('#layerName').fill('UI conformal');
assert.equal(await page.locator('#growthMode').inputValue(), 'conformal');
assert.match(await page.locator('#operationNote').textContent(), /Conformal/);
await page.locator('#applyOperationBtn').click();
assert.match(await page.locator('#statusText').textContent(), /Added UI conformal/);

await page.locator('#settingsTab').click();
const downloadPromise = page.waitForEvent('download');
await page.locator('#saveProjectBtn').click();
const download = await downloadPromise;
const savedPath = await download.path();
assert.ok(savedPath);
const saved = JSON.parse(await readFile(savedPath, 'utf8'));
const coatId = saved.model.layers.find((layer) => layer.name === 'UI conformal')?.id;
assert.ok(coatId);
const stackAtSaved = (x) =>
  saved.model.regions.find((region) => pointInMulti([x, 0], region.geom))?.stack || [];
const sideX = 4999.5;
assert.deepEqual(
  stackAtSaved(sideX).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 7, role: 'conformal-sidewall' },
);
assert.deepEqual(
  stackAtSaved(0).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 5 },
);
assert.deepEqual(
  stackAtSaved(5001).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 6, z1: 7 },
);
const coatColor = saved.model.layers.find((layer) => layer.id === coatId).color;
const [savedLo, savedHi] = modelBoundsZ(saved.model);
const savedPad = Math.max(1e-9, (savedHi - savedLo) * 0.08);
const sectionZ0 = savedLo - savedPad;
const sectionZ1 = savedHi + savedPad;
const sidewallPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, sideX, sectionZ0, sectionZ1 }) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const left = 27;
    const right = 10;
    const top = 10;
    const bottom = 22;
    const iw = rect.width - left - right;
    const ih = rect.height - top - bottom;
    const t = (sideX + 7000) / 14000;
    const x = Math.round((left + t * iw) * dpr);
    const y = Math.round((top + ((sectionZ1 - 6) / (sectionZ1 - sectionZ0)) * ih) * dpr);
    const actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)];
    const expected = [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16),
    ];
    return { actual, expected };
  },
  { color: coatColor, sideX, sectionZ0, sectionZ1 },
);
assert.ok(
  sidewallPixel.actual.every(
    (value, index) => Math.abs(value - sidewallPixel.expected[index]) <= 8,
  ),
);

// Region partitions inside one material must never show up as Section seams.
// Probe the trench wall x-position deep inside the continuous Base material,
// where the process model is partitioned but the visible material is identical.
const baseColor = saved.model.layers.find((layer) => layer.id === 'base').color;
const baseSeamPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, sectionZ0, sectionZ1 }) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const left = 27;
    const right = 10;
    const top = 10;
    const bottom = 22;
    const iw = rect.width - left - right;
    const ih = rect.height - top - bottom;
    const t = (5000 + 7000) / 14000;
    const x = Math.round((left + t * iw) * dpr);
    const y = Math.round((top + ((sectionZ1 - 0) / (sectionZ1 - sectionZ0)) * ih) * dpr);
    const actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)];
    const expected = [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16),
    ];
    return { actual, expected };
  },
  { color: baseColor, sectionZ0, sectionZ1 },
);
assert.ok(
  baseSeamPixel.actual.every(
    (value, index) => Math.abs(value - baseSeamPixel.expected[index]) <= 8,
  ),
);

// Section defaults to readable Auto fit but offers a true physical 1:1 check.
const sectionScaleButton = page.locator('#sectionScaleModeBtn');
assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');
assert.match(await page.locator('#sectionMeta').textContent(), /Z ×/);
const autoScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
  x: Number(canvas.dataset.xPxPerUm),
  z: Number(canvas.dataset.zPxPerUm),
}));
assert.ok(autoScales.x > 0 && autoScales.z > 0);
await sectionScaleButton.click();
assert.equal((await sectionScaleButton.textContent()).trim(), '1:1');
assert.match(await page.locator('#sectionMeta').textContent(), /1:1/);
const physicalScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
  mode: canvas.dataset.scaleMode,
  x: Number(canvas.dataset.xPxPerUm),
  z: Number(canvas.dataset.zPxPerUm),
}));
assert.equal(physicalScales.mode, 'physical');
assert.ok(Math.abs(physicalScales.x - physicalScales.z) < 1e-9);
await sectionScaleButton.click();
assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');

await page.locator('#operationTab').click();

// A-B panel and explicit editing state; coordinate drag checks live in product-regression.mjs.
const abPanel = page.locator('#sectionCoordsPanel');
assert.equal(await abPanel.isHidden(), true);
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
await page.locator('#sectionEditBtn').click();
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);
assert.ok((await page.locator('[data-endpoint=a]').boundingBox()).width <= 24);
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isHidden(), true);
await page.locator('#sectionControlsBtn').click();
await page.locator('#sectionAx').fill('1.23456');
await page.locator('#sectionAx').press('Tab');
assert.equal(await page.locator('#sectionAx').inputValue(), '1.235');
await page.locator('#sectionControlsBtn').click();

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
await page.waitForTimeout(50);
assert.deepEqual(errors, [], 'Rectangle ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Number(await page.locator('#roiWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#roiHeight').inputValue()) > 0);
await page.locator('#focusEditor > summary').click();

// Sector ROI starts as a circle-derived 0°→90° wedge and supports wrapped ranges.
await page.locator('#focusEditor > summary').click();
await page.locator('#clearRoiBtn').click();
await page.locator('.roi-tool[data-tool="sector"]').click();
const sectorBox = await mask.boundingBox();
assert.ok(sectorBox);
await page.mouse.move(sectorBox.x + sectorBox.width * 0.5, sectorBox.y + sectorBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.62, sectorBox.y + sectorBox.height * 0.5, {
  steps: 4,
});
await page.mouse.up();
await page.waitForTimeout(50);
assert.deepEqual(errors, [], 'Sector ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#roiShapeLabel').textContent()).trim(), 'Sector');
assert.equal(await page.locator('#roiStartAngle').inputValue(), '0');
assert.equal(await page.locator('#roiEndAngle').inputValue(), '90');
await page.locator('#roiStartAngle').fill('300');
await page.locator('#roiStartAngle').press('Tab');
await page.locator('#roiEndAngle').fill('60');
await page.locator('#roiEndAngle').press('Tab');
await page.locator('#focusEditor > summary').click();

// SVG exports and in-page maximize controls are wired for all 2D views.
for (const [button, filename] of [
  ['#mainExportSvgBtn', 'wafercad-main.svg'],
  ['#maskExportSvgBtn', 'wafercad-mask.svg'],
  ['#sectionExportSvgBtn', 'wafercad-section-ab.svg'],
]) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), filename);
}
await page.locator('#mainMaxBtn').click();
assert.equal(
  await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
  true,
);
assert.equal(
  await page.locator('#mainPanel').evaluate((el) => el.classList.contains('is-maximized')),
  true,
);
assert.equal((await page.locator('#mainMaxBtn').textContent()).trim(), 'Restore');
await page.locator('#mainMaxBtn').click();
assert.equal(
  await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
  false,
);

// 3D inspection controls should operate without runtime errors.
await page.locator('.three-opacity-control > summary').click();
await page.locator('#threeOpacityRange').fill('0.5');
const bordersBeforeToggle = await page.locator('#threeBorders').isChecked();
await page.locator('#threeBorderControl').click();
assert.equal(await page.locator('#threeBorders').isChecked(), !bordersBeforeToggle);
await page.locator('#fit3dBtn').click();

const glbDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportModelBtn').click();
assert.equal((await glbDownloadPromise).suggestedFilename(), 'wafercad-model.glb');
const pngDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportPngBtn').click();
assert.equal((await pngDownloadPromise).suggestedFilename(), 'wafercad-3d-3x.png');

assert.equal(await page.locator('#maskSelectionSummary').count(), 0);
assert.deepEqual(errors, []);
await browser.close();

// Core editor must still boot when the external Three.js CDN is unavailable.
const degradedBrowser = await chromium.launch(launchOptions);
const degradedContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
let blockedThreeRequests = 0;
await degradedContext.route('https://cdn.jsdelivr.net/**', (route) => {
  blockedThreeRequests++;
  return route.fulfill({ status: 503, body: '' });
});
const degraded = await degradedContext.newPage();
const degradedErrors = [];
degraded.on('pageerror', (error) => degradedErrors.push(error.message));
await degraded.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
assert.equal(await degraded.locator('#mainCanvas').count(), 1);
assert.equal(await degraded.locator('#maskCanvas').count(), 1);
assert.deepEqual(degradedErrors, []);
await degradedContext.close();
await degradedBrowser.close();

console.log('WaferCAD UI smoke: OK');
