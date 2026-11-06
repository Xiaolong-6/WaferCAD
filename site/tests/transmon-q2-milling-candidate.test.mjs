import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { millQ2OxideCandidate } from '../../scripts/transmon-q2-milling-candidate.mjs';

await loadGeometryKernel();
const { createModel, applyOperation } = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');

test('directional Q2 milling clears the exposed contact and retains covered and shadowed oxide', async () => {
  const source = createModel({ shape: 'rect', width: 4, height: 4, thickness: 1 });
  const add = (name, thickness, area = source.boundary) => {
    const result = applyOperation(source, { type: 'add', face: 'front', name, thickness, area });
    assert.ok(result.changed, result.error);
    return result.layerId;
  };
  add('Al1', 0.04);
  const oxide = add('AlOx (illustrative thickness)', 0.002);
  add('Al2', 0.3, rectMulti(1, 4));
  const before = structuredClone(source);
  const result = await millQ2OxideCandidate(source, { tiltDeg: 45, azimuths: [0], depthUm: 0.002 });
  const oxideAt = (x) =>
    result.model.regions.some(
      ({ geom, stack }) =>
        pointInMulti([x, 0], geom) && stack.some(({ layerId }) => layerId === oxide),
    );
  assert.ok(result.removedVolumeUm3 > 0);
  assert.equal(oxideAt(0.65), false);
  assert.equal(oxideAt(-0.65), true);
  assert.equal(oxideAt(0), true);
  assert.deepEqual(result.model.layers, source.layers);
  assert.deepEqual(source, before);
});
