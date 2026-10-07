import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import {
  prepareBoundaryIndex,
  indexedIntersectionInputs,
  prewarmModelBoundaryIndexes,
} from '../process-boundary-index.js';
await loadGeometryKernel();
const { rectMulti, difference, intersection, unionGeometries } =
  await import('../vector-geometry.js');
const { conformalBoundaryBands } = await import('../process-topology.js');
const equalPhysical = (a, b) => {
  assert.equal(difference(a, b).length, 0);
  assert.equal(difference(b, a).length, 0);
};
test('boundary indexes reuse exact clones and invalidate in-place edits without altering the saved geometry', () => {
  const geom = rectMulti(10, 10),
    index = prepareBoundaryIndex(geom);
  assert.equal(prepareBoundaryIndex(structuredClone(geom)), index);
  geom[0][0][1][0] = 6;
  assert.notEqual(prepareBoundaryIndex(geom), index);
  assert.equal(index.rings[0].ring[1][0], 5);
});
test('indexed overlap retains holes, disconnected owners, containment and near-grid contacts', () => {
  const geom = difference(
    rectMulti(100, 100),
    unionGeometries([rectMulti(6, 6, -30, 0), rectMulti(6, 6, 30, 0)]),
  );
  for (const other of [
    rectMulti(5, 5, -30, 0),
    rectMulti(7, 7, 30, 0),
    rectMulti(2, 2),
    rectMulti(2, 2, 50.9999, 0),
    unionGeometries([rectMulti(2, 2, -30, 0), rectMulti(2, 2, 30, 0)]),
  ]) {
    const [a, b] = indexedIntersectionInputs(geom, other);
    equalPhysical(intersection(a, b), intersection(geom, other));
  }
});
test('indexed conformal chains retain the full physical band inside every mask window', () => {
  const geom = difference(rectMulti(100, 100), rectMulti(40, 40));
  const all = unionGeometries(conformalBoundaryBands(geom, 0.1));
  for (const clip of [
    rectMulti(2, 2, 50, 0),
    rectMulti(3, 3, 50, 50),
    rectMulti(2, 2, 20, 20),
    rectMulti(110, 110),
    rectMulti(2, 2),
  ]) {
    const local = unionGeometries(conformalBoundaryBands(geom, 0.1, clip));
    equalPhysical(intersection(local, clip), intersection(all, clip));
  }
});
test('idle preparation yields, cancels before the next region and leaves the model untouched', async () => {
  const model = { regions: [{ geom: rectMulti(8, 8) }, { geom: rectMulti(4, 4) }] },
    copy = structuredClone(model);
  let current = true,
    yields = 0;
  const result = await prewarmModelBoundaryIndexes(
    model,
    () => current,
    async () => {
      yields++;
      current = false;
    },
  );
  assert.equal(result.cancelled, true);
  assert.equal(result.count, 1);
  assert.equal(yields, 1);
  assert.deepEqual(model, copy);
});
