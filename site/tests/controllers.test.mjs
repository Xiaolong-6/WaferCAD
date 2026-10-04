import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { createBuildController } = await import('../controllers/build-controller.js');
const { createPlanViewController } = await import('../controllers/plan-view-controller.js');
const { createStartupController } = await import('../controllers/startup-controller.js');
const { createWorkspaceSessionController } = await import(
  '../controllers/workspace-session-controller.js'
);

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
  const updates = [];
  const responses = [
    { ok: true, json: async () => ({ commit: 'abcdef1234567890' }) },
    { ok: true, json: async () => ({ commit: 'fedcba9876543210' }) },
  ];
  const controller = createBuildController({
    buildVersion: 'abcdef1234567890',
    status: (message) => messages.push(message),
    documentRef: { getElementById: () => host },
    fetchImpl: async () => responses.shift(),
    onUpdateAvailable: (commit) => updates.push(commit),
  });

  await controller.loadBuildCommit();
  assert.equal(host.textContent, 'commit abcdef1');
  assert.match(host.href, /commit\/abcdef1234567890$/);

  await controller.checkForBuildUpdate();
  assert.equal(host.textContent, 'commit abcdef1 · update');
  assert.match(host.title, /deployed fedcba9/);
  assert.deepEqual(messages, [
    'Update fedcba9 available. Use Reload safely to update without losing the workspace.',
  ]);
  assert.deepEqual(updates, ['fedcba9876543210']);
});

test('workspace session allows only one writer until explicit takeover', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const listenersA = new Map();
  const listenersB = new Map();
  const windowA = {
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: (name, fn) => listenersA.set(name, fn),
    removeEventListener: (name) => listenersA.delete(name),
  };
  const windowB = {
    setInterval: () => 2,
    clearInterval: () => {},
    addEventListener: (name, fn) => listenersB.set(name, fn),
    removeEventListener: (name) => listenersB.delete(name),
  };
  let clock = 1000;
  const first = createWorkspaceSessionController({
    storage,
    windowRef: windowA,
    now: () => clock,
    tabId: 'tab-a',
  });
  const second = createWorkspaceSessionController({
    storage,
    windowRef: windowB,
    now: () => clock,
    tabId: 'tab-b',
  });

  assert.equal(first.start(), true);
  assert.equal(second.start(), false);
  assert.equal(first.canWrite(), true);
  assert.equal(second.canWrite(), false);

  assert.equal(second.takeOver(), true);
  assert.equal(second.hasWriteLease(), true);
  // Before tab A receives its storage event, its cached writable flag is stale.
  // The commit guard must still observe the live lease synchronously.
  assert.equal(first.canWrite(), true);
  assert.equal(first.hasWriteLease(), false);
  listenersA.get('storage')?.({
    key: 'wafercad.workspace.owner.v1',
    newValue: storage.getItem('wafercad.workspace.owner.v1'),
  });
  assert.equal(second.canWrite(), true);
  assert.equal(first.canWrite(), false);

  clock += 8000;
  assert.equal(first.takeOver(), true);
  first.stop();
  second.stop();
});

test('workspace session does not silently acquire an expired lease after starting read-only', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let clock = 1000;
  let secondRenew = null;
  const first = createWorkspaceSessionController({
    storage,
    windowRef: {
      setInterval: () => 1,
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    now: () => clock,
    tabId: 'owner',
  });
  const second = createWorkspaceSessionController({
    storage,
    windowRef: {
      setInterval: (fn) => {
        secondRenew = fn;
        return 2;
      },
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    now: () => clock,
    tabId: 'paused-tab',
  });

  assert.equal(first.start(), true);
  assert.equal(second.start(), false);
  clock += 8000;
  secondRenew?.();
  assert.equal(second.canWrite(), false);
  assert.equal(second.hasWriteLease(), false);
  assert.equal(second.takeOver(), true);
  assert.equal(second.hasWriteLease(), true);

  first.stop();
  second.stop();
});

test('workspace session keeps a stable tab identity across reloads', () => {
  const leaseValues = new Map();
  const sessionValues = new Map();
  const storage = {
    getItem: (key) => leaseValues.get(key) ?? null,
    setItem: (key, value) => leaseValues.set(key, value),
    removeItem: (key) => leaseValues.delete(key),
  };
  const sessionStorage = {
    getItem: (key) => sessionValues.get(key) ?? null,
    setItem: (key, value) => sessionValues.set(key, value),
  };
  const windowRef = {
    sessionStorage,
    crypto: { randomUUID: () => 'stable-tab-id' },
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const beforeReload = createWorkspaceSessionController({ storage, windowRef });
  assert.equal(beforeReload.start(), true);
  assert.equal(beforeReload.tabId, 'stable-tab-id');

  // Simulate a reload that occurs before pagehide had a chance to release the
  // old lease. sessionStorage identifies it as the same browser tab.
  const afterReload = createWorkspaceSessionController({ storage, windowRef });
  assert.equal(afterReload.tabId, 'stable-tab-id');
  assert.equal(afterReload.start(), true);
  assert.equal(afterReload.canWrite(), true);

  beforeReload.stop();
  afterReload.stop();
});

test('workspace session stays usable when localStorage is unavailable', () => {
  const storage = {
    getItem: () => {
      throw new Error('storage blocked');
    },
    setItem: () => {
      throw new Error('storage blocked');
    },
    removeItem: () => {
      throw new Error('storage blocked');
    },
  };
  const windowRef = {
    sessionStorage: null,
    crypto: { randomUUID: () => 'private-tab' },
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const session = createWorkspaceSessionController({ storage, windowRef });
  assert.equal(session.start(), true);
  assert.equal(session.canWrite(), true);
  assert.equal(session.hasWriteLease(), true);
  session.stop();
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

  const started = await controller.initializeWorkspaceStart();

  assert.equal(started, true);
  assert.deepEqual(calls, [
    ['history', null, '', './app.html'],
    ['layout', file],
  ]);
});

test('startup controller reports a staged open failure so persistence can restore current state', async () => {
  const file = { name: 'broken.wafercad' };
  const controller = createStartupController({
    takeStartupFile: async () => ({ kind: 'project', file }),
    openLayoutFile: async () => true,
    openProjectFile: async () => false,
    status: () => {},
    locationRef: { search: '?start=staged' },
    historyRef: { replaceState: () => {} },
  });

  assert.equal(await controller.initializeWorkspaceStart(), false);
});

test('startup controller defaults example intent to the promoted literature project', async () => {
  const calls = [];
  const controller = createStartupController({
    takeStartupFile: async () => {
      calls.push(['take']);
      return null;
    },
    openLayoutFile: async () => calls.push(['layout']),
    openProjectFile: async () => calls.push(['project']),
    openBundledExample: async (id) => calls.push(['bundled', id]),
    status: (message) => calls.push(['status', message]),
    locationRef: { search: '?start=example' },
    historyRef: { replaceState: (...args) => calls.push(['history', ...args]) },
  });

  await controller.initializeWorkspaceStart();

  assert.deepEqual(calls, [
    ['history', null, '', './app.html'],
    ['bundled', 'photodetector-literature'],
  ]);
});

test('plan view controller preserves coordinate round-trips and resets in place', () => {
  const model = {
    width: 200,
    height: 100,
    revision: 1,
    regions: [],
  };
  const layout = {
    elements: [],
    linework: [],
    bounds: { minX: -50, minY: -25, maxX: 50, maxY: 25, width: 100, height: 50 },
  };
  const planViews = {
    mask: { zoom: 2, panX: 12, panY: -8 },
    main: { zoom: 1.5, panX: -4, panY: 6 },
  };
  const maskState = planViews.mask;
  let maskRenders = 0;
  let mainRenders = 0;

  const controller = createPlanViewController({
    windowRef: { devicePixelRatio: 1 },
    getModel: () => model,
    getLayout: () => layout,
    getMaskTransform: () => ({ scale: 1 }),
    getPlanViews: () => planViews,
    maskPoint: (point) => point,
    formatXY: (value) => String(value),
    xyToDisplay: (value) => value,
    xyFromDisplay: (value) => value,
    xyUnitLabel: () => 'µm',
    renderMask: () => {
      maskRenders += 1;
    },
    renderMain: () => {
      mainRenders += 1;
    },
  });

  const view = controller.viewport(800, 500, 'mask');
  const world = [17.25, -9.5];
  const canvas = controller.worldToCanvas(world, view);
  const roundTrip = controller.canvasToWorld(canvas[0], canvas[1], view);

  assert.ok(Math.abs(roundTrip[0] - world[0]) < 1e-12);
  assert.ok(Math.abs(roundTrip[1] - world[1]) < 1e-12);

  controller.resetPlanView('mask');
  assert.equal(planViews.mask, maskState);
  assert.deepEqual(planViews.mask, { zoom: 1, panX: 0, panY: 0 });
  assert.equal(maskRenders, 1);
  assert.equal(mainRenders, 0);
});
