import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../ui-v2/overlay-manager.js', import.meta.url), 'utf8');

class MockNode {
  constructor(tagName = 'DETAILS') {
    this.tagName = tagName;
    this.open = false;
    this.hidden = true;
    this.isConnected = true;
    this.focusCount = 0;
    this.handlers = new Map();
    this.attributes = new Map();
  }
  addEventListener(type, callback) {
    const list = this.handlers.get(type) || [];
    list.push(callback);
    this.handlers.set(type, list);
  }
  removeEventListener(type, callback) {
    this.handlers.set(
      type,
      (this.handlers.get(type) || []).filter((fn) => fn !== callback),
    );
  }
  dispatchEvent(event) {
    for (const callback of this.handlers.get(event.type) || []) callback(event);
    return !event.defaultPrevented;
  }
  fire(type) {
    this.dispatchEvent({ type, newState: this.open ? 'open' : 'closed' });
  }
  matches() {
    return false;
  }
  querySelector() {
    return this.summary || null;
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  getAttribute(key) {
    return this.attributes.get(key);
  }
  focus() {
    this.focusCount++;
  }
  close() {
    this.open = false;
    this.hidden = true;
    this.fire('toggle');
  }
}
class MockEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.cancelable = Boolean(opts.cancelable);
    this.defaultPrevented = false;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
}
class MockObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}
function fixture() {
  const win = {};
  new Function('window', 'MutationObserver', 'CustomEvent', source)(win, MockObserver, MockEvent);
  return win.WaferCadV2Overlays.create({ root: {}, portals: {} });
}
function owner() {
  const details = new MockNode();
  details.hidden = false;
  details.summary = new MockNode('SUMMARY');
  const dialog = new MockNode('DIALOG');
  const trigger = new MockNode('BUTTON');
  trigger.attributes.set('aria-controls', 'sectionCollapseEditor');
  dialog.id = 'sectionCollapseEditor';
  const panel = {
    isConnected: true,
    visible: true,
    querySelectorAll(selector) {
      if (selector === 'details') return [details];
      if (selector === '[data-view-popover-panel]') return [dialog];
      return [];
    },
    querySelector(selector) {
      return selector === '[aria-controls="sectionCollapseEditor"]' ? trigger : null;
    },
    checkVisibility() {
      return this.visible;
    },
  };
  return { panel, details, dialog, trigger };
}
test('shared close(popover) closes the original native menu, preserving node identity', () => {
  const manager = fixture();
  const first = owner();
  const native = manager.adoptNativeViews([first.panel]);
  first.details.open = true;
  first.details.fire('toggle');
  manager.close('popover', 'escape');
  assert.equal(first.details.open, false);
  assert.equal(first.details.summary.focusCount, 1);
  native.destroy();
});

test('opening native More in another view closes previously adopted More', () => {
  const manager = fixture();
  const first = owner(),
    second = owner();
  const native = manager.adoptNativeViews([first.panel, second.panel]);
  first.details.open = true;
  first.details.fire('toggle');
  second.details.open = true;
  second.details.fire('toggle');
  assert.equal(first.details.open, false);
  assert.equal(second.details.open, true);
  assert.equal(first.details.summary.focusCount, 0, 'replaced menu must not steal focus');
  native.destroy();
});

test('nested ROI details preserve their responsive More parent while both are open', () => {
  const manager = fixture();
  const sample = owner();
  const child = new MockNode();
  child.summary = new MockNode('SUMMARY');
  sample.details.contains = (node) => node === child;
  const original = sample.panel.querySelectorAll;
  sample.panel.querySelectorAll = (selector) =>
    selector === 'details' ? [sample.details, child] : original(selector);
  const native = manager.adoptNativeViews([sample.panel]);
  sample.details.open = true;
  sample.details.fire('toggle');
  child.open = true;
  child.fire('toggle');
  assert.equal(sample.details.open, true, 'More parent must not collapse');
  assert.equal(child.open, true, 'ROI child must remain open');
  native.destroy();
});

test('original Z Break dialog replaces native More and delegates closure to its native owner', () => {
  const manager = fixture();
  const first = owner();
  first.dialog.addEventListener('wafercad:popover-close', (event) => {
    event.preventDefault();
    first.dialog.close();
  });
  const native = manager.adoptNativeViews([first.panel]);
  first.details.open = true;
  first.details.fire('toggle');
  first.dialog.hidden = false;
  first.dialog.open = true;
  first.dialog.fire('toggle');
  assert.equal(first.details.open, false);
  manager.close('dialog', 'escape');
  assert.equal(first.dialog.open, false);
  assert.equal(first.trigger.focusCount, 1);
  native.destroy();
});

test('hiding a panel closes its active original More without focus theft', () => {
  const manager = fixture();
  const first = owner();
  const native = manager.adoptNativeViews([first.panel]);
  first.details.open = true;
  first.details.fire('toggle');
  first.panel.visible = false;
  native.sync();
  assert.equal(first.details.open, false);
  assert.equal(first.details.summary.focusCount, 0);
  native.destroy();
});
