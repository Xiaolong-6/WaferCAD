import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalogSource = readFileSync(new URL('../ui-v2/tooltip-catalog.js', import.meta.url), 'utf8');
const paths = [
  '../ui-v2/workstation-v2.js',
  '../ui-v2/main-view.js',
  '../ui-v2/mask-view.js',
  '../ui-v2/three-view.js',
  '../ui-v2/section-view.js',
  '../ui-v2/section-legend.js',
  '../ui-v2/workstation-workflow.js',
  '../ui-v2/project-mask-panels.js',
  '../ui-v2/view-kit/floating-strip.js',
  '../controllers/project-controller.js',
  '../controllers/mask-browser-controller.js',
];
const win = {};
new Function('window', catalogSource)(win);
const catalog = win.WaferCadV2TooltipCatalog;
const source = paths.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('contextual help catalog resolves all literal opt-in keys', () => {
  const keys = [
    ...source.matchAll(/['"]data-help['"]\s*:\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\.dataset\.help\s*=\s*['"]([^'"]+)['"]/g),
  ];
  for (const match of keys) {
    assert.ok(catalog.has(match[1]), `Missing tooltip catalog entry ${match[1]}`);
    const text = catalog.resolve(match[1], { value: 'front', dataset: {}, getAttribute: () => '' });
    assert.ok(text[0].trim() && text[1].trim(), `Empty tooltip: ${match[1]}`);
  }
  assert.ok(keys.length >= 20);
});

test('Section color swatches use the same contextual catalog, retaining the chosen color', () => {
  assert.match(catalog.resolve('section.color', { dataset: {} })[1], /Physical geometry is unchanged/);
  const description = catalog.resolve('section.color.option', { dataset: { color: '#A1B2C3' } });
  assert.equal(description[0], 'Apply color');
  assert.match(description[1], /#A1B2C3/);
});

test('Both-face help respects two independent deposited layers', () => {
  const node = { value: 'both' };
  assert.match(catalog.resolve('process.face', node)[1], /front, then the back/);
  assert.match(catalog.resolve('process.face', node)[1], /two separate material layers/);
});

test('tooltip service keeps native canvas event and model code untouched', () => {
  const controller = readFileSync(
    new URL('../ui-v2/tooltip-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /pointerover/);
  assert.match(controller, /focusin/);
  assert.doesNotMatch(controller, /preventDefault|stopPropagation/);
  assert.doesNotMatch(controller, /innerHTML|requestAnimationFrame|setInterval/);
  assert.match(controller, /textContent/);
});
