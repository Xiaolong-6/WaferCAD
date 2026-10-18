import assert from 'node:assert/strict';
import test from 'node:test';
import { makePhysicalPyramidOwner } from '../physical-facet-owner.js';
import {
  createPhysicalFacetShellQuery,
  makePhysicalFacetShell,
} from '../physical-facet-shell-owner.js';
import { triangulatePhysicalFacetShell } from '../physical-facet-shell-mesh.js';

const silicon = makePhysicalPyramidOwner({
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
});
const shell = makePhysicalFacetShell({ silicon, layerId: 'oxide', thicknessUm: 0.05 });

// Covers apex, valley, sidewall, slab back, corners and periodic cell seams.
test('triangulated SiO2 shell has two consistently wound closed surfaces at exact material-owner vertices', () => {
  const mesh = triangulatePhysicalFacetShell(shell);
  const owner = createPhysicalFacetShellQuery(shell);
  assert.equal(mesh.kind, 'wafercad-physical-tessellated-oxide-evidence-v1');
  assert.equal(mesh.siliconTriangleCount, 80);
  assert.equal(mesh.filmTriangleCount, 640);
  assert.deepEqual(mesh.topology.exterior, { faces: 560, edges: 840, invalidEdges: 0 });
  assert.deepEqual(mesh.topology.interface, { faces: 80, edges: 120, invalidEdges: 0 });
  assert.ok(mesh.triangulatedFilmVolumeUm3 > 0);
  for (const triangle of mesh.exterior) {
    for (const vertex of triangle.vertices) {
      assert.equal(
        owner.sample(vertex).materialLayerId === 'oxide' ||
          owner.sample(vertex).materialLayerId === null,
        true,
      );
      assert.ok(
        Math.abs(owner.closest(vertex).distanceUm - shell.thicknessUm) < 1e-9,
        'Every displayed film vertex must be on the exact implicit shell isosurface',
      );
    }
  }
  const again = triangulatePhysicalFacetShell(JSON.parse(JSON.stringify(shell)));
  assert.deepEqual(again, mesh, 'Mesh regeneration must be bit-exact across JSON persistence');
});

test('invalid source and insufficient budget fail without changing the canonical owner', () => {
  const earlier = JSON.stringify(shell);
  assert.throws(() => triangulatePhysicalFacetShell(shell, { maxCells: 2 }), /budget exceeded/);
  assert.throws(
    () => triangulatePhysicalFacetShell({ ...shell, thicknessUm: 1.7 }),
    /quarter-pitch/,
  );
  assert.equal(JSON.stringify(shell), earlier);
});
