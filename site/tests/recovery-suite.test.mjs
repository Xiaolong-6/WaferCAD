// Preserve npm test's original flat test glob and auto-discover grouped Recovery checks.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const root = new URL('./recovery/', import.meta.url);
const tests = (await readdir(root)).filter((name) => name.endsWith('.test.mjs')).sort();
for (const owner of [
  'project-controller-recovery.test.mjs',
  'workspace-dirty-domains.test.mjs',
  'workspace-restore-worker.test.mjs',
  'workspace-storage-worker.test.mjs',
]) {
  assert.ok(tests.includes(owner), `missing Recovery scientific test owner: ${owner}`);
}
for (const name of tests) await import(new URL(name, root).href);
