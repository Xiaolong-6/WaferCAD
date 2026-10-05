import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const sectionControls = await readFile(
  new URL('../controllers/section-controls-controller.js', import.meta.url),
  'utf8',
);
const mainCanvas = await readFile(
  new URL('../controllers/main-canvas-controller.js', import.meta.url),
  'utf8',
);
const sectionEditor = await readFile(new URL('../section-editor.js', import.meta.url), 'utf8');

test('Slice is always editable and the Slice button starts one-shot A–B creation', () => {
  assert.match(html, /id="sectionControlsBtn"/);
  assert.match(html, /id="sectionCoordsPanel"[^>]*hidden/s);
  assert.match(html, />\s*Slice\s*<\/button>/);
  assert.match(html, /id="sectionEndpointHandles"/);
  assert.match(html, /id="sectionAx"/);
  assert.match(html, /id="sectionBy"/);

  assert.match(sectionControls, /function setCreateMode\(enabled\)/);
  assert.match(sectionControls, /setPanelVisible\(panel\.hidden, \{ create: panel\.hidden \}\)/);
  assert.match(sectionControls, /Slice created\. Drag A\/B or the line itself/);

  assert.match(sectionEditor, /mode: 'create'/);
  assert.match(sectionEditor, /mode: 'line'/);
  assert.match(sectionEditor, /distanceToSegment/);
  assert.match(sectionEditor, /Existing Slice geometry is always editable/);
  assert.match(sectionEditor, /host\.hidden = false/);

  assert.match(app, /sectionEditEnabled = false/);
  assert.match(mainCanvas, /main\.addEventListener\('dblclick'/);
  assert.match(mainCanvas, /getSectionCreateMode/);
  assert.match(mainCanvas, /isRoiDrawing/);
});

test('ROI and Slice controls are mutually exclusive in the Main header', () => {
  assert.match(sectionControls, /if \(visible\) closeRoiControls\(\)/);
  assert.match(
    app,
    /closeSliceControls: \(\) => setSectionPanelVisible\(false, \{ create: false \}\)/,
  );
});
