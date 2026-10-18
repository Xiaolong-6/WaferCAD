import assert from 'node:assert/strict';
import test from 'node:test';

import {
  physicalFacetNormalCoatingPatch,
} from '../experimental/physical-facets/physical-facet-coating.js';
import {
  samplePhysicalPyramidSlab,
  squarePyramidSample,
} from '../experimental/physical-facets/physical-facet-math.js';
import { makePhysicalPyramidOwner } from '../experimental/physical-facets/physical-facet-owner.js';
import {
  signedPhysicalMeshVolume,
} from '../experimental/physical-facets/physical-facet-surface.js';

const owner = makePhysicalPyramidOwner({
  layerId: 'silicon',
  pitch: 6.4,
  height: 4.5,
  topPlaneZ: 125.5,
  bottomPlaneZ: -125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
});
const triangleXY = [
  [1.1, 0.1],
  [2.1, 0.1],
  [1.6, 0.5],
];
const film = 0.05;
const eps = 1e-11;
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) <= eps, `Measured ${actual} versus expected ${expected}`);

for (const face of ['front', 'back']) {
  test(`${face} local facet coating is a closed true-normal triangle prism`, () => {
    const patch = physicalFacetNormalCoatingPatch(owner, {
      face,
      layerId: 'oxide',
      thicknessUm: film,
      triangleXY,
    });
    assert.equal(patch.kind, 'wafercad-local-facet-normal-coating-v1');
    assert.equal(patch.sourceOwnerKind, owner.kind);
    assert.equal(patch.substrateLayerId, 'silicon');
    assert.equal(patch.layerId, 'oxide');
    assert.equal(patch.completeFacetCoating, false);
    assert.equal(patch.triangles.length, 8);
    assert.deepEqual(
      patch.triangles.map((t) => t.face),
      ['substrate-interface', 'outer-interface', 'edge', 'edge', 'edge', 'edge', 'edge', 'edge'],
    );
    const expectedSlope = (2 * owner.height) / owner.pitch;
    const surfaceArea = patch.triangleAreaXY * Math.hypot(expectedSlope, 1);
    const expectedVolume = surfaceArea * film;
    close(patch.physicalVolumeUm3, expectedVolume);
    close(signedPhysicalMeshVolume({ triangles: patch.triangles }), expectedVolume);
    close(Math.hypot(...patch.normal), 1);

    for (let i = 0; i < 3; i++) {
      const inner = patch.inner[i];
      const outer = patch.outer[i];
      const sample = samplePhysicalPyramidSlab(...inner.slice(0, 2), owner);
      close(inner[2], face === 'front' ? sample.z1 : sample.z0);
      close(Math.hypot(...outer.map((value, axis) => value - inner[axis])), film);
      for (let axis = 0; axis < 3; axis++) {
        close(outer[axis] - inner[axis], film * patch.normal[axis]);
      }
      const outside = samplePhysicalPyramidSlab(...outer.slice(0, 2), owner);
      const verticalGap = face === 'front' ? outer[2] - outside.z1 : outside.z0 - outer[2];
      close(verticalGap, film * Math.hypot(expectedSlope, 1));
      assert.ok(verticalGap > film, 'Sloped surface must not use vertical-thickness shortcut');
    }
  });
}

test('local coating refuses creases, mixed facets, invalid patch boundaries and film collisions', () => {
  const options = { layerId: 'oxide', thicknessUm: film, triangleXY };
  assert.throws(
    () => physicalFacetNormalCoatingPatch(owner, { ...options, layerId: 'silicon' }),
    /distinct material/,
  );
  assert.throws(
    () => physicalFacetNormalCoatingPatch(owner, { ...options, thicknessUm: 0 }),
    /positive and finite/,
  );
  assert.throws(
    () => physicalFacetNormalCoatingPatch(owner, { ...options, face: 'side' }),
    /Unknown physical coating face/,
  );
  assert.throws(
    () =>
      physicalFacetNormalCoatingPatch(owner, {
        ...options,
        triangleXY: [triangleXY[0], triangleXY[2], triangleXY[1]],
      }),
    /positive XY area/,
  );
  assert.throws(
    () =>
      physicalFacetNormalCoatingPatch(owner, {
        ...options,
        triangleXY: [
          [0, 0],
          [1.5, 0.2],
          [1.2, 0.6],
        ],
      }),
    /ridge or apex/,
  );
  assert.throws(
    () =>
      physicalFacetNormalCoatingPatch(owner, {
        ...options,
        triangleXY: [
          [1.1, 0.1],
          [2.1, 0.1],
          [0.1, 1.6],
        ],
      }),
    /cannot cross pyramid creases/,
  );
  assert.throws(
    () =>
      physicalFacetNormalCoatingPatch(owner, {
        ...options,
        triangleXY: [
          [2.7, 0.1],
          [3.0, 0.1],
          [2.85, 0.2],
        ],
        thicknessUm: 2,
      }),
    /unsupported facet junction/,
  );
});

test('coating patch remains experimental and does not alter canonical Si owner', () => {
  const baseline = JSON.stringify(owner);
  const patch = physicalFacetNormalCoatingPatch(owner, {
    face: 'front',
    layerId: 'oxide',
    triangleXY,
    thicknessUm: film,
  });
  const sample = squarePyramidSample(1.6, 0.2, {
    pitch: owner.pitch,
    height: owner.height,
    planeZ: owner.topPlaneZ,
    face: 'front',
  });
  assert.deepEqual(patch.normal, sample.normal);
  assert.equal(JSON.stringify(owner), baseline);
  assert.equal(Object.hasOwn(owner, 'coating'), false);
});
