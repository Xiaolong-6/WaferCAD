import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRoiController } from '../controllers/roi-controller.js';

function fixture() {
  const ids = [],
    nodes = new Map();
  const root = {
    getElementById(id) {
      ids.push(id);
      if (!nodes.has(id))
        nodes.set(id, {
          addEventListener() {},
          querySelector: () => ({ addEventListener() {} }),
        });
      return nodes.get(id);
    },
    querySelectorAll: () => [],
  };
  return { root, ids };
}

test('Main-only ROI binding requires neither Mask nor legacy control nodes', () => {
  const { root, ids } = fixture();
  const controller = createRoiController({ root });
  controller.bind({ mainOnly: true });
  assert.deepEqual(ids, ['mainCanvas']);
});

test('Default ROI binding retains legacy controls and both canvas paths', () => {
  const { root, ids } = fixture();
  const controller = createRoiController({ root });
  controller.bind();
  assert.ok(ids.includes('focusEditor'));
  assert.ok(ids.includes('roiAnchorSelect'));
  assert.ok(ids.includes('maskCanvas'));
  assert.ok(ids.includes('mainCanvas'));
});

test('Injected editor synchronization receives authoritative ROI without DOM reads', () => {
  const { root, ids } = fixture();
  const roi = { type: 'rect', a: [1, 2], b: [4, 6] };
  let received;
  createRoiController({
    root,
    getRoi: () => roi,
    onEditorSync: (value) => {
      received = value;
    },
  }).syncEditor();
  assert.equal(received, roi);
  assert.deepEqual(ids, []);
});

test('Main entry loads M2 presentation and never boots or copies legacy markup', async () => {
  const route = await readFile(new URL('../app-v2-main.html', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../ui-v2/main-runtime.js', import.meta.url), 'utf8');
  const view = await readFile(new URL('../ui-v2/main-view.js', import.meta.url), 'utf8');
  assert.match(route, /ui-v2\/view-panel.js/);
  assert.match(route, /ui-v2\/main-view.js/);
  assert.doesNotMatch(route, /real-view-bridge|workstation\.css|\.\/style\.css/);
  assert.doesNotMatch(
    runtime + view,
    /(?:import|fetch)\s*\(?[^\n]*["'](?:[^"']*\/)?app\.(?:js|html)["']/,
  );
  assert.doesNotMatch(runtime + view, /DOMParser|cloneNode|document\.importNode/);
});
