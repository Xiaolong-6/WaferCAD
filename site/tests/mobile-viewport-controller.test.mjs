import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileViewportController } from '../ui-v2/mobile-viewport-controller.js';

function fixture() {
  const win = new EventTarget();
  win.innerHeight = 844;
  win.visualViewport = new EventTarget();
  win.visualViewport.height = 844;
  const doc = new EventTarget();
  doc.activeElement = { matches: () => false };
  const root = { dataset: {} };
  const state = { mobile: 'view' };
  let compact = true;
  const controller = createMobileViewportController({
    root,
    state,
    compact: () => compact,
    win,
    doc,
  });
  return { win, doc, root, state, controller, setCompact: (value) => (compact = value) };
}

test('keyboard overlay hides compact Edit dock only while a text control is focused', () => {
  const f = fixture();
  assert.equal(f.root.dataset.keyboard, 'closed');
  f.state.mobile = 'edit';
  f.doc.activeElement = { matches: (query) => query.includes('textarea') };
  f.win.visualViewport.height = 590;
  f.doc.dispatchEvent(new Event('focusin'));
  assert.equal(f.root.dataset.keyboard, 'open');
  f.doc.activeElement = { matches: () => false };
  f.doc.dispatchEvent(new Event('focusout'));
  assert.equal(f.root.dataset.keyboard, 'closed');
  f.doc.activeElement = { matches: () => true };
  f.state.mobile = 'view';
  f.controller.update();
  assert.equal(f.root.dataset.keyboard, 'closed');
});

test('height-only visualViewport changes update keyboard state without remounting', () => {
  const f = fixture();
  f.state.mobile = 'edit';
  f.doc.activeElement = { matches: () => true };
  const root = f.root;
  f.win.visualViewport.height = 620;
  f.win.visualViewport.dispatchEvent(new Event('resize'));
  assert.equal(root.dataset.keyboard, 'open');
  f.win.visualViewport.height = 844;
  f.win.visualViewport.dispatchEvent(new Event('resize'));
  assert.equal(root.dataset.keyboard, 'closed');
  assert.equal(f.root, root);
});

test('compact threshold and teardown prevent stray keyboard state updates', () => {
  const f = fixture();
  f.state.mobile = 'edit';
  f.doc.activeElement = { matches: () => true };
  f.win.visualViewport.height = 600;
  f.setCompact(false);
  f.win.dispatchEvent(new Event('resize'));
  assert.equal(f.root.dataset.keyboard, 'closed');
  f.setCompact(true);
  f.controller.update();
  assert.equal(f.root.dataset.keyboard, 'open');
  f.controller.destroy();
  f.controller.destroy();
  f.root.dataset.keyboard = 'closed';
  f.win.visualViewport.dispatchEvent(new Event('resize'));
  f.doc.dispatchEvent(new Event('focusin'));
  assert.equal(f.root.dataset.keyboard, 'closed');
});
