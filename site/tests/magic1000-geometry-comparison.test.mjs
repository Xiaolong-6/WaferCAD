import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { assertSameMaterialGeometry } from '../../scripts/magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, cloneModel } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');

test('strict 2.5D replay comparator accepts identical material geometry', async () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 2 });
  const result = applyOperation(model, {
    type: 'add', name: 'Thin contact', face: 'front',
    thickness: 0.0007, area: rectMulti(2, 3),
    growth: 'direct',
  });
  assert.equal(result.changed, true);
  const actual = cloneModel(model);
  actual.regions.reverse(); // region ordering is not a physical difference
  const report = await assertSameMaterialGeometry(model, actual);
  assert.equal(report.verified, true);
  assert.ok(report.slabsChecked > 0);
});

test('strict 2.5D replay comparator rejects 0.1 nm thickness drift', async () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 2 });
  const result = applyOperation(model, {
    type: 'add', name: 'Monolayer', face: 'front',
    thickness: 0.0007, area: rectMulti(2, 3),
    growth: 'direct',
  });
  assert.equal(result.changed, true);
  const altered = cloneModel(model);
  const segment = altered.regions.flatMap(r => r.stack)
    .find(s => s.layerId === result.layerId);
  assert.ok(segment);
  segment.z1 += 0.0001;
  await assert.rejects(
    assertSameMaterialGeometry(model, altered),
    /physical XY mismatch/,
  );
});

test('strict 2.5D replay comparator rejects displaced via footprint', async () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 2 });
  const result = applyOperation(model, {
    type: 'add', name: 'W via', face: 'front',
    thickness: 0.4, area: rectMulti(2, 3),
    growth: 'direct',
  });
  assert.equal(result.changed, true);
  const altered = cloneModel(model);
  const region = altered.regions.find(r => r.stack.some(s => s.layerId === result.layerId));
  region.geom = rectMulti(2, 3, 0.25, 0);
  await assert.rejects(
    assertSameMaterialGeometry(model, altered),
    /physical XY mismatch/,
  );
});
