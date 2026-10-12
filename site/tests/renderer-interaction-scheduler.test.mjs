import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERACTIVE_ASSEMBLY_SLICE_MS,
  shouldYieldRendererAssembly,
  yieldRendererAssembly,
} from '../renderer-interaction-scheduler.js';

test('assembly yields only at a bounded heavy-scene deadline', () => {
  assert.equal(INTERACTIVE_ASSEMBLY_SLICE_MS, 8);
  assert.equal(shouldYieldRendererAssembly(8, 8), true);
  assert.equal(shouldYieldRendererAssembly(7, 8), false);
  assert.equal(shouldYieldRendererAssembly(9, 8, { heavy: false }), false);
  assert.equal(shouldYieldRendererAssembly(NaN, 8), false);
});

test('assembly resumes after frame callback and separate task', async () => {
  const events = [];
  let frame, task;
  let completed = false;
  const pending = yieldRendererAssembly({
    requestFrame(callback) { events.push('frame-queued'); frame = callback; },
    postTask(callback) { events.push('task-queued'); task = callback; },
  }).then(() => { completed = true; events.push('resumed'); });
  assert.equal(completed, false);
  frame();
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(events, ['frame-queued', 'task-queued']);
  task();
  await pending;
  assert.equal(completed, true);
});

test('missing scheduling primitives fail explicitly', () => {
  assert.throws(() => yieldRendererAssembly(), TypeError);
});
