// Keep the legacy flat npm test glob discovering every grouped documentation test.
// Do not replace with a manually maintained list: new *.test.mjs owners must run automatically.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

const root = new URL('./documentation/', import.meta.url);
const tests = (await readdir(root)).filter((name) => name.endsWith('.test.mjs')).sort();
for (const owner of ['documentation.test.mjs', 'process-guide.test.mjs', 'wiki-manual.test.mjs']) {
  assert.ok(tests.includes(owner), `missing documentation test owner: ${owner}`);
}
for (const name of tests) await import(new URL(name, root).href);
