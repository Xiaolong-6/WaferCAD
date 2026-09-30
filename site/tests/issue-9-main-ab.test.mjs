import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('Main exposes explicit A–B controls, locked dragging, and double-click Fit', () => {
  assert.match(html, /id="sectionControlsBtn"/);
  assert.match(html, /id="sectionCoordsPanel"[^>]*hidden/s);
  assert.match(html, /id="sectionPanelClose"/);
  assert.match(html, /id="sectionEditBtn"/);
  assert.match(html, /id="resetSectionBtn"/);
  assert.match(html, /id="sectionAx"/);
  assert.match(html, /id="sectionBy"/);
  assert.match(app, /sectionEditEnabled = false/);
  assert.match(app, /main\.addEventListener\('dblclick'/);
  assert.match(app, /createSectionEditor/);
  assert.match(html, /id="sectionEndpointHandles"/);
});
