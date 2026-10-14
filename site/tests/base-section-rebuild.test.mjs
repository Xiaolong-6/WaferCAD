import assert from 'node:assert/strict';
import test from 'node:test';

import { sectionAfterBaseRebuild } from '../controllers/base-controls-controller.js';

const model = { width: 104, height: 100 };
const authored = { a: [-44, -24], b: [-35, -24] };
const centered = { a: [-43.68, 0], b: [43.68, 0] };

test('Recipe Rebuild Base retains the authored physical A-B section in identical bounds', () => {
  const result = sectionAfterBaseRebuild(authored, model, { preserveSection: true });
  assert.deepEqual(result, authored);
  assert.notStrictEqual(result, authored, 'retained section is copied, not shared');
  result.a[0] = 0;
  assert.equal(authored.a[0], -44, 'clone must not mutate saved Section');
});

test('manual Base changes retain the historical centered-Section default', () => {
  assert.deepEqual(sectionAfterBaseRebuild(authored, model), centered);
});

test('Recipe Rebuild Base rejects invalid or out-of-bounds former sections', () => {
  for (const section of [
    null,
    { a: [-44, -24], b: [-44, -24] },
    { a: [-120, 0], b: [10, 0] },
    { a: [Number.NaN, 0], b: [12, 0] },
    { a: [0, 0], b: [0, 100] },
    { a: [1, 0], b: [1, Infinity] },
  ]) {
    assert.deepEqual(
      sectionAfterBaseRebuild(section, model, { preserveSection: true }),
      centered,
      'malformed or oversized A-B must reset safely',
    );
  }
});
