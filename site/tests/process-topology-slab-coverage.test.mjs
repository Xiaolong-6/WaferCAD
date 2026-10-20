import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ materialSolidsFromTopology }, { difference, isEmpty, rectMulti }] = await Promise.all([
  import('../process-topology.js'),
  import('../vector-geometry.js'),
]);

function sourceModel(regions) {
  return {
    regions: regions.map(({ geom, z0, z1 }, i) => ({
      id: `area-${i}`,
      geom,
      stack: [{ layerId: 'base', z0, z1 }],
    })),
  };
}

function assertExactCapDifferences(regions) {
  const model = sourceModel(regions),
    original = JSON.stringify(model),
    solids = materialSolidsFromTopology(model);
  assert.equal(solids.length, 1);
  assert.equal(JSON.stringify(model), original, 'topology must not change the source model');
  const solid = solids[0];
  assert.ok(solid.slabs.length);
  assert.ok(!solid.slabs.some((slab) => 'sourceItems' in slab), 'private proof state leaked');
  const oracle = [];
  for (let i = 0; i < solid.slabs.length; i++) {
    const slab = solid.slabs[i];
    for (const [z, normal, neighbor] of [
      [slab.z0, -1, solid.slabs[i - 1]],
      [slab.z1, 1, solid.slabs[i + 1]],
    ]) {
      const polys = difference(slab.polys, neighbor?.polys || []);
      if (!isEmpty(polys)) oracle.push({ z, normal, polys });
    }
  }
  assert.deepEqual(solid.caps, oracle, 'shortcut must match precise Boolean cap ownership');
}

const base = { geom: rectMulti(10, 10), z0: 0, z1: 12 };
test('nested additions and removals retain exact caps', () => {
  assertExactCapDifferences([
    base,
    { geom: rectMulti(3, 3, 5, 0), z0: 2, z1: 5 },
    { geom: rectMulti(3, 3, -5, 0), z0: 5, z1: 9 },
    { geom: rectMulti(4, 4, 1, 1), z0: 2, z1: 9 },
  ]);
});

test('same lower plane with staggered upper planes retains exact caps', () => {
  assertExactCapDifferences([
    base,
    { geom: rectMulti(3, 3, 4, 0), z0: 0, z1: 4 },
    { geom: rectMulti(3, 3, -4, 0), z0: 0, z1: 7 },
  ]);
});

test('annuli, holes and contained islands keep full Boolean fallback', () => {
  const ring = difference(rectMulti(9, 9), rectMulti(3, 3));
  assertExactCapDifferences([
    base,
    { geom: ring, z0: 0, z1: 7 },
    { geom: rectMulti(2, 2), z0: 5, z1: 9 },
  ]);
});

test('varying active source sets with thin and partial-overlap slabs retain exact caps', () => {
  let seed = 11407;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 24; trial++) {
    const regions = [base];
    for (let index = 0; index < 7; index++) {
      const x = Math.floor(random() * 13) - 6,
        y = Math.floor(random() * 13) - 6,
        z0 = Math.floor(random() * 11),
        z1 = z0 + 1 + Math.floor(random() * (12 - z0));
      regions.push({ geom: rectMulti(1 + random() * 3, 1 + random() * 3, x, y), z0, z1 });
    }
    assertExactCapDifferences(regions);
  }
});
