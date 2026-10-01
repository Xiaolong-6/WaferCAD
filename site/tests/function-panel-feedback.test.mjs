import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const feedback = await readFile(
  new URL('../controllers/feedback-controller.js', import.meta.url),
  'utf8',
);
const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const projectState = await readFile(
  new URL('../controllers/project-state-controller.js', import.meta.url),
  'utf8',
);

test('function panel uses Process and Project labels with segmented process modes', () => {
  assert.match(html, /id="operationTab"[\s\S]*?>\s*Process\s*<\/button>/);
  assert.match(html, /id="settingsTab"[\s\S]*?>\s*Project\s*<\/button>/);
  for (const mode of ['add', 'grow', 'etch']) {
    assert.match(html, new RegExp(`data-process-mode="${mode}"`));
  }
  assert.match(html, />\s*Deposit\s*<\/button>/);
  assert.match(html, />\s*Extend\s*<\/button>/);
  assert.match(html, /<span>Coverage<\/span\s*>/);
  assert.match(html, />Directional<\/option>/);
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

test('Process UI is driven by material presence and exposed Extend targets', () => {
  assert.match(app, /baseCoverageState\(model\)/);
  assert.match(app, /exposedLayerIds\(model, area, activeFace\)/);
  assert.match(app, /All material has been removed/);
  assert.match(app, /Base fully removed/);
});


test('Mask alignment view overlays neutral structure outlines beneath adjustable mask opacity', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(html, /id="maskOpacityValue"/);
  assert.match(app, /function drawMaskStructureReference\(/);
  assert.match(app, /maskStructurePatches\(\)/);
  assert.match(app, /ctx\.globalAlpha = maskOpacity/);
  assert.match(app, /drawMaskStructureReference\(ctx, v\)/);
});


test('Mask alignment opacity is persisted and applies only to the mask overlay', () => {
  assert.match(html, /id="maskOpacityRange"/);
  assert.match(app, /ctx\.globalAlpha = maskOpacity/);
  assert.match(app, /drawMaskStructureReference\(ctx, v\)/);
  assert.match(app, /same-height surface groups across materials/);
  assert.match(projectState, /maskOpacity: state\.maskOpacity/);
  assert.match(projectState, /project\.display\?\.maskOpacity == null \? 0\.65/);
});

test('landscape workspace keeps panel sizes while reordering the five windows', () => {
  assert.match(
    style,
    /grid-template-areas:\s*'mask mask three three tools tools'\s*'main main section section section section'/,
  );
  assert.match(
    style,
    /@media \(max-width: 900px\)[\s\S]*?'tools three'[\s\S]*?'main mask'[\s\S]*?'section section'/,
  );
});

test('workstation visual system keeps scientific controls visually unified', () => {
  assert.match(style, /\/\* Workstation visual system/);
  assert.match(style, /\.view-head \.mini-btn,[\s\S]*?\.view-head \.three-control/);
  assert.match(style, /\.view-panel,[\s\S]*?\.tool-panel \{/);
  assert.match(style, /\.tool-tab\.active[\s\S]*?inset 0 -2px 0 var\(--accent\)/);
  assert.match(style, /\.control-section input,[\s\S]*?\.control-section select/);
  assert.match(style, /\.statusbar\[data-level='warning'\]/);
});

