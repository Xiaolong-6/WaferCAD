import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyHint,
  isBaseOnlyModel,
  isMaskContentEmpty,
  shouldShowEmptyProcessHint,
} from '../ui-v2/view-kit/empty-state.js';

const base = () => ({
  layers: [{ id: 'base' }],
  regions: [{ stack: [{ layerId: 'base', z0: -6, z1: 6 }] }],
  processRevision: 0,
  implants: [],
  electricalRegions: [],
});

test('Main hint detects only pristine base-only models', () => {
  assert.equal(isBaseOnlyModel(base()), true);
  assert.equal(isBaseOnlyModel({ ...base(), processRevision: 1 }), false);
  assert.equal(isBaseOnlyModel({ ...base(), layers: [{ id: 'deposit' }] }), false);
  assert.equal(
    isBaseOnlyModel({ ...base(), regions: [{ stack: [{ layerId: 'deposit' }] }] }),
    false,
  );
  assert.equal(isBaseOnlyModel({ ...base(), implants: [{ id: 1 }] }), false);
  assert.equal(isBaseOnlyModel({ ...base(), electricalRegions: [{ id: 1 }] }), false);
  assert.equal(isBaseOnlyModel({ ...base(), array: { instances: [{ x: 0, y: 0 }] } }), false);
  assert.equal(isBaseOnlyModel(null), false);
});

test('History edit of a Base-only predecessor does not show new-project instruction', () => {
  assert.equal(shouldShowEmptyProcessHint(base(), false), true);
  assert.equal(shouldShowEmptyProcessHint(base(), true), false);
  assert.equal(shouldShowEmptyProcessHint({ ...base(), processRevision: 1 }, false), false);
});

test('Mask onboarding hint appears only when both File and Draw sources are empty', () => {
  const state = {
    maskSourceMode: 'file',
    layout: { elements: [], linework: [] },
    drawMask: { shapes: [] },
  };
  assert.equal(isMaskContentEmpty(state), true);
  state.layout.elements.push({ id: 'imported-GDS-rectangle' });
  assert.equal(isMaskContentEmpty(state), false);
  state.maskSourceMode = 'draw';
  assert.equal(
    isMaskContentEmpty(state),
    false,
    'Switching to empty Draw cannot restore onboarding',
  );
  state.layout.elements = [];
  assert.equal(isMaskContentEmpty(state), true);
  state.layout.linework.push({ id: 'imported-GDS-path' });
  assert.equal(isMaskContentEmpty(state), false, 'File linework is Mask content');
  state.layout.linework = [];
  state.drawMask.shapes.push({ id: 'drawn-rectangle' });
  assert.equal(isMaskContentEmpty(state), false);
  state.maskSourceMode = 'file';
  assert.equal(
    isMaskContentEmpty(state),
    false,
    'Switching to empty File cannot restore onboarding',
  );
  state.drawMask.shapes = [];
  assert.equal(isMaskContentEmpty(state), true);
  assert.equal(isMaskContentEmpty(null), false);
});

test('Hint actions are inline buttons and hidden visibility is reversible', () => {
  const oldDocument = globalThis.document;
  const makeNode = (name) => ({
    name,
    children: [],
    attributes: {},
    listeners: {},
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
  });
  globalThis.document = {
    createElement: makeNode,
    createTextNode: (text) => ({ text }),
  };
  try {
    let activated = 0;
    const hint = createEmptyHint({
      label: 'Empty mask',
      parts: [{ text: 'Draw', onClick: () => activated++ }, ' or import a mask.'],
    });
    assert.equal(hint.node.hidden, true);
    assert.equal(hint.node.attributes.role, 'group');
    assert.equal(hint.node.attributes['aria-label'], 'Empty mask');
    const action = hint.node.children[0].children[0];
    assert.equal(action.name, 'button');
    assert.equal(action.type, 'button');
    action.listeners.click();
    assert.equal(activated, 1);
    hint.update(true);
    assert.equal(hint.node.hidden, false);
    hint.update(false);
    assert.equal(hint.node.hidden, true);
  } finally {
    globalThis.document = oldDocument;
  }
});
