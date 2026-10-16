import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressiveStartup } from '../ui-v2/progressive-startup.js';

test('project readiness cannot precede the stable shell', () => {
  const events = [];
  const flow = createProgressiveStartup({ onChange: (state) => events.push(state) });
  assert.deepEqual(flow.snapshot(), {
    shell: 'assembling',
    project: 'loading',
    firstFrame: 'pending',
    views: { main: 'pending', mask: 'pending', section: 'pending', three: 'pending' },
  });
  assert.equal(flow.projectReady(), false);
  assert.equal(flow.viewFrame('main'), false);
  assert.equal(flow.shellReady(), true);
  assert.equal(flow.shellReady(), false);
  assert.equal(flow.projectReady(), true);
  assert.equal(events.length, 2);
});

test('the first actual visible view can render while slower views are pending', () => {
  const flow = createProgressiveStartup();
  flow.shellReady();
  flow.projectReady();
  assert.equal(flow.viewFrame('main'), true);
  assert.equal(flow.snapshot().firstFrame, 'ready');
  assert.deepEqual(flow.snapshot().views, {
    main: 'ready',
    mask: 'pending',
    section: 'pending',
    three: 'pending',
  });
  assert.equal(flow.viewFrame('main'), false);
  assert.equal(flow.viewFrame('not-a-view'), false);
  assert.equal(flow.viewFrame('mask'), true);
  assert.equal(flow.viewFrame('section'), true);
});

test('3D quality refinement is optional after a coarse frame and does not mutate project data', () => {
  const flow = createProgressiveStartup();
  flow.shellReady();
  flow.projectReady();
  assert.equal(flow.viewFrame('three', 'refining'), false);
  assert.equal(flow.viewFrame('three', 'coarse'), true);
  assert.equal(flow.snapshot().firstFrame, 'ready');
  assert.equal(flow.viewFrame('three', 'refining'), true);
  assert.equal(flow.viewFrame('three', 'ready'), true);
  assert.equal(flow.viewFrame('three', 'coarse'), false);
});

test('an unavailable 3D renderer does not prevent Main from becoming ready', () => {
  const flow = createProgressiveStartup();
  flow.shellReady();
  flow.projectReady();
  assert.equal(flow.viewFrame('three', 'unavailable'), true);
  assert.equal(flow.snapshot().firstFrame, 'pending');
  assert.equal(flow.viewFrame('main'), true);
  assert.equal(flow.snapshot().firstFrame, 'ready');
});
