// Retain the stable flat npm test glob while grouping native History Node owners.
// Import every nested test rather than maintaining a selectively runnable subset.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const root = new URL('./history/', import.meta.url);
const tests = (await readdir(root)).filter((name) => name.endsWith('.test.mjs')).sort();
for (const name of [
  'history-head-worker.test.mjs',
  'history-mutation-controller.test.mjs',
  'history-operation-label.test.mjs',
  'history-recovery-fault-matrix.test.mjs',
  'history-replay.test.mjs',
]) {
  assert.ok(tests.includes(name), `missing History scientific test owner: ${name}`);
}
for (const name of tests) await import(new URL(name, root).href);
