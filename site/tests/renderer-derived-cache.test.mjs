import assert from 'node:assert/strict';
import test from 'node:test';
import { createDerivedDataCache } from '../renderer-derived-cache.js';

test('derived renderer data cache reuses variants by canonical source identity', () => {
  const cache = createDerivedDataCache();
  const source = [];
  let builds = 0;
  const build = () => ({ id: ++builds });

  const a = cache.get(source, 'front:1', build);
  const b = cache.get(source, 'front:1', build);
  const c = cache.get(source, 'back:1', build);

  assert.strictEqual(b, a);
  assert.notStrictEqual(c, a);
  assert.equal(builds, 2);
  assert.deepEqual(cache.stats(), { hits: 1, misses: 2 });
});

test('derived renderer data cache does not retain primitive pseudo-sources', () => {
  const cache = createDerivedDataCache();
  let builds = 0;
  cache.get(null, 'x', () => ++builds);
  cache.get(null, 'x', () => ++builds);
  assert.equal(builds, 2);
  assert.deepEqual(cache.stats(), { hits: 0, misses: 2 });
});
