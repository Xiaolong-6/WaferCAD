import assert from 'node:assert/strict';
import test from 'node:test';
import { maskSourceBounds, maskElementInCanvas } from '../mask-element-visibility.js';

const view = { s: 10, cx: 100, cy: 100 };
const map = ([x, y], v) => [v.cx + x * v.s, v.cy - y * v.s];
const identity = (p) => p;

test('strictly off-screen source elements are culled without editing vertices', () => {
  const points = [
    [1000, 1000],
    [1020, 1000],
    [1020, 1020],
    [1000, 1020],
  ];
  const before = structuredClone(points);
  const bounds = maskSourceBounds(points);
  assert.deepEqual(bounds, [1000, 1000, 1020, 1020]);
  assert.equal(maskElementInCanvas(bounds, identity, map, view, 200, 200), false);
  assert.deepEqual(points, before);
});

test('edge-overlap and rotation stay visible, with conservative stroke allowance', () => {
  const near = maskSourceBounds([
    [10.4, -1],
    [12, 1],
  ]);
  assert.equal(maskElementInCanvas(near, identity, map, view, 200, 200, 5), true);
  const rotate = ([x, y]) => [-y, x];
  const source = maskSourceBounds([
    [0, -1],
    [1, 0],
  ]);
  assert.equal(maskElementInCanvas(source, rotate, map, view, 200, 200), true);
});

test('failed affine transform checks are never allowed to remove geometry', () => {
  assert.equal(maskElementInCanvas(null, identity, map, view, 200, 200), true);
  assert.equal(
    maskElementInCanvas([0, 0, 1, 1], () => [NaN, 0], map, view, 200, 200),
    true,
  );
  assert.equal(
    maskSourceBounds([
      [Infinity, 0],
      [1, 0],
    ]),
    null,
  );
});

test(
  'full author chip2 renders its visible source subset at 35x without modifying polygons',
  { skip: !process.env.WAFERCAD_TRANSMON_GDS && 'Source GDS not supplied' },
  async () => {
    const { readFile } = await import('node:fs/promises');
    const { flattenGDS, parseGDS } = await import('../gds.js');
    const bytes = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
    const parsed = parseGDS(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const layout = flattenGDS(parsed, 'chip2');
    assert.equal(layout.elements.length, 39487);
    const s = (35 * (900 - 64)) / 10000;
    const center = [-3000, 1500];
    const zoomView = { s, cx: 700 - center[0] * s, cy: 450 + center[1] * s };
    let visible = 0;
    for (const element of layout.elements) {
      const bounds = maskSourceBounds(element.points);
      if (maskElementInCanvas(bounds, identity, map, zoomView, 1400, 900, 4)) visible++;
    }
    assert.ok(visible > 100, 'The selected square grid must remain visible');
    assert.ok(visible < layout.elements.length * 0.05, 'Off-screen source elements must be culled');
    assert.equal(layout.elements.length, 39487, 'Do not alter the source design');
  },
);
