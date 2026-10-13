import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectRendererGpuUploadUnits,
  prewarmRendererGpuUploads,
} from '../renderer-responsive-gpu-prewarm.js';

function source(geometry, kind = 'isMesh') {
  return {
    [kind]: true,
    geometry: { getAttribute: () => ({ count: 6 }), ...geometry },
  };
}

test('P2.6 collects upload geometry once without altering scientific objects', () => {
  const geometry = { getAttribute: () => ({ count: 6 }) };
  const a = { isMesh: true, geometry };
  const b = { isMesh: true, geometry };
  const c = { isLine: true, geometry: { getAttribute: () => ({ count: 2 }) } };
  const empty = { isMesh: true, geometry: { getAttribute: () => ({ count: 0 }) } };
  const items = [a, b, c, empty, { geometry }, null];
  assert.deepEqual(collectRendererGpuUploadUnits(items), [a, c]);
  assert.equal(a.visible, undefined);
  assert.equal(b.geometry, geometry);
  assert.deepEqual(collectRendererGpuUploadUnits(), []);
});

test('P2.6 slices actual prewarm submission and yields between bounded batches', async () => {
  const events = [];
  const units = [1, 2, 3, 4, 5];
  let clock = 0;
  const result = await prewarmRendererGpuUploads(
    units,
    (batch) => {
      events.push(['upload', batch]);
      clock += 9;
    },
    {
      now: () => clock,
      yieldControl: () => events.push(['yield']),
      maxUnitsPerBatch: 2,
    },
  );
  assert.deepEqual(events, [
    ['upload', [1, 2]],
    ['yield'],
    ['upload', [3, 4]],
    ['yield'],
    ['upload', [5]],
  ]);
  assert.deepEqual(result, {
    completed: true,
    uploadedUnits: 5,
    batches: 3,
    yields: 2,
    maxBatchMs: 9,
  });
});

test('P2.6 foreground wins and an obsolete scene never receives another GPU batch', async () => {
  let current = true;
  let busy = true;
  const events = [];
  const result = await prewarmRendererGpuUploads([1, 2, 3], (batch) => {
    events.push(batch);
    current = false;
  }, {
    now: () => 1,
    maxUnitsPerBatch: 1,
    isCurrent: () => current,
    foregroundBusy: () => busy,
    yieldControl: () => { events.push('foreground'); busy = false; },
  });
  assert.deepEqual(events, ['foreground', [1]]);
  assert.equal(result.completed, false);
  assert.equal(result.uploadedUnits, 1);
  assert.equal(result.yields, 1);
});

test('P2.6 rejects invalid settings and propagates upload errors for owner rollback', async () => {
  await assert.rejects(prewarmRendererGpuUploads([], () => {}, {}), TypeError);
  await assert.rejects(
    prewarmRendererGpuUploads([1], () => { throw new Error('WebGL lost'); }, {
      now: () => 0,
      yieldControl: async () => {},
    }),
    /WebGL lost/,
  );
  assert.equal(collectRendererGpuUploadUnits([source({})]).length, 1);
});
