import assert from 'node:assert/strict';
import test from 'node:test';
import { createDialogConfirmation } from '../ui-v2/view-kit/confirmation-dialog.js';

function harness() {
  let opened,
    focused = null,
    closeCount = 0;
  const el = (tag, attrs = {}, ...children) => ({
    tag, attrs, children: children.flat().filter((item) => item != null),
  });
  const button = (label, _action, _glyph, attrs = {}) => ({
    tag: 'button',
    label,
    attrs,
    focus() {
      focused = label;
    },
  });
  const overlays = {
    mount(type, options) {
      assert.equal(type, 'dialog');
      opened = options;
    },
    close(type) {
      assert.equal(type, 'dialog');
      closeCount++;
      opened?.onClose?.('closed');
    },
  };
  const findButtons = (node) =>
    !node || typeof node !== 'object'
      ? []
      : node.tag === 'button'
        ? [node]
        : (node.children || []).flatMap(findButtons);
  return {
    dialog: createDialogConfirmation({ overlays, el, button }),
    opened: () => opened,
    buttons: () => findButtons(opened?.content),
    focused: () => focused,
    closeCount: () => closeCount,
  };
}

test('History edit actions are vertical with a distinct Cancel footer', async () => {
  const h = harness();
  const pending = h.dialog.ask({
    title: 'Save edited Step',
    message: 'Save changes?',
    detail: '8 later Steps follow',
    actions: [
      { value: 'cancel', label: 'Cancel' },
      {
        value: 'replace-discard',
        label: 'Replace & discard later Steps',
        kind: 'danger',
        helpKey: 'history.edit.discard',
        description: 'Remove 8 later Steps',
      },
      {
        value: 'replace-replay',
        label: 'Replace & replay later Steps',
        helpKey: 'history.edit.replay',
        description: 'Replay 8 later Steps',
      },
      { value: 'branch-edit-replay', label: 'New Variant · Carry later Steps' },
      { value: 'branch-edit', label: 'New Variant · Edited Step only' },
    ],
  });
  const children = h.opened().content.children;
  const options = children.find((child) => child?.attrs?.class === 'v2-confirm-dialog-choices');
  const footer = children.find(
    (child) => child?.attrs?.class === 'p-actions v2-confirm-dialog-footer',
  );
  assert.equal(options.children.length, 4);
  assert.equal(footer.children.length, 1);
  assert.equal(h.buttons().length, 5);
  assert.equal(h.buttons()[0].attrs['data-risk'], 'danger');
  assert.equal(h.buttons()[0].attrs['data-help'], 'history.edit.discard');
  const choices = h
    .opened()
    .content.children.find((entry) => entry?.attrs?.class === 'v2-confirm-dialog-choices');
  assert.ok(choices);
  assert.ok(
    choices.children.every(
      (entry) => entry.children.length === 1 && entry.children[0].tag === 'button',
    ),
    'Choice labels are buttons only: detail belongs to the shared hover tooltip',
  );
  assert.equal(h.focused(), 'Cancel', 'Dangerous options must not autofocus');
  h.buttons()[1].onclick();
  assert.equal(await pending, 'replace-replay');
  assert.equal(h.closeCount(), 1);
});

test('Escape and backdrop return cancellation without applying a choice', async () => {
  const h = harness();
  const pending = h.dialog.ask({
    title: 'Insert before Step',
    message: 'Insert?',
    actions: [
      { value: 'cancel', label: 'Cancel' },
      { value: 'branch-start', label: 'Start' },
    ],
  });
  h.opened().onClose('escape');
  assert.equal(await pending, 'cancel');
  assert.equal(h.closeCount(), 0);
});

test('danger confirmation keeps destructive semantics and focuses Cancel', async () => {
  const h = harness();
  const pending = h.dialog.confirm({
    title: 'Clear mask',
    message: 'Remove all shapes?',
    confirmLabel: 'Clear mask',
    danger: true,
  });
  assert.equal(h.buttons()[0].attrs['data-risk'], 'danger');
  assert.equal(h.buttons()[0].attrs.primary, false);
  assert.equal(h.focused(), 'Cancel');
  h.buttons().at(-1).onclick();
  assert.equal(await pending, false);
});

test('two-action confirmation preserves boolean semantics for Mask', async () => {
  const h = harness();
  const pending = h.dialog.confirm({
    title: 'Delete mask shape?',
    message: 'Delete this shape?',
    confirmLabel: 'Delete',
  });
  assert.equal(h.buttons().length, 2);
  assert.equal(h.buttons()[0].attrs.primary, true);
  h.buttons()[0].onclick();
  assert.equal(await pending, true);
});
