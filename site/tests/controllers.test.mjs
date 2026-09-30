import assert from 'node:assert/strict';
import test from 'node:test';

import { createBuildController } from '../controllers/build-controller.js';
import { createStartupController } from '../controllers/startup-controller.js';

function buildHost() {
  return {
    textContent: '',
    href: '',
    target: '',
    rel: '',
    title: '',
    removeAttribute(name) {
      this[name] = '';
    },
  };
}

test('build controller renders deployed commit and announces a newer build', async () => {
  const host = buildHost();
  const messages = [];
  const responses = [
    { ok: true, json: async () => ({ commit: 'abcdef1234567890' }) },
    { ok: true, json: async () => ({ commit: 'fedcba9876543210' }) },
  ];
  const controller = createBuildController({
    buildVersion: 'abcdef1234567890',
    status: (message) => messages.push(message),
    documentRef: { getElementById: () => host },
    fetchImpl: async () => responses.shift(),
  });

  await controller.loadBuildCommit();
  assert.equal(host.textContent, 'commit abcdef1');
  assert.match(host.href, /commit\/abcdef1234567890$/);

  await controller.checkForBuildUpdate();
  assert.equal(host.textContent, 'commit abcdef1 · update');
  assert.match(host.title, /deployed fedcba9/);
  assert.deepEqual(messages, ['Update fedcba9 available. Save the project, then reload the page.']);
});

test('startup controller consumes a staged layout and clears the startup query', async () => {
  const calls = [];
  const file = { name: 'layout.oas' };
  const controller = createStartupController({
    takeStartupFile: async () => ({ kind: 'layout', file }),
    openLayoutFile: async (value) => calls.push(['layout', value]),
    openProjectFile: async (value) => calls.push(['project', value]),
    openVisualizationExample: () => calls.push(['example']),
    status: (message) => calls.push(['status', message]),
    locationRef: { search: '?start=staged' },
    historyRef: { replaceState: (...args) => calls.push(['history', ...args]) },
  });

  await controller.initializeWorkspaceStart();

  assert.deepEqual(calls, [
    ['history', null, '', './app.html'],
    ['layout', file],
  ]);
});

test('startup controller opens the example without touching staged files', async () => {
  const calls = [];
  const controller = createStartupController({
    takeStartupFile: async () => {
      calls.push(['take']);
      return null;
    },
    openLayoutFile: async () => calls.push(['layout']),
    openProjectFile: async () => calls.push(['project']),
    openVisualizationExample: () => calls.push(['example']),
    status: (message) => calls.push(['status', message]),
    locationRef: { search: '?start=example' },
    historyRef: { replaceState: (...args) => calls.push(['history', ...args]) },
  });

  await controller.initializeWorkspaceStart();

  assert.deepEqual(calls, [['history', null, '', './app.html'], ['example']]);
});
