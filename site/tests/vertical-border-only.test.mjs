import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ solidBordersFromTopology }, { rectMulti, difference }] = await Promise.all([
  import('../process-topology.js'),
  import('../vector-geometry.js'),
]);

test('vertical-only border extraction exactly matches filtering the full border list', () => {
  const outer = rectMulti(10, 10);
  const inner = rectMulti(3, 3);
  const ring = difference(outer, inner);
  const solid = {
    slabs: [
      { z0: -2, z1: -1, polys: ring },
      { z0: -1, z1: 0, polys: outer },
    ],
    caps: [
      { z: -2, polys: ring },
      { z: -1, polys: ring },
      { z: 0, polys: outer },
    ],
  };
  for (const angle of [5, 20, 45, 90]) {
    const all = solidBordersFromTopology(solid, angle);
    const vertical = solidBordersFromTopology(solid, angle, true);
    assert.deepEqual(
      vertical,
      all.filter(([a, b]) => a[2] !== b[2]),
      `vertical edge sequence changed at threshold ${angle}`,
    );
  }
  assert.ok(
    solidBordersFromTopology(solid).length > solidBordersFromTopology(solid, 20, true).length,
  );
});

test('the four closed rectangle corners keep their exact vertical border order', () => {
  const solid = {
    slabs: [{ z0: 0, z1: 2, polys: rectMulti(10, 10) }],
    caps: [],
  };
  assert.deepEqual(solidBordersFromTopology(solid, 20, true), [
    [
      [-5, -5, 0],
      [-5, -5, 2],
    ],
    [
      [5, -5, 0],
      [5, -5, 2],
    ],
    [
      [5, 5, 0],
      [5, 5, 2],
    ],
    [
      [-5, 5, 0],
      [-5, 5, 2],
    ],
  ]);
});
