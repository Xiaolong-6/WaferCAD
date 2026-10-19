import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createModel } = await import('../model.js');
const { ownedMaterialSurfacesFromTopology } = await import('../process-topology.js');
const { difference, rectMulti } = await import('../vector-geometry.js');

// A single-owner edge is the performance fast path; shared edges and holes
// must still satisfy the regular topology/ownership contract.
test('isolated and hole perimeters preserve all exterior wall Z spans', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 8 });
  model.regions[0].geom = difference(rectMulti(20, 20), rectMulti(6, 6));
  const { sidewalls } = ownedMaterialSurfacesFromTopology(model);
  const walls = sidewalls.filter((wall) => wall.layerId === 'base');
  assert.equal(walls.length, 8, 'four external edges and four hole edges');
  for (const wall of walls) {
    assert.equal(wall.buried, false);
    assert.equal(wall.ownership, 'exterior');
    assert.deepEqual(wall.interfaceLayerIds, []);
    assert.deepEqual([wall.z0, wall.z1], [-4, 4]);
    assert.ok(Math.hypot(wall.q[0] - wall.p[0], wall.q[1] - wall.p[1]) > 0);
  }
});

test('a true shared material edge remains buried and cannot use singleton ownership', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 10, thickness: 8 });
  model.layers.push({ id: 'film', name: 'Film', color: '#123456' });
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(10, 10, -5, 0),
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    {
      id: 'right',
      geom: rectMulti(10, 10, 5, 0),
      stack: [{ layerId: 'film', z0: -4, z1: 4 }],
    },
  ];
  const { sidewalls } = ownedMaterialSurfacesFromTopology(model);
  const boundary = sidewalls.filter(
    (wall) => Math.abs(wall.p[0]) < 1e-9 && Math.abs(wall.q[0]) < 1e-9,
  );
  assert.equal(boundary.length, 1, 'one owner for the shared X=0 interface');
  assert.equal(boundary[0].buried, true);
  assert.equal(boundary[0].ownership, 'interface');
  assert.deepEqual(
    new Set([boundary[0].layerId, ...boundary[0].interfaceLayerIds]),
    new Set(['base', 'film']),
  );
  assert.deepEqual([boundary[0].z0, boundary[0].z1], [-4, 4]);
});
