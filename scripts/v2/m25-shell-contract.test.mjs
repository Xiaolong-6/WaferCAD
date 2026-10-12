// M2.5 fast contract checks. The browser identity probe lives in check-m2-shell.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const file = (name) => readFile(name, 'utf8');
test('registry supplies all named surfaces, and navigation is extensible', async () => {
  const source = await file('site/ui-v2/shell-registry.js');
  const sandbox = { window: {}, structuredClone };
  runInNewContext(source, sandbox);
  const registry = sandbox.window.WaferCadV2ShellRegistry;
  const slots = registry.defaults.slots;
  for (const name of [
    'topbar.project',
    'navigation.primary',
    ...['project', 'base', 'mask', 'process', 'history'].map((key) => `panel.${key}`),
    ...['step', 'recipe', 'code', 'diagnostics'].map((key) => `panel.process.${key}`),
    ...['main', 'mask', 'three', 'section'].flatMap((key) =>
      ['header', 'actions', 'stage', 'readout', 'overlays'].map((part) => `view.${key}.${part}`),
    ),
    'portal.popover',
    'portal.dialog',
    'portal.toast',
    'status.message',
    'status.save',
    'status.version',
  ])
    assert.ok(slots.includes(name), name);
  assert.equal(registry.defaults.nestedPanels.base, 'project');
  assert.equal(registry.defaults.subpanelOwner, 'process');
  const extended = registry.define({
    primaryNav: [...registry.defaults.primaryNav, { key: 'custom', label: 'Custom' }],
  });
  assert.ok(extended.primaryNav.some((item) => item.key === 'custom'));
});

test('adapter lifecycle mounts once, toggles visibility, destroys once', async () => {
  const sandbox = { window: {} };
  runInNewContext(await file('site/ui-v2/domain-adapters.js'), sandbox);
  const host = {};
  const events = [];
  const adapters = sandbox.window.WaferCadV2DomainAdapters.create();
  adapters.register('example', {
    mount(node) {
      assert.equal(node, host);
      events.push('mount');
      return node;
    },
    onShow() {
      events.push('show');
    },
    onHide() {
      events.push('hide');
    },
    destroy() {
      events.push('destroy');
    },
  });
  adapters.show('example', host);
  adapters.show('example', host);
  adapters.hide('example');
  adapters.show('example', host);
  adapters.destroy();
  assert.deepEqual(events, ['mount', 'show', 'hide', 'show', 'hide', 'destroy']);
});

test('shell does not embed business state or replace renderer-owned hosts', async () => {
  const [shell, view, production, css] = await Promise.all([
    file('site/ui-v2/workstation-v2.js'),
    file('site/ui-v2/view-panel.js'),
    file('site/ui-v2/app.html'),
    file('site/ui-v2/workstation-v2.css'),
  ]);
  assert.doesNotMatch(shell, /task|history|placement|dirty/i);
  assert.doesNotMatch(view, /#layerLegend|\.p-science/);
  assert.ok(view.includes('data-v2-stage-host'));
  assert.ok(!view.includes('panel.replaceChildren('));
  assert.ok(!view.includes('stage.replaceChildren('));
  assert.doesNotMatch(production, /mock-data\.js|mock-workspace\.js|mock-domain-panels\.js/);
  assert.match(production, /<html[^>]+lang="en"/);
  assert.doesNotMatch(css, /z-index:\s*\d|!important/);
});
