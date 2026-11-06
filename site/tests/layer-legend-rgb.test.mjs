import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { hexToRgb, rgbToHex } from '../ui-v2/legend-rgb.js';

test('RGB editor accepts exactly three integer channels from 0 to 255', () => {
  assert.deepEqual(hexToRgb('#0A80ff'), [10, 128, 255]);
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  assert.equal(hexToRgb('#FFF'), null);
  assert.equal(hexToRgb('red'), null);
  assert.equal(rgbToHex([0, 128, 255]), '#0080FF');
  assert.equal(rgbToHex([' 1 ', '2', '003']), '#010203');
  for (const channels of [
    [-1, 0, 0],
    [256, 0, 0],
    ['1.5', 0, 0],
    ['-1', 0, 0],
    ['', 0, 0],
    ['NaN', 0, 0],
    [0, 0],
    [1, 2, 3, 4],
  ]) {
    assert.equal(rgbToHex(channels), null, String(channels));
  }
  for (const color of ['#123ABC', '#000000', '#FFFFFF', '#C97B84']) {
    assert.equal(rgbToHex(hexToRgb(color)), color);
  }
});

test('Section legend shares the custom RGB entry between layers and annotations', () => {
  const el = (tag, attrs = {}, ...children) => ({
    tag,
    attrs,
    style: {},
    children: children.flat().filter((child) => child != null),
  });
  const mockWindow = { WaferCadV2Components: { el } };
  runInNewContext(readFileSync(new URL('../ui-v2/section-legend.js', import.meta.url), 'utf8'), {
    window: mockWindow,
  });
  const entries = [
    { id: 'base', name: 'Si', color: '#6C8EBF' },
    { id: 'film', name: 'SiO2', color: '#ABCDEF' },
  ];
  const annotations = [
    { id: 'implant1', name: 'Boron', color: '#C97B84', kind: 'Implant' },
    { id: 'electrical1', name: 'Junction', color: '#82B6A6', kind: 'Electrical' },
  ];
  const flatten = (node) =>
    node && typeof node === 'object' && 'tag' in node
      ? [node, ...node.children.flatMap(flatten)]
      : [];
  const render = (paletteOpen, customColor) =>
    flatten(
      mockWindow.createWaferCadV2SectionLegend({
        layers: entries,
        annotations,
        paletteOpen,
        customColor,
        paletteName: 'balanced',
        open: true,
      }),
    );
  for (const key of ['layer:film', 'annotation:implant1', 'annotation:electrical1']) {
    const nodes = render(key, { key, rgb: [17, 34, 51], preview: '#112233' });
    const findAction = (name) => nodes.find((node) => node.attrs['data-action'] === name);
    assert.ok(findAction(`legend-custom:${key}`), 'plus button exists');
    assert.equal(findAction(`legend-custom:${key}`).children[0], '+');
    assert.ok(findAction(`legend-custom-cancel:${key}`));
    assert.ok(findAction(`legend-custom-apply:${key}`));
    assert.equal(nodes.filter((node) => node.attrs['data-rgb-channel']).length, 3);
    assert.deepEqual(
      nodes.filter((node) => node.attrs['data-rgb-channel']).map((node) => node.attrs.value),
      [17, 34, 51],
    );
    assert.equal(
      nodes.filter((node) => node.attrs.class === 'v2-legend-custom-hex')[0].children[0],
      '#112233',
    );
    assert.equal(nodes.filter((node) => node.attrs.class === 'v2-legend-swatch-choice').length, 20);
  }
  assert.equal(
    render('layer:film', null).filter((node) => node.attrs['data-rgb-channel']).length,
    0,
  );
  assert.equal(
    render(null, null).filter((node) => node.attrs['data-action']?.startsWith('legend-custom:'))
      .length,
    0,
  );
});
