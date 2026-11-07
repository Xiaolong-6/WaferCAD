import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { addQ2WallOxideCandidate } from '../../scripts/transmon-q2-oxide-candidate.mjs';

await loadGeometryKernel();
const { applyOperation, createLayer, createModel } = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

test('a rounded oxide rim covers the free space just above the Al1 wall', async () => {
  const source = createModel({ shape: 'rect', width: 4, height: 4, thickness: 1 });
  createLayer(source, 'MMA');
  createLayer(source, 'PMMA');
  const area = rectMulti(0.4, 0.4);
  const add = (name, thickness) => {
    const result = applyOperation(source, { type: 'add', face: 'front', name, thickness, area });
    assert.ok(result.changed, result.error);
    return result.layerId;
  };
  add('Al1', 0.04);
  const oxideId = add('AlOx (illustrative thickness)', 0.002);
  const standard = await addQ2WallOxideCandidate(source, 0.002);
  const rounded = await addQ2WallOxideCandidate(source, 0.002, { roundCapRim: true });
  const oxideAt = (model, x, z) =>
    model.regions.some(
      ({ geom, stack }) =>
        pointInMulti([x, 0], geom) &&
        stack.some((s) => s.layerId === oxideId && s.z0 < z && z < s.z1),
    );
  assert.equal(oxideAt(standard, 0.201, 0.5404), false);
  assert.equal(oxideAt(rounded, 0.201, 0.5404), true);
  assert.equal(oxideAt(rounded, 0.203, 0.5404), false);
});
