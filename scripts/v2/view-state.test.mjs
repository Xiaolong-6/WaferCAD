import test from 'node:test';
import assert from 'node:assert/strict';
import '../../site/ui-v2/view-state.js';
import {
  preferredWorkstationViewMode,
  normalizeSplitViews,
  replaceSplitSlotView,
} from '../../site/workstation-ui.js';
const state = globalThis.WaferCadV2ViewState;
test('v2 mode defaults and remembered modes match legacy at all width boundaries', () => {
  for (const width of [390, 768, 820, 821, 1024, 1120, 1121, 1440])
    for (const mode of ['', 'main', 'mask', 'three', 'overview', 'split', 'bad'])
      assert.equal(state.preferredMode(width, mode), preferredWorkstationViewMode(width, mode));
});
test('v2 split normalization and swap keep two distinct original views', () => {
  for (const pair of [null, [], ['main', 'main'], ['three', 'mask'], ['bad', 'bad']]) {
    assert.deepEqual(state.normalizeSplit(pair), normalizeSplitViews(pair));
    for (const slot of ['left', 'right', 0, 1])
      for (const view of ['main', 'mask', 'three', 'bad'])
        assert.deepEqual(
          state.replaceSlot(pair, slot, view),
          replaceSplitSlotView(pair, slot, view),
        );
  }
});
test('only sessionStorage and the original two keys are used', () => {
  const values = new Map();
  const win = {
    sessionStorage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    },
  };
  Object.defineProperty(win, 'localStorage', {
    get() {
      throw new Error('Must not use localStorage');
    },
  });
  state.remember(win, 'split', ['mask', 'three']);
  assert.equal(state.readMode(win), 'split');
  assert.deepEqual(state.readSplit(win), ['mask', 'three']);
  assert.deepEqual(
    [...values.keys()],
    ['wafercad.workstation-view-mode.v1', 'wafercad.workstation-split-views.v1'],
  );
});
test('denied or malformed storage leaves the shell usable', () => {
  const denied = {
    get sessionStorage() {
      throw new Error('denied');
    },
  };
  assert.equal(state.readMode(denied), '');
  assert.deepEqual(state.readSplit(denied), ['main', 'three']);
  assert.doesNotThrow(() => state.remember(denied, 'split', ['main', 'three']));
  assert.deepEqual(state.readSplit({ sessionStorage: { getItem: () => '{bad' } }), [
    'main',
    'three',
  ]);
});
test('coarse small screens retain the legacy compact contract', () => {
  const win = { innerWidth: 1024, screen: { width: 390 }, matchMedia: () => ({ matches: true }) };
  assert.equal(state.compact(win), true);
  assert.equal(state.preferredMode(state.viewportWidth(win), 'split'), 'main');
});
