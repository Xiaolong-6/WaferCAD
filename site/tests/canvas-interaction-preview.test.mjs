import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasInteractionPreview } from '../canvas-interaction-preview.js';

function fixture() {
  const calls = [];
  const frames = new Map();
  const timers = new Map();
  let nextId = 0;
  let renders = 0;
  const context = {
    save() {
      calls.push(['save']);
    },
    restore() {
      calls.push(['restore']);
    },
    setTransform(...values) {
      calls.push(['transform', ...values]);
    },
    clearRect(...values) {
      calls.push(['clear', ...values]);
    },
    drawImage(...values) {
      calls.push(['draw', ...values.slice(1)]);
    },
  };
  const canvas = {
    width: 400,
    height: 200,
    ownerDocument: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        return { width: 0, height: 0, getContext: () => context };
      },
    },
    getBoundingClientRect: () => ({ width: 200, height: 100 }),
    getContext: () => context,
  };
  const preview = createCanvasInteractionPreview({
    getCanvas: () => canvas,
    render() {
      renders++;
    },
    requestFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    setTimer(callback) {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
  });
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  const settle = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  };
  return {
    calls,
    frames,
    timers,
    canvas,
    preview,
    flushFrames,
    settle,
    get renders() {
      return renders;
    },
  };
}

test('dense pan/zoom reprojects one raster and redraws scientific vectors only after settling', () => {
  const ui = fixture();
  const base = { s: 1, cx: 0, cy: 0 };
  ui.preview.request(base, { s: 2, cx: 10, cy: 20 });
  ui.preview.request({ s: 2, cx: 10, cy: 20 }, { s: 3, cx: 15, cy: 25 });
  assert.equal(ui.preview.pending, true);
  assert.equal(ui.frames.size, 1, 'Consecutive wheel events share a paint frame');
  assert.equal(ui.timers.size, 1, 'Only the last gesture schedules the exact redraw');
  assert.equal(ui.renders, 0);
  ui.flushFrames();
  assert.ok(
    ui.calls.some(
      ([name, x, y, width, height]) =>
        name === 'draw' && x === 30 && y === 50 && width === 1200 && height === 600,
    ),
  );
  ui.settle();
  assert.equal(ui.renders, 1);
  assert.equal(ui.preview.pending, false);
});

test('cancelling an interaction leaves no late raster or delayed redraw', () => {
  const ui = fixture();
  ui.preview.request({ s: 1, cx: 0, cy: 0 }, { s: 1.5, cx: 5, cy: 8 });
  ui.preview.cancel();
  ui.flushFrames();
  ui.settle();
  assert.equal(ui.renders, 0);
  assert.equal(ui.preview.pending, false);
});

test('invalid transforms fall back to the authoritative renderer immediately', () => {
  const ui = fixture();
  ui.preview.request({ s: 0, cx: 0, cy: 0 }, { s: 1, cx: 0, cy: 0 });
  assert.equal(ui.renders, 1);
  assert.equal(ui.preview.pending, false);
});
