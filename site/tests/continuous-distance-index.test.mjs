import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { compileContinuousFootprintDistance, buildContinuousMaterialSurfaceMesh } =
  await import('../continuous-etch-mesh.js');
const { rectMulti, circleMulti, difference, unionGeometries } =
  await import('../vector-geometry.js');
const { exactUnetchedFilmCandidates } = await import('../continuous-exact-film-mesh.js');
const { readProjectFile } = await import('../project-io.js');
const { edgeTable, triTable } = await import('three/addons/objects/MarchingCubes.js');

// Independent pre-optimization O(N) oracle. Maintain the exact sign and segment
// arithmetic rather than accepting approximately equal mesh triangles.
function referenceSignedFootprintDistance(x, y, multi) {
  const pointInRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
    }
    return inside;
  };
  let inside = false,
    minSquared = Infinity;
  for (const poly of multi) {
    if (pointInRing(poly[0]) && !poly.slice(1).some(pointInRing)) inside = true;
    for (const ring of poly)
      for (let k = 1; k < ring.length; k++) {
        const a = ring[k - 1],
          b = ring[k],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          l2 = dx * dx + dy * dy,
          t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0,
          rx = x - a[0] - t * dx,
          ry = y - a[1] - t * dy;
        minSquared = Math.min(minSquared, rx * rx + ry * ry);
      }
  }
  const magnitude = Math.sqrt(minSquared);
  return inside ? magnitude : -magnitude;
}

test('spatial distance index equals the original analytic segment distance for holes and disjoint polygons', () => {
  const hole = difference(rectMulti(32, 24), circleMulti(11, 11, 64));
  const geom = unionGeometries([hole, rectMulti(6, 4, 40, -5)]);
  const fast = compileContinuousFootprintDistance(geom);
  let seed = 0x6573a4f2;
  const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
  for (let k = 0; k < 5000; k++) {
    const x = (random() - 0.5) * 110,
      y = (random() - 0.5) * 80;
    assert.equal(
      fast(x, y),
      referenceSignedFootprintDistance(x, y, geom),
      `exact distance at sample ${k}`,
    );
  }
  for (const [x, y] of [
    [-16, 0],
    [16, 0],
    [40, -5],
    [0, 0],
    [5.5, 0],
    [0, -12],
  ])
    assert.equal(fast(x, y), referenceSignedFootprintDistance(x, y, geom));
});

test('HBAR multi-height SiO2 mesh retains exact baseline vertices/normals (SHA-256)', async () => {
  const file = new URL(
    '../../examples/projects/hbar-blesin-2024-candidate/hbar-blesin-2024-author-roi.wafercad',
    import.meta.url,
  );
  const bytes = readFileSync(file);
  const project = await readProjectFile({
    size: bytes.length,
    text: async () => bytes.toString('utf8'),
  });
  const owner = project.model.continuousEtchOwner;
  const excluded = [...exactUnetchedFilmCandidates(owner).keys(), 'base'];
  const result = buildContinuousMaterialSurfaceMesh(owner, {
    cubeTables: { edgeTable, triTable },
    xyStepUm: 1.75,
    excludeLayerIds: excluded,
  });
  assert.deepEqual(
    result.layers.map(({ layerId, triangles }) => ({ layerId, triangles })),
    [{ layerId: 'layer-3', triangles: 30276 }],
  );
  const hash = (array) =>
    createHash('sha256')
      .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
      .digest('hex');
  assert.equal(
    hash(result.layers[0].positions),
    '74511cdc93c828f3e8897df57134ae21fc9bc146bb9f37246b0da2d6d578151a',
  );
  assert.equal(
    hash(result.layers[0].normals),
    '1b359e5f20b8c14e5e4841edb5e2b04a6bc1005c7bc328e7b961ba73b33a5f9e',
  );
});
