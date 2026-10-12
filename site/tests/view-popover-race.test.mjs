import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewPopoverController } from '../controllers/view-popover-controller.js';

// Minimal DOM fixture; toggle events are dispatched separately from open-state
// changes to reproduce the browser's delayed details event ordering.
class Node extends EventTarget {
  constructor(selector, parent = null) {
    super();
    this.selector = selector;
    this.parent = parent;
    this.children = [];
    this.open = false;
    this.summary = new EventTarget();
    parent?.children.push(this);
  }
  matches(selector) {
    return this.selector === selector;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parent?.closest(selector);
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap((child) => [child, ...child.descendants()]);
    if (selector === '.view-panel details') return descendants.filter((node) => node.isDetails);
    if (selector === 'details[open]')
      return descendants.filter((node) => node.isDetails && node.open);
    return [];
  }
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  querySelector(selector) {
    return selector === ':scope > summary' ? this.summary : this.querySelectorAll(selector)[0];
  }
}

function fixture() {
  const root = new Node('document');
  const panel = new Node('.view-panel', root);
  const more = new Node('.view-more-control', panel);
  const secondary = new Node('.view-overflow-secondary', more);
  const opacity = new Node('.mask-opacity-control', secondary);
  const exported = new Node('.export-control', more);
  for (const node of [more, opacity, exported]) node.isDetails = true;
  createViewPopoverController({ root }).bind();
  more.open = true;
  return { more, opacity, exported };
}

test('delayed Opacity close keeps the newly opened Export and its More owner open', () => {
  const { more, opacity, exported } = fixture();
  opacity.open = true;
  opacity.open = false;
  exported.open = true;
  opacity.dispatchEvent(new Event('toggle'));
  exported.dispatchEvent(new Event('toggle'));
  assert.equal(more.open, true);
  assert.equal(exported.open, true);
  assert.equal(opacity.open, false);
});

test('closing the final secondary editor still releases More back to the canvas', () => {
  const { more, opacity } = fixture();
  opacity.open = true;
  opacity.open = false;
  opacity.dispatchEvent(new Event('toggle'));
  assert.equal(more.open, false);
});

test('explicitly closing More still closes every nested open control', () => {
  const { more, opacity, exported } = fixture();
  opacity.open = true;
  exported.open = true;
  more.open = false;
  more.dispatchEvent(new Event('toggle'));
  assert.equal(opacity.open, false);
  assert.equal(exported.open, false);
});
