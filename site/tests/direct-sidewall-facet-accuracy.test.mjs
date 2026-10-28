import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exactFixedSidewallVisibleFacet,
  facetPolygonArea,
  partitionFixedSidewallFacet,
} from '../direct-sidewall-facet-partition.js';

const facet = { a: [2, -1], b: [2, 1], lowZ: 5, highZ: 6 };
const rect = (x0, x1, y0, y1) => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  ],
];
const beam = (phi = 45) => ({
  tiltDeg: 45,
  azimuthDeg: phi,
  apertureStack: [{ bottomZUm: 6, topZUm: 6.6, opening: rect(2.2, 3.6, -0.4, 0.4) }],
});
const rayAllowed = (t, z, b = beam()) =>
  b.apertureStack.every((mask) =>
    [mask.bottomZUm, mask.topZUm].every((h) => {
      const x =
        2 +
        (h - z) * Math.tan((b.tiltDeg * Math.PI) / 180) * Math.cos((b.azimuthDeg * Math.PI) / 180);
      const y =
        t +
        (h - z) * Math.tan((b.tiltDeg * Math.PI) / 180) * Math.sin((b.azimuthDeg * Math.PI) / 180);
      return x >= 2.2 - 1e-9 && x <= 3.6 + 1e-9 && y >= -0.4 - 1e-9 && y <= 0.4 + 1e-9;
    }),
  );
const covered = (x) =>
  x.reduce(
    (s, p) =>
      s + (p.b[1] - p.a[1]) * (p.visibleHeightIntervals[0][1] - p.visibleHeightIntervals[0][0]),
    0,
  );

test('analytic exact facet area bounds native material quantization and adaptive accuracy', () => {
  const exact = exactFixedSidewallVisibleFacet(facet, beam());
  const trueArea = facetPolygonArea(exact);
  assert.ok(Math.abs(trueArea - 0.2613499294879458) < 1e-10);
  const patches = partitionFixedSidewallFacet(facet, beam());
  assert.ok(patches.length > 15, 'default 50 nm requires refinement');
  const loss = (trueArea - covered(patches)) / trueArea;
  assert.ok(loss >= -1e-9 && loss <= 0.02 + 1e-9, 'physical area loss: ' + loss);
  assert.ok(patches.length <= 256);
});

test('grid-adjacent slices have no repeated inward-rounding XY cracks', () => {
  const patches = partitionFixedSidewallFacet(facet, beam(), {
    maximumSliceUm: 0.0003,
    maxSlices: 10000,
    maxAreaLossFraction: 0.99,
  });
  for (let i = 1; i < patches.length; i++) assert.equal(patches[i - 1].b[1], patches[i].a[1]);
  const exactArea = facetPolygonArea(exactFixedSidewallVisibleFacet(facet, beam()));
  assert.ok((exactArea - covered(patches)) / exactArea < 0.002);
});

test('tight accuracy budget fails closed instead of promising false coverage', () => {
  assert.throws(
    () =>
      partitionFixedSidewallFacet(facet, beam(), {
        maxSlices: 20,
        maxAreaLossFraction: 0.01,
      }),
    /accuracy budget/,
  );
  assert.throws(
    () =>
      partitionFixedSidewallFacet(facet, beam(), {
        maxAreaLossFraction: -0.02,
      }),
    /area-loss fraction/,
  );
  assert.throws(
    () =>
      partitionFixedSidewallFacet(facet, beam(), {
        maxAreaLossFraction: 1,
      }),
    /area-loss fraction/,
  );
});

test('facet exact visibility respects negative incidence azimuth', () => {
  const a = exactFixedSidewallVisibleFacet(facet, beam(45));
  const b = exactFixedSidewallVisibleFacet(facet, beam(-45));
  assert.ok(facetPolygonArea(a) > 0);
  assert.ok(facetPolygonArea(b) > 0);
  assert.notDeepEqual(a, b);
});

test('exact half-plane clipping matches independent dense ray sampling', () => {
  const exactArea = facetPolygonArea(exactFixedSidewallVisibleFacet(facet, beam()));
  const n = 600;
  let hits = 0;
  for (let yi = 0; yi < n; yi++) {
    const t = -1 + (2 * (yi + 0.5)) / n;
    for (let zi = 0; zi < n; zi++) {
      const z = 5 + (zi + 0.5) / n;
      if (rayAllowed(t, z)) hits++;
    }
  }
  const independentlySampled = (hits * 2) / (n * n);
  assert.ok(Math.abs(independentlySampled - exactArea) < 0.002);
});

test('two upper apertures intersect their exact illuminated facets without overdeposit', () => {
  const independent = beam();
  const next = {
    ...beam(),
    apertureStack: [
      independent.apertureStack[0],
      {
        bottomZUm: 6.6,
        topZUm: 7.0,
        opening: rect(2.5, 4.1, -0.1, 0.6),
      },
    ],
  };
  const exact = facetPolygonArea(exactFixedSidewallVisibleFacet(facet, next));
  const first = facetPolygonArea(exactFixedSidewallVisibleFacet(facet, independent));
  assert.ok(exact > 0 && exact < first);
  const parts = partitionFixedSidewallFacet(facet, next);
  assert.ok((exact - covered(parts)) / exact <= 0.0200001);
  for (const part of parts) {
    for (const t of [part.a[1], part.b[1]])
      for (const z of part.visibleHeightIntervals[0])
        assert.ok(
          next.apertureStack.every(({ bottomZUm, topZUm, opening }) =>
            [bottomZUm, topZUm].every((h) => {
              const X = 2 + (h - z) * Math.SQRT1_2;
              const Y = t + (h - z) * Math.SQRT1_2;
              const xs = opening[0][0].map((v) => v[0]);
              const ys = opening[0][0].map((v) => v[1]);
              return (
                X >= Math.min(...xs) - 1e-9 &&
                X <= Math.max(...xs) + 1e-9 &&
                Y >= Math.min(...ys) - 1e-9 &&
                Y <= Math.max(...ys) + 1e-9
              );
            }),
          ),
        );
  }
});

test('rotating aperture, beam, and wall together preserves the exact area', () => {
  const rotated = { a: [1, 2], b: [-1, 2], lowZ: 5, highZ: 6 };
  const b = {
    tiltDeg: 45,
    azimuthDeg: 135,
    apertureStack: [{ bottomZUm: 6, topZUm: 6.6, opening: rect(-0.4, 0.4, 2.2, 3.6) }],
  };
  const exact = facetPolygonArea(exactFixedSidewallVisibleFacet(rotated, b));
  assert.ok(
    Math.abs(exact - facetPolygonArea(exactFixedSidewallVisibleFacet(facet, beam()))) < 1e-10,
  );
  const patches = partitionFixedSidewallFacet(rotated, b);
  const estimated = patches.reduce(
    (sum, p) =>
      sum +
      Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) *
        (p.visibleHeightIntervals[0][1] - p.visibleHeightIntervals[0][0]),
    0,
  );
  assert.ok((exact - estimated) / exact <= 0.02 + 1e-8);
});

test('physical wafer coordinate translation does not silently shift visibility', () => {
  const dx = 1400,
    dy = 2513,
    dz = 337.5;
  const translatedFacet = {
    a: [facet.a[0] + dx, facet.a[1] + dy],
    b: [facet.b[0] + dx, facet.b[1] + dy],
    lowZ: facet.lowZ + dz,
    highZ: facet.highZ + dz,
  };
  const translatedBeam = {
    ...beam(),
    apertureStack: beam().apertureStack.map((a) => ({
      bottomZUm: a.bottomZUm + dz,
      topZUm: a.topZUm + dz,
      opening: a.opening.map((p) => p.map((r) => r.map(([x, y]) => [x + dx, y + dy]))),
    })),
  };
  const exact = facetPolygonArea(exactFixedSidewallVisibleFacet(translatedFacet, translatedBeam));
  const base = facetPolygonArea(exactFixedSidewallVisibleFacet(facet, beam()));
  assert.ok(Math.abs(exact - base) < 1e-7, 'wafer coordinates: ' + exact + ' vs ' + base);
  const parts = partitionFixedSidewallFacet(translatedFacet, translatedBeam);
  const estimate = parts.reduce(
    (sum, p) =>
      sum +
      Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) *
        (p.visibleHeightIntervals[0][1] - p.visibleHeightIntervals[0][0]),
    0,
  );
  assert.ok((exact - estimate) / exact <= 0.02 + 1e-7);
});
