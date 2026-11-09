import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');
const { provablyDisjointGridGeometry } = await import('../geometry-grid-separation.js');

const ring = (x0, x1, y0, y1, reversed = false) => {
  const pts = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => [x / 10, y / 10]);
  if (reversed) pts.reverse();
  return [...pts, pts[0]];
};
const rectangle = (bounds, reversed = false) => [[ring(...bounds, reversed)]];
const annulus = (outer, hole, reverseOuter = false, reverseHole = false) => [
  [ring(...outer, reverseOuter), ring(...hole, reverseHole)],
];
const pairModel = (a, b) => {
  const model = createModel({ shape: 'rect', width: 12, height: 12, thickness: 1 });
  model.regions = [
    { ...model.regions[0], id: 'left', geom: a },
    { ...model.regions[0], id: 'right', geom: b },
  ];
  return model;
};
const intersectArea = (a, b) =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[2], b[2]));

test('valid hole has material outside, not inside, its void boundary', () => {
  const ann = annulus([-20, 20, -20, 20], [-10, 10, -10, 10]);
  for (const box of [
    [-5, 5, -5, 5],
    [-10, 0, -5, 5],
    [20, 30, -5, 5],
  ]) {
    const other = rectangle(box);
    assert.equal(provablyDisjointGridGeometry(ann, other), true);
    validateProcessModel(pairModel(ann, other));
  }
  for (const box of [
    [5, 15, -5, 5],
    [12, 16, -5, 5],
    [-20, 20, -20, 20],
  ]) {
    assert.equal(provablyDisjointGridGeometry(ann, rectangle(box)), false);
    assert.throws(() => validateProcessModel(pairModel(ann, rectangle(box))), /geom overlaps/);
  }
});

test('malformed or externally touching holes fail closed rather than bypass geometry validation', () => {
  const outer = [-20, 20, -20, 20];
  for (const hole of [
    [-25, 0, -5, 5],
    [-20, 0, -5, 5],
    [-10, 25, -5, 5],
  ]) {
    const invalid = annulus(outer, hole);
    assert.equal(provablyDisjointGridGeometry(invalid, rectangle([25, 30, -5, 5])), false);
  }
});

test('1000 randomized rectangular holes agree with exact integer area inclusion-exclusion', () => {
  let seed = 403;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  let provedDisjoint = 0;
  let realOverlaps = 0;
  for (let i = 0; i < 1000; i++) {
    const x = random(21) - 10;
    const y = random(21) - 10;
    const outer = [x, x + 12, y, y + 12];
    const hole = [x + 3, x + 9, y + 3, y + 9];
    const first = annulus(outer, hole, Boolean(random(2)), Boolean(random(2)));
    const u = random(31) - 12;
    const v = random(31) - 12;
    const useHole = Boolean(random(2));
    const otherOuter = [u, u + (useHole ? 12 : 8), v, v + (useHole ? 12 : 8)];
    const otherHole = [u + 3, u + 9, v + 3, v + 9];
    const second = useHole
      ? annulus(otherOuter, otherHole, Boolean(random(2)), Boolean(random(2)))
      : rectangle(otherOuter, Boolean(random(2)));
    const area =
      intersectArea(outer, otherOuter) -
      intersectArea(hole, otherOuter) -
      (useHole ? intersectArea(outer, otherHole) - intersectArea(hole, otherHole) : 0);
    const disjoint = provablyDisjointGridGeometry(first, second);
    if (disjoint) {
      assert.equal(area, 0, `wrong no-overlap proof in sample ${i}`);
      provedDisjoint++;
    }
    if (area > 0) {
      assert.equal(disjoint, false, `real overlap bypass in sample ${i}`);
      realOverlaps++;
    }
  }
  assert.ok(provedDisjoint > 200);
  assert.ok(realOverlaps > 100);
});
