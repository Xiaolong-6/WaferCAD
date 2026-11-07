import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SCIENTIFIC_CANVAS_BACKGROUND } from '../scientific-canvas-background.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Main, Mask and Section use one opaque white scientific canvas background', () => {
  assert.equal(SCIENTIFIC_CANVAS_BACKGROUND, '#ffffff');
  assert.match(source('../ui-v2/tokens.css'), /--wc-canvas-background: #ffffff;/);
  assert.match(
    source('../ui-v2/view-kit/plan-stage.css'),
    /background: var\(--wc-canvas-background, #ffffff\)/,
  );
  assert.match(
    source('../ui-v2/workstation-views.css'),
    /\.v2-section-body \.p-science \{[^}]*background: var\(--wc-canvas-background, #ffffff\)/,
  );
  const renderer = source('../plan-renderers.js');
  assert.equal(
    (renderer.match(/ctx\.fillStyle = SCIENTIFIC_CANVAS_BACKGROUND;/g) || []).length,
    2,
    'Section initial fill and collapsed Z interval must share the same background',
  );
  assert.match(
    source('../controllers/section-detail-roi-controller.js'),
    /ctx\.fillStyle = SCIENTIFIC_CANVAS_BACKGROUND;/,
  );
});

test('Main and Section SVG exports use the same white background and Z break', () => {
  const exporter = source('../controllers/export-controller.js');
  assert.match(exporter, /scientific-canvas-background\.js/);
  assert.equal(
    (exporter.match(/fill="\$\{SCIENTIFIC_CANVAS_BACKGROUND\}"/g) || []).length,
    2,
    'Both SVG root background and collapsed Section gap must be white',
  );
});
