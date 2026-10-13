import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canPrepareSmoothSidewallsInWorker,
  prepareSmoothSidewallData,
} from '../renderer-v4-smooth-sidewall-data.js';

const wall = (p, q, z0 = 0, z1 = 1) => ({ p, q, z0, z1 });

test('worker smooth sidewalls retain exact triangle winding and normals', () => {
  const part = wall([0, 0], [1, 0]);
  const before = structuredClone(part);
  const result = prepareSmoothSidewallData([part]);
  assert.ok(result.positions instanceof Float32Array);
  assert.deepEqual(Array.from(result.positions), [
    0, 0, 0, 1, 0, 0, 1, 0, 1,
    0, 0, 0, 1, 0, 1, 0, 0, 1,
  ]);
  assert.deepEqual(Array.from(result.normals), [
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
  ]);
  assert.deepEqual(part, before);
});

test('worker data shares the exact collinear reduction without changing source', () => {
  const result = prepareSmoothSidewallData([
    wall([0, 0], [1, 0]),
    wall([1, 0], [2, 0]),
  ]);
  assert.equal(result.positions.length, 18);
  assert.equal(result.positions[3], 2);
  assert.equal(
    prepareSmoothSidewallData([wall([0, 0], [1, 0]), wall([1, 0], [1, 1])]).positions.length,
    36,
  );
  assert.equal(prepareSmoothSidewallData([wall([0, 0], [0, 0])]).positions.length, 0);
});

test('worker path excludes scientific depth, roughness, index and display LOD', () => {
  const parts = Array.from({ length: 8 }, (_, i) => wall([i, 0], [i + 1, 0]));
  assert.equal(canPrepareSmoothSidewallsInWorker(parts), true);
  assert.equal(canPrepareSmoothSidewallsInWorker(parts.slice(0, 7)), false);
  assert.equal(canPrepareSmoothSidewallsInWorker(parts, { indexedSmooth: true }), false);
  assert.equal(canPrepareSmoothSidewallsInWorker(parts, { displayTolerance: 0.5 }), false);
  assert.equal(canPrepareSmoothSidewallsInWorker([{ ...parts[0], lowerDepth: 0 }, ...parts.slice(1)]), false);
  assert.equal(canPrepareSmoothSidewallsInWorker([{ ...parts[0], lowerSurface: { appearance: { kind: 'rough' } } }, ...parts.slice(1)]), false);
  assert.throws(() => prepareSmoothSidewallData([wall([NaN, 0], [1, 0])]), TypeError);
});
