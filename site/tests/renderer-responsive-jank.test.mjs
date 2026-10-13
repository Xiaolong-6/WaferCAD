import assert from 'node:assert/strict';
import test from 'node:test';
import { createRendererLongTaskSampler } from '../renderer-responsive-jank.js';

test('long-task distribution retains bounded samples and excludes short tasks', () => {
  const tracker = createRendererLongTaskSampler({ capacity: 3 });
  assert.equal(tracker.record(20), false);
  assert.equal(tracker.record(50), true);
  tracker.record(80);
  tracker.record(100);
  tracker.record(60);
  assert.deepEqual(tracker.snapshot(), {
    count: 3,
    p95Ms: 100,
    maxMs: 100,
    blockingMs: 90,
  });
});

test('long-task telemetry rejects nonfinite samples and invalid bounds', () => {
  const tracker = createRendererLongTaskSampler();
  assert.equal(tracker.record(NaN), false);
  assert.equal(tracker.record(Infinity), false);
  assert.deepEqual(tracker.snapshot(), {
    count: 0,
    p95Ms: null,
    maxMs: null,
    blockingMs: 0,
  });
  assert.throws(() => createRendererLongTaskSampler({ capacity: 0 }), RangeError);
  assert.throws(() => createRendererLongTaskSampler({ thresholdMs: 0 }), RangeError);
});
