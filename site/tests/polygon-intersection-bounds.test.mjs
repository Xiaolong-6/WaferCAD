import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { EPS, rectMulti, robustIntersection } = await import('../vector-geometry.js');

test('separated polygon bounds skip the exact Boolean kernel without changing input', () => {
  const left = Array.from({ length: 40 }, (_, i) => [
    [
      [i, 0],
      [i + 0.2, 0],
      [i + 0.2, 0.2],
      [i, 0.2],
      [i, 0],
    ],
  ]);
  const right = rectMulti(3, 5, 1000, 1000);
  const original = structuredClone([left, right]);
  const kernel = globalThis.polygonClipping;
  const intersection = kernel.intersection;
  kernel.intersection = () => {
    throw new Error('Separated bounding boxes should never reach polygon-clipping');
  };
  try {
    assert.deepEqual(robustIntersection(left, right), []);
  } finally {
    kernel.intersection = intersection;
  }
  assert.deepEqual([left, right], original);
});

test('touching, EPS-near and overlapping bounds keep the original Boolean route', () => {
  const original = globalThis.polygonClipping.intersection;
  let calls = 0;
  globalThis.polygonClipping.intersection = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    const left = rectMulti(2, 2, 0, 0);
    const touching = rectMulti(2, 2, 2, 0);
    robustIntersection(left, touching);
    const epsNear = rectMulti(2, 2, 2 + EPS * 0.5, 0);
    robustIntersection(left, epsNear);
    const overlapping = rectMulti(2, 2, 0.5, 0.5);
    const actual = robustIntersection(left, overlapping);
    assert.ok(actual.length > 0);
    assert.equal(calls, 3, 'No near-boundary input may skip exact kernel semantics');
  } finally {
    globalThis.polygonClipping.intersection = original;
  }
});

test('malformed and empty input remains on the original normalization path', () => {
  assert.deepEqual(robustIntersection(null, rectMulti(1, 1)), []);
  assert.deepEqual(robustIntersection(7, rectMulti(1, 1)), []);
  assert.deepEqual(robustIntersection([null, 2], rectMulti(1, 1)), []);
});

test('wide precise separated geometry has identical empty intersection', () => {
  const left = rectMulti(0.0000004, 0.0000008, 0.0000002, 0.0000004);
  const far = rectMulti(0.0000004, 0.0000008, 0.0000018, 0.0000016);
  assert.deepEqual(robustIntersection(left, far), []);
  const doubleCall = [robustIntersection(left, far), robustIntersection(far, left)];
  assert.deepEqual(doubleCall, [[], []]);
});
