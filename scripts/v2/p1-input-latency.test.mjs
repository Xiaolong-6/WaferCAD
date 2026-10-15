import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeHardwareInput,
  threeCameraGestureChanged,
  threeCameraZoomChanged,
} from './p1-input-latency.mjs';

const event = (phase, queueMs, extra = {}) => ({
  trusted: true,
  phase,
  queueMs,
  threeCanvas: true,
  ...extra,
});

test('a responsive hardware sample requires actual trusted loading-phase input', () => {
  assert.equal(summarizeHardwareInput([]).responsive, false);
  assert.equal(summarizeHardwareInput([event('ready', 2)]).responsive, false);
  assert.equal(
    summarizeHardwareInput([event('loading', 5, { trusted: false }), event('ready', 3)]).responsive,
    false,
  );
  const result = summarizeHardwareInput([
    event('loading', 16),
    event('coarse', 49),
    event('refining', 75),
    event('ready', 11),
    event('ready', -4),
    event('unavailable', 10000),
    { phase: 'ready', queueMs: NaN, trusted: true },
  ]);
  assert.deepEqual(result, {
    eventCount: 4,
    loadingEventCount: 3,
    canvasEventCount: 4,
    worstQueueMs: 75,
    worstLoadingQueueMs: 75,
    overLimitCount: 0,
    phases: ['loading', 'coarse', 'refining', 'ready'],
    responsive: true,
  });
});

test('500 ms input threshold fails closed with no samples or delayed input', () => {
  const result = summarizeHardwareInput([event('loading', 501), event('ready', 9)]);
  assert.equal(result.responsive, false);
  assert.equal(result.worstLoadingQueueMs, 501);
  assert.equal(result.overLimitCount, 1);
});

test('real Orbit/Pan/Zoom camera evidence needs finite three-vector change', () => {
  const before = { position: [115, -125, 95], target: [0, 0, 0] };
  assert.equal(threeCameraGestureChanged(before, structuredClone(before)), false);
  assert.equal(threeCameraGestureChanged(before, { ...before, position: [115, -125, 94] }), true);
  assert.equal(threeCameraGestureChanged(before, { ...before, target: [1, 0, 0] }), true);
  assert.equal(threeCameraGestureChanged(before, { position: [1, 2] }), false);
  assert.equal(threeCameraGestureChanged(before, { ...before, position: [NaN, 2, 3] }), false);
});

test('Orbit alone does not satisfy wheel zoom and zoom must change camera radius', () => {
  const before = { position: [10, 0, 0], target: [0, 0, 0] };
  const orbit = { position: [0, 10, 0], target: [0, 0, 0] };
  const zoom = { position: [0, 8, 0], target: [0, 0, 0] };
  assert.equal(threeCameraGestureChanged(before, orbit), true);
  assert.equal(threeCameraZoomChanged(before, orbit), false);
  assert.equal(threeCameraZoomChanged(orbit, zoom), true);
  assert.equal(threeCameraZoomChanged(orbit, structuredClone(orbit)), false);
  assert.equal(threeCameraZoomChanged(orbit, { position: [0, 8, NaN], target: [0, 0, 0] }), false);
  assert.equal(threeCameraZoomChanged(orbit, {}), false);
});
