import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// This controller imports the strict polygon kernel; bootstrap the project's
// vendored CommonJS kernel before loading it, as in the existing model tests.
const vendor = readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8');
const cjs = { exports: {} };
new Function('module', 'exports', vendor)(cjs, cjs.exports);
globalThis.polygonClipping = cjs.exports;
const { createSectionCollapseController } = await import('../controllers/section-collapse-controller.js');

test('Z Break editor keeps geometry and tooltip ownership in existing controllers', async () => {
  const source = await readFile('site/ui-v2/z-break-editor.js', 'utf8');
  const section = await readFile('site/ui-v2/section-view.js', 'utf8');
  assert.match(source, /dataset\.help = key/);
  assert.match(source, /dataset\.helpDetail = description/);
  assert.match(source, /collapse\.bounds\(\)/);
  assert.match(source, /collapse\.startDrag\(key, event\)/);
  assert.match(source, /input\.reportValidity\(\)/);
  assert.match(section, /createZBreakEditor\(/);
  assert.match(section, /workstation\.overlays\.mountFloating\(/);
  assert.doesNotMatch(source, /createCollapsedZDisplayTransform|modelBoundsZ|setSectionCollapse/);
});

test('typed Z break boundaries are accepted only when normalization preserves both edges', () => {
  const original = { top: 80, bottom: 20, enabled: true };
  const controller = createSectionCollapseController({
    root: { getElementById: () => ({ dataset: { zMinUm: '0', zMaxUm: '100' } }) },
    getModel: () => ({ regions: [] }),
    getSectionCollapse: () => original,
    setSectionCollapse: () => {
      throw Error('Validation must not mutate the displayed state');
    },
    renderSection: () => {},
    formatXY: String,
    xyUnitLabel: () => 'µm',
  });
  assert.equal(controller.acceptsBoundary('top', 90), true);
  assert.equal(controller.acceptsBoundary('bottom', 10), true);
  assert.equal(controller.acceptsBoundary('top', 21), false);
  assert.equal(controller.acceptsBoundary('bottom', 79), false);
  assert.equal(controller.acceptsBoundary('top', 100), false);
  assert.equal(controller.acceptsBoundary('bottom', -1), false);
  assert.equal(controller.acceptsBoundary('top', Number.NaN), false);
  assert.deepEqual(original, { top: 80, bottom: 20, enabled: true });
});
