import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionFixedSidewallFacet } from '../direct-sidewall-facet-partition.js';
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
test('conservative tangent-Z facet partition emits only fully visible rectangles', () => {
  const patches = partitionFixedSidewallFacet(facet, beam());
  assert.ok(patches.length > 1);
  for (const p of patches) {
    for (const t of [p.a[1], (p.a[1] + p.b[1]) / 2, p.b[1]])
      for (const z of [p.visibleHeightIntervals[0][0], p.visibleHeightIntervals[0][1]])
        assert.equal(rayAllowed(t, z), true, `${t} ${z}`);
  }
});
test('half-step resolution converges monotonically without overdeposit', () => {
  const a = partitionFixedSidewallFacet(facet, beam(), {
    maximumSliceUm: 0.1,
    maxAreaLossFraction: 0.99,
  });
  const b = partitionFixedSidewallFacet(facet, beam(), {
    maximumSliceUm: 0.05,
    maxAreaLossFraction: 0.99,
  });
  const c = partitionFixedSidewallFacet(facet, beam(), {
    maximumSliceUm: 0.025,
    maxAreaLossFraction: 0.99,
  });
  assert.ok(covered(a) < covered(b) && covered(b) < covered(c), [
    covered(a),
    covered(b),
    covered(c),
  ]);
  assert.ok(covered(c) > 0.06);
});
test('rejects invalid partial-facet shape or unbounded budget', () => {
  assert.throws(
    () => partitionFixedSidewallFacet(facet, beam(), { maximumSliceUm: 0.001, maxSlices: 20 }),
    /budget/,
  );
  assert.throws(
    () =>
      partitionFixedSidewallFacet(facet, {
        ...beam(),
        apertureStack: [{ bottomZUm: 5.5, topZUm: 6.6, opening: rect(2, 4, -1, 1) }],
      }),
    /upper-only/,
  );
  assert.throws(
    () =>
      partitionFixedSidewallFacet(facet, {
        ...beam(),
        apertureStack: [
          {
            bottomZUm: 6,
            topZUm: 7,
            opening: [
              [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                ],
              ],
            ],
          },
        ],
      }),
    /rectangle/,
  );
});
test('diagonal beam reversal changes illuminated patches', () => {
  const plus = partitionFixedSidewallFacet(facet, beam(45));
  const minus = partitionFixedSidewallFacet(facet, beam(-45));
  assert.ok(plus.length && minus.length);
  assert.notDeepEqual(plus, minus);
});
