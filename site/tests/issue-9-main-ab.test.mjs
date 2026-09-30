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

test('Main exposes explicit A–B controls, locked dragging, and double-click Fit', () => {
  assert.match(html, /id="sectionControlsBtn"/);
  assert.match(html, /id="sectionCoordsPanel"[^>]*hidden/s);
  assert.doesNotMatch(html, /id="sectionPanelClose"/);
  assert.match(
    sectionControls,
    /sectionControlsBtn'\)\.onclick = \(\) => setPanelVisible\(\$\('sectionCoordsPanel'\)\.hidden\)/,
  );
  assert.match(html, /id="sectionEditBtn"/);
  assert.match(html, /id="resetSectionBtn"/);
  assert.match(html, /id="sectionAx"/);
  assert.match(html, /id="sectionBy"/);
  assert.match(app, /sectionEditEnabled = false/);
  assert.match(mainCanvas, /main\.addEventListener\('dblclick'/);
  assert.match(mainCanvas, /createSectionEditor/);
  assert.match(html, /id="sectionEndpointHandles"/);
});
