import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { drawPlanGrid, niceGridStep } from '../plan-grid.js';

test('grid step follows 1/2/5/10 scaling and never gets denser than 26px', () => {
  for (const scale of [0.0002, 0.001, 0.02, 0.3, 1, 3.5, 100]) {
    const step = niceGridStep(scale);
    assert.ok(step * scale >= 26 - 1e-8, `too dense: ${scale}`);
    assert.ok(step * scale < 100, `too sparse: ${scale}`);
    const decade = 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 5].some((factor) => Math.abs(step / decade - factor) < 1e-9));
  }
  assert.equal(niceGridStep(0), null);
  assert.equal(niceGridStep(Infinity), null);
});

test('grid lines are panned with world origin and classified into three levels', () => {
  const strokes = [];
  let lines = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {
      lines = [];
    },
    moveTo(x, y) {
      lines.push(['move', x, y]);
    },
    lineTo(x, y) {
      lines.push(['line', x, y]);
    },
    stroke() {
      strokes.push({ color: this.strokeStyle, lines: [...lines] });
    },
  };
  const viewport = { s: 1, cx: 100, cy: 80 };
  const worldToCanvas = ([x, y], v) => [v.cx + x * v.s, v.cy - y * v.s];
  const palette = { minor: '#aaa', major: '#bbb', axis: '#ccc' };
  drawPlanGrid(ctx, viewport, 600, 400, worldToCanvas, palette);
  assert.ok(strokes.some((stroke) => stroke.color === palette.minor));
  assert.ok(strokes.some((stroke) => stroke.color === palette.major));
  const axis = strokes.find((stroke) => stroke.color === palette.axis);
  assert.ok(axis.lines.some((line) => line[0] === 'move' && line[1] === 100.5));
  assert.ok(axis.lines.some((line) => line[0] === 'move' && line[2] === 80.5));
  const before = strokes.length;
  drawPlanGrid(ctx, { ...viewport, s: 0 }, 600, 400, worldToCanvas, palette);
  assert.equal(strokes.length, before);
});

test('existing project snapshot loader retains the saved model and material colors', () => {
  const source = readFileSync(
    new URL('../controllers/project-state-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /const model = project\.model;/);
  assert.match(source, /applyState\(\{\s*model,/);
  const newModel = readFileSync(new URL('../model.js', import.meta.url), 'utf8');
  assert.match(newModel, /export const BASE_COLOR = '#DDE4EC';/);
});
