import assert from 'node:assert/strict';
import test from 'node:test';

const {
  canonicalLineInterval,
  lineIntervalKey,
  localParameterAtLineT,
  partitionLineIntervals,
  pointAtLineT,
} = await import('../line-intervals.js');

test('collinear interval reconciliation matches one long edge to split short edges', () => {
  const long = { id: 'long', line: canonicalLineInterval([0, 0], [10, 0]) },
    left = { id: 'left', line: canonicalLineInterval([0, 0], [4, 0]) },
    right = { id: 'right', line: canonicalLineInterval([4, 0], [10, 0]) };

  assert.equal(lineIntervalKey(long.line), lineIntervalKey(left.line));
  assert.equal(lineIntervalKey(long.line), lineIntervalKey(right.line));

  const spans = partitionLineIntervals([long, left, right]);
  assert.equal(spans.length, 2);
  assert.deepEqual(
    spans.map((span) => [span.t0, span.t1, span.covering.map((entry) => entry.id).sort()]),
    [
      [0, 4, ['left', 'long']],
      [4, 10, ['long', 'right']],
    ],
  );
});

test('canonical line coordinates remain stable for reversed edges', () => {
  const forward = canonicalLineInterval([2, 3], [8, 3]),
    reverse = canonicalLineInterval([8, 3], [2, 3]);
  assert.equal(lineIntervalKey(forward), lineIntervalKey(reverse));
  assert.deepEqual(pointAtLineT(forward, 5), [5, 3]);
  assert.deepEqual(pointAtLineT(reverse, 5), [5, 3]);
  assert.equal(localParameterAtLineT(forward, 2), 0);
  assert.equal(localParameterAtLineT(forward, 8), 1);
  assert.equal(localParameterAtLineT(reverse, 8), 0);
  assert.equal(localParameterAtLineT(reverse, 2), 1);
});
