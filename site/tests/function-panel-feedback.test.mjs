import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const feedback = await readFile(
  new URL('../controllers/feedback-controller.js', import.meta.url),
  'utf8',
);

test('function panel uses Process and Project labels with segmented process modes', () => {
  assert.match(html, /id="operationTab"[\s\S]*?>\s*Process\s*<\/button>/);
  assert.match(html, /id="settingsTab"[\s\S]*?>\s*Project\s*<\/button>/);
  for (const mode of ['add', 'grow', 'etch']) {
    assert.match(html, new RegExp(`data-process-mode="${mode}"`));
  }
  assert.match(html, /id="processSummary"/);
  assert.match(html, /id="operationValidation"/);
});

test('typed feedback exposes passive, progress, success, warning and error states', () => {
  assert.match(html, /id="statusBar"[^>]*data-level="passive"/);
  assert.match(html, /id="feedbackToasts"/);
  assert.match(feedback, /return 'progress'/);
  assert.match(feedback, /return 'warning'/);
  assert.match(feedback, /return 'success'/);
  assert.match(feedback, /return 'error'/);
  assert.match(feedback, /return 'passive'/);
});

test('Process UI is driven by material presence and exposed grow targets', () => {
  assert.match(app, /baseCoverageState\(model\)/);
  assert.match(app, /exposedLayerIds\(model, area, activeFace\)/);
  assert.match(app, /All material has been removed/);
  assert.match(app, /Base fully removed/);
});
