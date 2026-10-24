import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { rectMulti, pointInMulti, intersection } = await import('../vector-geometry.js');
const { junctionThreeDoseSectionWitness } = await import('../junction-section-witness.js');

test('Q2 Section prefers three-dose material when third Al intersects only a subset of first-two overlap', () => {
  const first = rectMulti(0.4, 0.4, -0.1, 0);
  const second = rectMulti(0.4, 0.4, 0.1, 0);
  const third = rectMulti(0.1, 0.4, 0.05, 0);
  const chosen = junctionThreeDoseSectionWitness(first, second, third);
  assert.equal(chosen.sectionIncludesThirdAl, true);
  assert.equal(pointInMulti(chosen.point, first), true);
  assert.equal(pointInMulti(chosen.point, second), true);
  assert.equal(pointInMulti(chosen.point, third), true);
  assert.deepEqual(chosen.firstTwoOverlap, intersection(first, second));
});

test('Q2 Section preserves true first-two Al overlap when third metal misses the junction', () => {
  const first = rectMulti(0.4, 0.4, -0.1, 0);
  const second = rectMulti(0.4, 0.4, 0.1, 0);
  const third = rectMulti(0.1, 0.4, 2, 0);
  const chosen = junctionThreeDoseSectionWitness(first, second, third);
  assert.equal(chosen.sectionIncludesThirdAl, false);
  assert.equal(pointInMulti(chosen.point, first), true);
  assert.equal(pointInMulti(chosen.point, second), true);
  assert.equal(pointInMulti(chosen.point, third), false);
});

test('Q2 Section rejects a missing first-two Al junction instead of choosing third dose', () => {
  assert.throws(
    () =>
      junctionThreeDoseSectionWitness(
        rectMulti(0.1, 0.1, -2, 0),
        rectMulti(0.1, 0.1, 2, 0),
        rectMulti(0.1, 0.1, 2, 0),
      ),
    /First-two Al footprint overlap is empty/,
  );
});
