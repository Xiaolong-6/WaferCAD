import assert from 'node:assert/strict';
import test from 'node:test';
import { correlateWebglFramesWithLongTasks } from './p1-webgl-frame-correlation.mjs';

test('GL-frame correlation selects the greatest overlap without masking long tasks', () => {
  const tasks = [
    { startEpochMs: 1000, durationMs: 1050 },
    { startEpochMs: 2100, durationMs: 800 },
    { startEpochMs: 3000, durationMs: 499 },
  ];
  const frames = [
    { serial: 1, startEpochMs: 1010, endEpochMs: 1950, renderMs: 940, quality: 'fast' },
    { serial: 2, startEpochMs: 2200, endEpochMs: 2450, renderMs: 250, quality: 'quality' },
    { serial: 3, startEpochMs: 2300, endEpochMs: 2800, renderMs: 500, quality: 'quality' },
  ];
  const matched = correlateWebglFramesWithLongTasks(tasks, frames);
  assert.equal(matched.length, 2);
  assert.equal(matched[0].frame.serial, 1);
  assert.equal(matched[0].frame.overlapMs, 940);
  assert.equal(matched[0].frame.taskOverlapFraction, 0.895);
  assert.equal(matched[1].frame.serial, 3);
  assert.equal(matched[1].frame.overlapMs, 500);
  assert.equal(matched[1].durationMs, 800);
});

test('GL-frame correlation preserves unrelated tasks and rejects invalid frame spans', () => {
  const tasks = [{ startEpochMs: 5000, durationMs: 700 }];
  const result = correlateWebglFramesWithLongTasks(tasks, [
    { serial: 1, startEpochMs: 6000, endEpochMs: 6400 },
    { serial: 2, startEpochMs: 5100, endEpochMs: 5050 },
    { serial: 3, startEpochMs: NaN, endEpochMs: 5500 },
  ]);
  assert.deepEqual(result, [{ startEpochMs: 5000, durationMs: 700, frame: null }]);
  assert.deepEqual(correlateWebglFramesWithLongTasks(), []);
});
