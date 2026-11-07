import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDeferDenseBorderBuffers } from '../renderer-deferred-borders.js';

test('default-off dense Borders can defer visual allocations, not ownership', () => {
  assert.equal(shouldDeferDenseBorderBuffers({ borderLineCount: 635120, borders: false }), true);
  assert.equal(shouldDeferDenseBorderBuffers({ borderLineCount: 635120, borders: true }), false);
  assert.equal(shouldDeferDenseBorderBuffers({ borderLineCount: 1800, borders: false }), false);
  assert.equal(shouldDeferDenseBorderBuffers({ borderLineCount: 100000, borders: false }), true);
  assert.equal(shouldDeferDenseBorderBuffers(), false);
});
