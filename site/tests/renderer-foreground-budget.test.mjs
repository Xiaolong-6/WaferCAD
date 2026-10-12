import assert from 'node:assert/strict';
import test from 'node:test';
import { FOREGROUND_ASSEMBLY_BUDGET_MS, shouldYieldForegroundAssembly, yieldToForeground } from '../renderer-foreground-budget.js';

test('foreground assembly yields on a bounded interval', () => {
  assert.equal(FOREGROUND_ASSEMBLY_BUDGET_MS, 8);
  assert.equal(shouldYieldForegroundAssembly({ enabled: false, elapsedMs: 99 }), false);
  assert.equal(shouldYieldForegroundAssembly({ enabled: true, elapsedMs: 7 }), false);
  assert.equal(shouldYieldForegroundAssembly({ enabled: true, elapsedMs: 8 }), true);
});

test('yield lets the browser event loop process other tasks', async () => {
  let finished = false;
  const promise = yieldToForeground().then(() => { finished = true; });
  assert.equal(finished, false);
  await promise;
  assert.equal(finished, true);
});
