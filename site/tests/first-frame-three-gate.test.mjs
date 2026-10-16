import assert from 'node:assert/strict';
import test from 'node:test';
import { createFirstFrameThreeGate } from '../ui-v2/first-frame-three-gate.js';

test('first planar frame can present before queued WebGL initialization', () => {
  let afterPaint;
  let renders = 0;
  const gate = createFirstFrameThreeGate(
    () => ++renders,
    (callback) => {
      afterPaint = callback;
    },
  );
  gate.request();
  gate.request();
  assert.equal(renders, 0, 'Startup must not initialize WebGL before the planar paint');
  assert.equal(gate.release(), true);
  assert.equal(gate.release(), false, 'Multiple visible planar frames schedule only one release');
  gate.request();
  assert.equal(renders, 0, '3D remains deferred until the after-paint callback');
  afterPaint();
  assert.equal(renders, 1, 'Queued 3D requests collapse into one initial render');
  gate.request();
  assert.equal(renders, 2, 'Subsequent 3D interactions render without deferral');
});

test('3D-only startup can release before the first render request', () => {
  let afterPaint;
  let renders = 0;
  const gate = createFirstFrameThreeGate(
    () => ++renders,
    (callback) => {
      afterPaint = callback;
    },
  );
  assert.equal(gate.release(), true);
  afterPaint();
  assert.equal(renders, 0);
  gate.request();
  assert.equal(renders, 1);
});
