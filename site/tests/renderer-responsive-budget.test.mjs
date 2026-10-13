import assert from 'node:assert/strict';
import test from 'node:test';
import { runRendererUnitsInSlices } from '../renderer-responsive-budget.js';

test('bounded slices keep exact input order and yield between work units', async () => {
  const processed = [];
  let simulatedTime = 0;
  let yields = 0;
  const result = await runRendererUnitsInSlices(
    [1, 2, 3, 4, 5, 6, 7],
    (item) => {
      processed.push(item);
      simulatedTime += 3;
    },
    {
      now: () => simulatedTime,
      yieldControl: async () => {
        yields++;
      },
      maxUnitsPerSlice: 3,
      budgetMs: 5,
    },
  );
  assert.deepEqual(processed, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.completed, true);
  assert.equal(result.processed, 7);
  assert.ok(result.yields >= 3);
  assert.equal(result.yields, yields);
  assert.equal(result.maxUnitMs, 3);
});

test('foreground activity pauses background application and supersession cancels it', async () => {
  let foreground = true;
  let current = true;
  const processed = [];
  const resumed = await runRendererUnitsInSlices([1, 2], (x) => processed.push(x), {
    now: () => 0,
    foregroundBusy: () => foreground,
    yieldControl: async () => {
      foreground = false;
    },
  });
  assert.equal(resumed.completed, true);
  assert.deepEqual(processed, [1, 2]);
  const cancelled = await runRendererUnitsInSlices([3, 4], (x) => processed.push(x), {
    now: () => 0,
    maxUnitsPerSlice: 1,
    isCurrent: () => current,
    yieldControl: async () => {
      current = false;
    },
  });
  assert.equal(cancelled.completed, false);
  assert.equal(cancelled.processed, 1);
  assert.deepEqual(processed, [1, 2, 3]);
});

test('invalid scheduling budgets fail closed', async () => {
  await assert.rejects(
    runRendererUnitsInSlices([], () => {}, {
      now: () => 0,
      yieldControl: async () => {},
      budgetMs: 0,
    }),
    TypeError,
  );
});
