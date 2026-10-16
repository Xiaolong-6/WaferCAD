import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkstationRenderScheduler } from '../ui-v2/workstation-render-scheduler.js';

test('mobile navigation updates Shell and docking schedule without invalidating all scientific views', () => {
  const calls = [];
  const render = createWorkstationRenderScheduler({
    isStarting: () => false,
    renderShell: () => calls.push('shell'),
    invalidateScientific: () => calls.push('scientific'),
    invalidateVisibleView: (key) => calls.push(`view:${key}`),
    scheduleLayout: () => calls.push('layout'),
  });
  for (let index = 0; index < 5; index++) render({ scientific: false });
  assert.equal(calls.filter((item) => item === 'shell').length, 5);
  assert.equal(calls.filter((item) => item === 'scientific').length, 0);
  assert.equal(calls.filter((item) => item === 'layout').length, 5);
});

test('model workflow and breakpoint repaint retain full scientific invalidation by default', () => {
  const calls = [];
  const render = createWorkstationRenderScheduler({
    isStarting: () => false,
    renderShell: () => calls.push('shell'),
    invalidateScientific: () => calls.push('scientific'),
    invalidateVisibleView: (key) => calls.push(`view:${key}`),
    scheduleLayout: () => calls.push('layout'),
  });
  render();
  assert.deepEqual(calls, ['shell', 'scientific', 'layout']);
});

test('initial shell boot does not invalidate incomplete scientific hosts', () => {
  let starting = true;
  const calls = [];
  const render = createWorkstationRenderScheduler({
    isStarting: () => starting,
    renderShell: () => calls.push('shell'),
    invalidateScientific: () => calls.push('scientific'),
    invalidateVisibleView: (key) => calls.push(`view:${key}`),
    scheduleLayout: () => calls.push('layout'),
  });
  render();
  assert.deepEqual(calls, []);
  starting = false;
  render({ scientific: false });
  assert.deepEqual(calls, ['shell', 'layout']);
});

test('returning to a scientific view invalidates only that view', () => {
  const calls = [];
  const render = createWorkstationRenderScheduler({
    isStarting: () => false,
    renderShell: () => calls.push('shell'),
    invalidateScientific: () => calls.push('all'),
    invalidateVisibleView: (key) => calls.push(`view:${key}`),
    scheduleLayout: () => calls.push('layout'),
  });
  render({ scientificView: 'mask' });
  assert.deepEqual(calls, ['shell', 'view:mask', 'layout']);
});
