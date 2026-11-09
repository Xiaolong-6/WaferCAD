import assert from 'node:assert/strict';
import test from 'node:test';
import { maskVisibleOutlineEdges } from '../mask-outline-edges.js';
import { createPlanRenderers } from '../plan-renderers.js';

test('ordinary GDS squares retain the original Canvas outline fast path', () => {
  assert.equal(
    maskVisibleOutlineEdges([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]),
    null,
  );
});

test('a source keyhole excludes paired zero-width bridges without changing polygon vertices', () => {
  const points = [
    [4990, 4990],
    [-4990, 4990],
    [-4990, -4800],
    [-4800, -4800],
    [-4800, 4800],
    [4800, 4800],
    [4800, -4800],
    [-4800, -4800],
    [-4990, -4800],
    [-4990, -4990],
    [4990, -4990],
  ];
  const before = structuredClone(points);
  const edges = maskVisibleOutlineEdges(points);
  assert.equal(edges.length, points.length - 2);
  assert.equal(
    edges.some(([a, b]) => a[0] === -4990 && a[1] === -4800 && b[0] === -4800 && b[1] === -4800),
    false,
  );
  assert.deepEqual(points, before);
});

test('only matching opposite directions cancel, not same-direction edges', () => {
  const p = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
    [2, 0],
    [2, 2],
  ];
  assert.equal(maskVisibleOutlineEdges(p), null);
});

test(
  'original chip2 has 17 source keyholes, all drawn without their reversible connector edges',
  { skip: !process.env.WAFERCAD_TRANSMON_GDS && 'Source GDS not supplied' },
  async () => {
    const { readFile } = await import('node:fs/promises');
    const { flattenGDS, parseGDS } = await import('../gds.js');
    const bytes = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
    const parsed = parseGDS(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const source = flattenGDS(parsed, 'chip2').elements;
    let cleaned = 0;
    let fastSquares = 0;
    for (const element of source) {
      const edges = maskVisibleOutlineEdges(element.points);
      if (edges) {
        cleaned++;
        assert.ok(edges.length < element.points.length);
      } else if (element.points.length === 4 && element.layer === 2) {
        fastSquares++;
      }
    }
    assert.equal(cleaned, 17);
    assert.ok(fastSquares >= 39194, 'Source apertures retain the constant-time fast path');
  },
);

test('production Mask Canvas renders source keyholes without missing integration imports', () => {
  const points = [
    [0, 0],
    [8, 0],
    [8, 8],
    [5, 8],
    [5, 5],
    [5, 8],
    [0, 8],
  ];
  const fillRules = [];
  let strokes = 0;
  const context = {
    clearRect() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill(rule) {
      fillRules.push(rule);
    },
    stroke() {
      strokes++;
    },
  };
  const layout = {
    elements: [{ kind: 'polygon', layer: 2, datatype: 0, points }],
    linework: [],
    maskPresentation: {
      background: '#fff',
      showStructure: false,
      showUnselected: false,
      layers: [{ layer: 2, datatype: 0, color: '#123456', mode: 'fill', opacity: 1 }],
    },
  };
  const renderer = createPlanRenderers({
    root: { getElementById: () => ({}) },
    getState: () => ({
      model: {},
      activeFace: 'front',
      maskSourceMode: 'file',
      layout,
      maskOpacity: 1,
      readOnlyPreview: true,
      maskTransform: { scale: 1 },
    }),
    setupCanvas: () => ({ ctx: context, w: 100, h: 100 }),
    viewport: () => ({ s: 1, cx: 10, cy: 10 }),
    worldToCanvas: ([x, y], v) => [v.cx + x * v.s, v.cy - y * v.s],
    maskPoint: (point) => point,
    selectedElement: () => true,
    layerKey: (layer, datatype) => `${layer}|${datatype}`,
    layerColor: () => '#123456',
    drawPlanAxes() {},
  });
  renderer.renderMask();
  assert.deepEqual(fillRules, ['evenodd']);
  assert.ok(strokes > 0);
});
