import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { unionGeometries, rectMulti } = await import('../vector-geometry.js');

function scopedCache() {
  return { polygonIds: new WeakMap(), components: new Map(), nextId: 0 };
}

test('repeated overlapping components use exact cached Boolean without aliasing output', () => {
  const a = rectMulti(4, 4, 0, 0),
    b = rectMulti(4, 4, 2, 0),
    c = rectMulti(4, 4, 25, 0);
  const expected = unionGeometries([a, b, c]);
  const reuse = scopedCache();
  const first = unionGeometries([a, b, c], reuse);
  assert.deepEqual(first, expected);
  assert.ok(reuse.components.size > 0, 'overlapping geometry should populate the cache');
  const populated = reuse.components.size;
  first[0][0][0][0] = 98765;
  const second = unionGeometries([a, b, c], reuse);
  assert.deepEqual(second, expected, 'cached output must detach from returned arrays');
  assert.equal(reuse.components.size, populated);
  assert.deepEqual(a, rectMulti(4, 4, 0, 0), 'input must remain untouched');
});

test('distinct value-equal input objects retain independent cache identities', () => {
  const cache = scopedCache();
  const a = rectMulti(4, 4, 0, 0),
    b = rectMulti(4, 4, 2, 0);
  const expected = unionGeometries([a, b]);
  assert.deepEqual(unionGeometries([a, b], cache), expected);
  const before = cache.components.size;
  assert.deepEqual(unionGeometries([structuredClone(a), structuredClone(b)], cache), expected);
  assert.ok(cache.components.size > before);
});

test('malformed polygon normalization does not assign an incorrect cache key', () => {
  const cache = scopedCache();
  const bad = [[[[0, 0]]], ...rectMulti(4, 4)];
  const other = rectMulti(4, 4, 2, 0);
  assert.deepEqual(unionGeometries([bad, other], cache), unionGeometries([bad, other]));
});
