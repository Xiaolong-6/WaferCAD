import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { pointInMulti, intersection, rectMulti } = await import('../vector-geometry.js');
const { junctionSectionWitness } = await import('../junction-section-witness.js');

const closed = (ring) => [...ring, ring[0]];

test('concave L-shaped junction chooses material inside rather than vertex average', () => {
  const outer = closed([
    [0, 0],
    [4, 0],
    [4, 1],
    [1, 1],
    [1, 4],
    [0, 4],
  ]);
  const overlap = [[outer]];
  const naive = outer.reduce(
    (sum, p) => [sum[0] + p[0] / outer.length, sum[1] + p[1] / outer.length],
    [0, 0],
  );
  assert.equal(pointInMulti(naive, overlap), false);
  const witness = junctionSectionWitness(overlap);
  assert.equal(pointInMulti(witness, overlap), true);
});

test('annular overlap witness avoids a central hole', () => {
  const outer = closed([
    [-3, -3],
    [3, -3],
    [3, 3],
    [-3, 3],
  ]);
  const hole = closed([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]);
  const geometry = [[outer, hole]];
  assert.equal(pointInMulti([0, 0], geometry), false);
  assert.equal(pointInMulti(junctionSectionWitness(geometry), geometry), true);
});

test('native Boolean first-two Al overlap produces interior physical Section witness', () => {
  const first = rectMulti(0.4, 0.18, -0.04, 0);
  const second = rectMulti(0.18, 0.5, 0, 0.03);
  const overlap = intersection(first, second);
  const witness = junctionSectionWitness(overlap);
  assert.equal(pointInMulti(witness, first), true);
  assert.equal(pointInMulti(witness, second), true);
});

test('disconnected polygons and input order both yield a deterministic interior point', () => {
  const a = rectMulti(0.18, 0.18, 2, 3)[0];
  const b = rectMulti(0.3, 0.18, -3, -2)[0];
  const first = junctionSectionWitness([a, b]);
  const reversed = junctionSectionWitness([b, a]);
  assert.deepEqual(first, reversed);
  assert.equal(pointInMulti(first, [a, b]), true);
});

test('sub-grid and empty overlap fail closed, not as a fabricated Section', () => {
  assert.throws(() => junctionSectionWitness([]), /resolvable/);
  assert.throws(() => junctionSectionWitness(rectMulti(0.00005, 0.18)), /resolvable/);
  assert.throws(() => junctionSectionWitness(rectMulti(0.18, 0.18), { quantumUm: 0 }), /quantum/);
});
