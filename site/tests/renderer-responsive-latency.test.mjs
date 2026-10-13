import assert from 'node:assert/strict';
import test from 'node:test';
import { createRendererLatencyTracker } from '../renderer-responsive-latency.js';

test('input-to-submit telemetry represents earliest pending event and completed JS frame', () => {
  const tracker = createRendererLatencyTracker({ capacity: 3 });
  tracker.markInput(10);
  tracker.markInput(13);
  assert.equal(tracker.completeFrame(30, 8), 20);
  assert.equal(tracker.completeFrame(42, 12), null);
  tracker.markInput(43);
  assert.equal(tracker.completeFrame(50, 5), 7);
  tracker.markInput(51);
  assert.equal(tracker.completeFrame(60, 9), 9);
  tracker.markInput(61);
  assert.equal(tracker.completeFrame(70, 11), 9);
  assert.deepEqual(tracker.snapshot(), {
    inputSamples: 3,
    inputToSubmitP95Ms: 9,
    inputToSubmitMaxMs: 9,
    frameSamples: 3,
    frameSubmitP95Ms: 11,
    frameSubmitMaxMs: 11,
  });
});

test('reset and non-finite input do not fabricate latency samples', () => {
  const tracker = createRendererLatencyTracker();
  tracker.markInput(NaN);
  tracker.markInput(4);
  tracker.resetPendingInput();
  assert.equal(tracker.completeFrame(9, 3), null);
  assert.equal(tracker.snapshot().inputSamples, 0);
  assert.throws(() => createRendererLatencyTracker({ capacity: 0 }), RangeError);
});
