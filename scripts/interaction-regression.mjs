import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  baseUrl,
  launchBrowser,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForThreeReady,
  newUiContext,
} from './test-helpers/ui.mjs';

const welcomeLayoutBuffer = await readFile(
  new URL('../site/samples/klayout/oas-rectangles.oas', import.meta.url),
);

async function processDiagnostics(page) {
  return Promise.race([
    page
      .evaluate(() => ({
        status: document.getElementById('statusText')?.textContent || '',
        stage: document.getElementById('processTaskStage')?.textContent || '',
        taskHidden: Boolean(document.getElementById('processTaskDialog')?.hidden),
        applyDisabled: Boolean(document.getElementById('applyOperationBtn')?.disabled),
        operationType: document.getElementById('operationType')?.value || '',
        growthMode: document.getElementById('growthMode')?.value || '',
        workerGrowth: globalThis.__lastProcessWorkerPayload?.params?.growth || '',
        workerType: globalThis.__lastProcessWorkerPayload?.params?.type || '',
      }))
      .catch((error) => ({ evaluateError: error.message })),
    new Promise((resolve) => setTimeout(() => resolve({ pageUnresponsive: true }), 2000)),
  ]);
}

const browser = await launchBrowser();
const context = await newUiContext(browser, {
  viewport: { width: 1365, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = observePageErrors(page);

await page.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await waitForAppReady(page);
await waitForThreeReady(page);

// Slice geometry is editable by default; Slice starts one-shot creation.
const abPanel = page.locator('#sectionCoordsPanel');
const main = page.locator('#mainCanvas');
const mainBox = await main.boundingBox();
assert.ok(mainBox);
assert.equal(await abPanel.isHidden(), true);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);
assert.ok((await page.locator('[data-endpoint=a]').boundingBox()).width <= 24);

await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
assert.equal(await page.locator('[data-endpoint=a]').isHidden(), true);
await page.mouse.move(mainBox.x + mainBox.width * 0.25, mainBox.y + mainBox.height * 0.35);
await page.mouse.down();
await page.mouse.move(mainBox.x + mainBox.width * 0.72, mainBox.y + mainBox.height * 0.62, {
  steps: 5,
});
await page.mouse.up();
await page.waitForFunction(
  () => /^Slice created\./.test(document.getElementById('statusText')?.textContent || ''),
);
assert.match(await page.locator('#statusText').textContent(), /^Slice created\./);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

// Existing A–B line can be translated directly while the coordinate panel is open.
const aBefore = Number(await page.locator('#sectionAx').inputValue());
const bBefore = Number(await page.locator('#sectionBx').inputValue());
const aHandle = await page.locator('[data-endpoint=a]').boundingBox();
const bHandle = await page.locator('[data-endpoint=b]').boundingBox();
const lineX = (aHandle.x + aHandle.width / 2 + bHandle.x + bHandle.width / 2) / 2;
const lineY = (aHandle.y + aHandle.height / 2 + bHandle.y + bHandle.height / 2) / 2;
await page.mouse.move(lineX, lineY);
await page.mouse.down();
await page.mouse.move(lineX + 12, lineY, { steps: 4 });
await page.mouse.up();
assert.notEqual(Number(await page.locator('#sectionAx').inputValue()), aBefore);
assert.notEqual(Number(await page.locator('#sectionBx').inputValue()), bBefore);

await page.locator('#sectionAx').fill('1.23456');
await page.locator('#sectionAx').press('Tab');
assert.equal(await page.locator('#sectionAx').inputValue(), '1.235');
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isHidden(), true);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);

// ROI lives in Main. Opening ROI closes the Slice popover, and creation is one-shot.
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
await page.locator('#focusEditor > summary').click();
assert.equal(await abPanel.isHidden(), true);
assert.equal((await page.locator('#focusEditor > summary').textContent()).trim(), 'ROI');
await page.locator('.roi-tool[data-tool="rect"]').click();
await page.mouse.move(mainBox.x + mainBox.width * 0.4, mainBox.y + mainBox.height * 0.4);
await page.mouse.down();
await page.mouse.move(mainBox.x + mainBox.width * 0.6, mainBox.y + mainBox.height * 0.6, {
  steps: 4,
});
await page.mouse.up();
await page.waitForFunction(
  () => /^ROI created\./.test(document.getElementById('statusText')?.textContent || ''),
);
assert.deepEqual(errors, [], 'Rectangle ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Number(await page.locator('#roiWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#roiHeight').inputValue()) > 0);

// Main permits only one floating control: Export replaces ROI.
const mainExportControl = page.locator('#mainPanel .export-control');
await mainExportControl.locator(':scope > summary').click();
assert.equal(await page.locator('#focusEditor').evaluate((details) => details.open), false);
assert.equal(await mainExportControl.evaluate((details) => details.open), true);
await mainExportControl.locator(':scope > summary').click();

// Sector ROI starts as a circle-derived 0°→90° wedge and supports wrapped ranges.
await page.locator('#focusEditor > summary').click();
await page.locator('#clearRoiBtn').click();
await page.locator('.roi-tool[data-tool="sector"]').click();
const sectorBox = await main.boundingBox();
assert.ok(sectorBox);
await page.mouse.move(sectorBox.x + sectorBox.width * 0.5, sectorBox.y + sectorBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.62, sectorBox.y + sectorBox.height * 0.5, {
  steps: 4,
});
await page.mouse.up();
await page.waitForFunction(
  () => /^ROI created\./.test(document.getElementById('statusText')?.textContent || ''),
);
assert.deepEqual(errors, [], 'Sector ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#roiShapeLabel').textContent()).trim(), 'Sector');
assert.equal(await page.locator('#roiStartAngle').inputValue(), '0');
assert.equal(await page.locator('#roiEndAngle').inputValue(), '90');

// Drag the yellow Start-angle handle from 0° to 270° and verify the numeric editor follows.
await page.locator('#focusEditor > summary').click();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.62, sectorBox.y + sectorBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.5, sectorBox.y + sectorBox.height * 0.62, {
  steps: 5,
});
await page.mouse.up();
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Math.abs(Number(await page.locator('#roiStartAngle').inputValue()) - 270) < 1);
assert.equal(await page.locator('#roiEndAngle').inputValue(), '90');

await page.locator('#roiStartAngle').fill('300');
await page.locator('#roiStartAngle').press('Tab');
await page.locator('#roiEndAngle').fill('60');
await page.locator('#roiEndAngle').press('Tab');
await page.locator('#focusEditor > summary').click();

// Mask now mirrors Main's double-click-to-Fit behavior.
await page.locator('#maskCanvas').dblclick();
assert.deepEqual(errors, [], 'Mask double-click Fit must not raise a browser error.');

// File / Draw keeps imported and temporary mask sources separate.
// Load a real File Mask on this long-lived editor page before validating filtered File export.
await page.locator('#gdsInput').setInputFiles({
  name: 'ui-mask-export.oas',
  mimeType: 'application/octet-stream',
  buffer: welcomeLayoutBuffer,
});
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened ui-mask-export.oas.',
  null,
  { timeout: 30000 },
);
assert.ok(await page.locator('#maskLayerList .layer-row').count());

// Mask ROI / Opacity / Export share one exclusive popover slot.
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiEditor').evaluate((details) => details.open), true);
await page.locator('#maskPanel .mask-opacity-control > summary').click();
assert.equal(await page.locator('#maskRoiEditor').evaluate((details) => details.open), false);
assert.equal(
  await page.locator('#maskPanel .mask-opacity-control').evaluate((details) => details.open),
  true,
);
await page.locator('#maskExportControl > summary').click();
assert.equal(
  await page.locator('#maskPanel .mask-opacity-control').evaluate((details) => details.open),
  false,
);
assert.equal(await page.locator('#maskExportControl').evaluate((details) => details.open), true);
await page.locator('#maskExportControl > summary').click();

const sourceToggle = page.locator('#maskSourceToggleBtn');
assert.equal((await sourceToggle.textContent()).trim(), 'File');
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'Draw');
assert.equal(await page.locator('#drawMaskToolbar').isVisible(), true);
assert.equal(await page.locator('#maskFileControls').isHidden(), true);
assert.equal(
  await page.locator('#maskDrawInfo').evaluate((element) => element.hidden),
  false,
);

const drawBox = await page.locator('#maskCanvas').boundingBox();
assert.ok(drawBox);
await page.locator('.draw-mask-tool[data-draw-tool="rect"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.43, drawBox.y + drawBox.height * 0.43);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.57, drawBox.y + drawBox.height * 0.57, {
  steps: 4,
});
await page.mouse.up();
await page.waitForFunction(
  () => /^1 shape/.test(document.getElementById('drawMaskHint')?.textContent || ''),
);
assert.match(await page.locator('#drawMaskHint').textContent(), /^1 shape/);

// Rectangle/Circle-style shapes open their exact parameter editor on a normal click.
await page.mouse.click(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Rectangle');
assert.ok(Number(await page.locator('#drawShapeWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#drawShapeHeight').inputValue()) > 0);

// A header popover replaces the canvas shape editor in the same Mask window.
await page.locator('#maskPanel .mask-opacity-control > summary').click();
assert.equal(await page.locator('#drawShapeEditor').isHidden(), true);
await page.locator('#maskPanel .mask-opacity-control > summary').click();
await page.waitForTimeout(350);
await page.mouse.click(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();

// Dragging a selected shape keeps the editor open and live-syncs its numeric fields.
const rectCxBeforeDrag = Number(await page.locator('#drawShapeCx').inputValue());
// Avoid the preceding selection click being interpreted as the first click of a double-click.
await page.waitForTimeout(600);
await page.mouse.move(drawBox.x + drawBox.width * 0.47, drawBox.y + drawBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5, {
  steps: 4,
});
const rectCxDuringDrag = Number(await page.locator('#drawShapeCx').inputValue());
assert.notEqual(rectCxDuringDrag, rectCxBeforeDrag);
await page.mouse.up();
assert.equal(await page.locator('#drawShapeEditor').isVisible(), true);

await page.locator('#drawShapeCx').fill('250');
await page.locator('#drawShapeCy').fill('-125');
await page.locator('#drawShapeWidth').fill('800');
await page.locator('#drawShapeHeight').fill('600');
await page.locator('#drawShapeEditorApply').click();
assert.match(await page.locator('#statusText').textContent(), /Rectangle parameters updated/);
await page.locator('#drawShapeEditorClose').click();

// Polygon can finish by clicking its first point; double-click and Enter remain supported.
const polygonStart = {
  x: drawBox.x + drawBox.width * 0.3,
  y: drawBox.y + drawBox.height * 0.3,
};
await page.locator('.draw-mask-tool[data-draw-tool="polygon"]').click();
await page.mouse.click(polygonStart.x, polygonStart.y);
await page.mouse.click(drawBox.x + drawBox.width * 0.38, drawBox.y + drawBox.height * 0.3);
await page.mouse.click(drawBox.x + drawBox.width * 0.38, drawBox.y + drawBox.height * 0.38);
await page.mouse.click(polygonStart.x, polygonStart.y);
await page.waitForFunction(
  () => /^2 shapes/.test(document.getElementById('drawMaskHint')?.textContent || ''),
);
assert.match(await page.locator('#drawMaskHint').textContent(), /^2 shapes/);

// Existing Polygon opens the same parameter editor on a normal click.
await page.mouse.click(drawBox.x + drawBox.width * 0.36, drawBox.y + drawBox.height * 0.33);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Polygon');
const polygonRows = (await page.locator('#drawShapePoints').inputValue())
  .split(/\r?\n/)
  .filter(Boolean);
assert.equal(polygonRows.length, 3);
assert.ok(polygonRows.every((row) => row.includes(',')));
await page.locator('#drawShapeEditorClose').click();

// Ring is center + inner/outer radius and remains directly editable afterwards.
await page.locator('.draw-mask-tool[data-draw-tool="ring"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.65, drawBox.y + drawBox.height * 0.42);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.73, drawBox.y + drawBox.height * 0.42, {
  steps: 4,
});
await page.mouse.up();
await page.mouse.click(drawBox.x + drawBox.width * 0.71, drawBox.y + drawBox.height * 0.42);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Ring');
assert.ok(Number(await page.locator('#drawShapeOuterRadius').inputValue()) > 0);
assert.ok(
  Number(await page.locator('#drawShapeOuterRadius').inputValue()) >
    Number(await page.locator('#drawShapeInnerRadius').inputValue()),
);
await page.locator('#drawShapeEditorClose').click();

// Ring Sector adds start/end angles on top of the annular parameters.
await page.locator('.draw-mask-tool[data-draw-tool="ring-sector"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.66, drawBox.y + drawBox.height * 0.68);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.75, drawBox.y + drawBox.height * 0.68, {
  steps: 4,
});
await page.mouse.up();
await page.mouse.click(drawBox.x + drawBox.width * 0.71, drawBox.y + drawBox.height * 0.64);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Ring Sector');
assert.equal(await page.locator('#drawShapeStartDeg').inputValue(), '0');
assert.equal(await page.locator('#drawShapeEndDeg').inputValue(), '90');
await page.locator('#drawShapeStartDeg').fill('300');
await page.locator('#drawShapeEndDeg').fill('60');
await page.locator('#drawShapeEditorApply').click();
assert.match(await page.locator('#statusText').textContent(), /Ring Sector parameters updated/);
await page.locator('#drawShapeEditorClose').click();
assert.match(await page.locator('#drawMaskHint').textContent(), /^4 shapes/);

// The active Draw source feeds Process Selected mask.
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="add"]').click();
await page.locator('#growthMode').selectOption('direct');
await page.locator('#operationArea').selectOption('mask');
await page.locator('#operationThickness').fill('0.2');
await page.locator('#layerName').fill('Draw probe');
assert.equal(await page.locator('#operationType').inputValue(), 'add');
assert.equal(await page.locator('#growthMode').inputValue(), 'direct');
await page.evaluate(() => {
  if (Worker.prototype.__wafercadProcessProbeInstalled) return;
  const originalPostMessage = Worker.prototype.postMessage;
  Object.defineProperty(Worker.prototype, '__wafercadProcessProbeInstalled', {
    value: true,
    configurable: true,
  });
  Worker.prototype.postMessage = function patchedPostMessage(message, ...rest) {
    if (message?.params) globalThis.__lastProcessWorkerPayload = structuredClone(message);
    return originalPostMessage.call(this, message, ...rest);
  };
});
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), false);
try {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#layerLegend .legend-name')].some(
        (input) => input.value === 'Draw probe',
      ),
    null,
    { timeout: 30000 },
  );
} catch (error) {
  console.error('Draw probe diagnostics:', JSON.stringify(await processDiagnostics(page)));
  throw error;
}
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), true);
assert.match(await page.locator('#statusText').textContent(), /Deposited Draw probe|Saved locally/);

// Switching sources never destroys either source.
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'File');
assert.equal(
  await page.locator('#maskFileControls').evaluate((element) => element.hidden),
  false,
);
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'Draw');
assert.match(await page.locator('#drawMaskHint').textContent(), /^4 shapes/);
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'File');

// Mask owns a separate Square/Circle ROI used by Process and Mask export.
await page.locator('#maskRoiEditor > summary').click();
await page.locator('.mask-roi-tool[data-tool="rect"]').click();
const maskRoiCanvas = await page.locator('#maskCanvas').boundingBox();
assert.ok(maskRoiCanvas);
await page.mouse.move(
  maskRoiCanvas.x + maskRoiCanvas.width * 0.38,
  maskRoiCanvas.y + maskRoiCanvas.height * 0.38,
);
await page.mouse.down();
await page.mouse.move(
  maskRoiCanvas.x + maskRoiCanvas.width * 0.62,
  maskRoiCanvas.y + maskRoiCanvas.height * 0.58,
  { steps: 4 },
);
await page.mouse.up();
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiFields').isVisible(), true);
assert.equal((await page.locator('#maskRoiShapeLabel').textContent()).trim(), 'Square');
assert.ok(Number(await page.locator('#maskRoiSize').inputValue()) > 0);
await page.locator('#maskRoiRotation').fill('27.5');
await page.locator('#maskRoiRotation').press('Tab');
assert.equal(Number(await page.locator('#maskRoiRotation').inputValue()), 27.5);
const maskRoiLocalX = await page.locator('#maskRoiX').inputValue(),
  maskRoiLocalY = await page.locator('#maskRoiY').inputValue(),
  maskRoiLocalSize = await page.locator('#maskRoiSize').inputValue();
await page.locator('#maskRoiEditor > summary').click();

// File-mask alignment moves the Mask ROI visually, but its local parameters stay unchanged.
await openFunctionPanel(page, 'mask');
const alignment = page.locator('#maskFileControls details.subgroup');
if (!(await alignment.evaluate((details) => details.open))) {
  await alignment.locator(':scope > summary').click();
}
await page.locator('#maskOffsetX').fill('1');
await page.locator('#maskOffsetY').fill('-0.5');
await page.locator('#maskScale').fill('1.1');
await page.locator('#maskRotation').fill('12');
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiX').inputValue(), maskRoiLocalX);
assert.equal(await page.locator('#maskRoiY').inputValue(), maskRoiLocalY);
assert.equal(await page.locator('#maskRoiSize').inputValue(), maskRoiLocalSize);
assert.equal(Number(await page.locator('#maskRoiRotation').inputValue()), 27.5);
await page.locator('#maskRoiEditor > summary').click();
await page.locator('#maskOffsetX').fill('0');
await page.locator('#maskOffsetY').fill('0');
await page.locator('#maskScale').fill('1');
await page.locator('#maskRotation').fill('0');

// Each view exposes one Export menu; format-specific actions live inside it.
for (const [panel, button, filename] of [
  ['#mainPanel', '#mainExportSvgBtn', 'wafercad-main.svg'],
  ['#maskPanel', '#maskExportSvgBtn', 'wafercad-mask.svg'],
  ['#sectionPanel', '#sectionExportSvgBtn', 'wafercad-section-ab.svg'],
]) {
  await page.locator(`${panel} .export-control > summary`).click();
  if (panel === '#maskPanel') {
    assert.ok((await page.locator('#maskExportCells option:checked').count()) > 0);
    assert.ok((await page.locator('#maskExportLayers option:checked').count()) > 0);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), filename);
}
for (const [button, filename] of [
  ['#maskExportGdsBtn', 'wafercad-mask.gds'],
  ['#maskExportOasBtn', 'wafercad-mask.oas'],
]) {
  await page.locator('#maskPanel .export-control > summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), filename);
}
const headerToolAlignment = await page.locator('.view-head .view-tools').evaluateAll((groups) =>
  groups.map((group) => getComputedStyle(group).alignItems),
);
assert.ok(headerToolAlignment.length >= 4);
assert.ok(headerToolAlignment.every((value) => value === 'center'));

const headerControlBoxes = await page.locator('.view-panel').evaluateAll((panels) =>
  panels.flatMap((panel) => {
    const controls = [...panel.querySelectorAll(
      '.view-head button, .view-head summary, .view-head .three-border-toggle',
    )].filter(
      (element) =>
        element.checkVisibility() &&
        !element.closest('.focus-popover, .three-opacity-popover, .export-popover'),
    );
    return controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.id || element.textContent?.trim() || element.className,
        height: rect.height,
        centerY: rect.top + rect.height / 2,
        panel: panel.id,
      };
    });
  }),
);
assert.ok(headerControlBoxes.length > 12);
for (const box of headerControlBoxes) {
  assert.ok(
    box.height >= 20.4 && box.height <= 22.6,
    `${box.panel}/${box.id} header height ${box.height}`,
  );
}
for (const panelId of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
  const boxes = headerControlBoxes.filter((box) => box.panel === panelId);
  if (boxes.length < 2) continue;
  const center = boxes.reduce((sum, box) => sum + box.centerY, 0) / boxes.length;
  for (const box of boxes) {
    assert.ok(
      Math.abs(box.centerY - center) <= 0.75,
      `${panelId}/${box.id} is vertically misaligned by ${Math.abs(box.centerY - center)}px`,
    );
  }
}

for (const [buttonId, panelId] of [
  ['mainMaxBtn', 'mainPanel'],
  ['maskMaxBtn', 'maskPanel'],
  ['threeMaxBtn', 'threePanel'],
  ['sectionMaxBtn', 'sectionPanel'],
]) {
  await page.locator(`#${buttonId}`).click();
  assert.equal(
    await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
    true,
  );
  assert.equal(
    await page.locator(`#${panelId}`).evaluate((el) => el.classList.contains('is-maximized')),
    true,
  );
  assert.equal((await page.locator(`#${buttonId}`).textContent()).trim(), 'Restore');
  await page.locator(`#${buttonId}`).click();
  assert.equal(
    await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
    false,
  );
}
await page.locator('#sectionMaxBtn').click();
await page.keyboard.press('Escape');
assert.equal(
  await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
  false,
);

// 3D inspection controls should operate without runtime errors.
const threeOpacityControl = page.locator('#threePanel .three-opacity-control');
const threeExportControl = page.locator('#threePanel .export-control');
await threeOpacityControl.locator(':scope > summary').click();
await page.locator('#threeOpacityRange').fill('0.5');
await threeExportControl.locator(':scope > summary').click();
assert.equal(await threeOpacityControl.evaluate((details) => details.open), false);
assert.equal(await threeExportControl.evaluate((details) => details.open), true);
await threeExportControl.locator(':scope > summary').click();
const bordersBeforeToggle = await page.locator('#threeBorders').isChecked();
await page.locator('#threeBorderControl').click();
assert.equal(await page.locator('#threeBorders').isChecked(), !bordersBeforeToggle);
await page.locator('#fit3dBtn').click();

await page.locator('#threePanel .export-control > summary').click();
assert.equal(await page.locator('#threeExportCancelBtn').isHidden(), true);
const glbDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportModelBtn').click();
const glbDownload = await glbDownloadPromise;
assert.equal(glbDownload.suggestedFilename(), 'wafercad-model.glb');
assert.ok(await glbDownload.path());
await page.locator('#threePanel .export-control > summary').click();
const pngDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportPngBtn').click();
assert.equal((await pngDownloadPromise).suggestedFilename(), 'wafercad-3d-3x.png');

assert.equal(await page.locator('#maskSelectionSummary').count(), 0);

assert.equal(await page.locator('#threeHost').getAttribute('data-render-error'), null);
assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log('WaferCAD interaction regression: OK');
