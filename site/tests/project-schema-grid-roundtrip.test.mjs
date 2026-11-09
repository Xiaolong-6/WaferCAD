import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');
const { provablyDisjointGridGeometry } = await import('../geometry-grid-separation.js');
const { robustIntersection } = await import('../polygon-boolean.js');
const { materialGeometryArea } = await import('../material-process-boolean.js');

const rect = (x0, x1, y0, y1) => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
];
function twoRegions(first, second) {
  const model = createModel({ shape: 'rect', width: 6, height: 6, thickness: 1 });
  model.regions = [
    { ...model.regions[0], id: 'left', geom: first },
    { ...model.regions[0], id: 'right', geom: second },
  ];
  return model;
}

test('near-grid coordinates cannot erase finite physical overlap in validation', () => {
  const left = rect(-1, 1, -2, 2);
  for (const overlapUm of [3e-14, 5e-14, 8e-14]) {
    const right = rect(1 - overlapUm, 2, -2, 2);
    assert.ok(materialGeometryArea(robustIntersection(left, right)) > 1e-13);
    assert.equal(provablyDisjointGridGeometry(left, right), false);
    assert.throws(() => validateProcessModel(twoRegions(left, right)), /geom overlaps/);
  }
});

test('exact 1e-7 µm material grid segments distinguish touching from overlap', () => {
  const left = rect(-1, 1, -2, 2);
  const touching = rect(1, 2, -2, 2);
  const overlapping = rect(1 - 1e-7, 2, -2, 2);
  assert.equal(provablyDisjointGridGeometry(left, touching), true);
  validateProcessModel(twoRegions(left, touching));
  assert.equal(provablyDisjointGridGeometry(left, overlapping), false);
  assert.throws(() => validateProcessModel(twoRegions(left, overlapping)), /geom overlaps/);
});

test('a sub-grid physical gap is never mistaken for exact grid disjointness', () => {
  const left = rect(-1, 1, -2, 2);
  const right = rect(1 + 5e-14, 2, -2, 2);
  assert.equal(provablyDisjointGridGeometry(left, right), false);
  validateProcessModel(twoRegions(left, right));
});

test('integer disjointness proof conservatively agrees with independent Boolean across shape families', () => {
  const shapes = [
    [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ],
    [
      [0, 0],
      [4, 0],
      [0, 3],
    ],
    [
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ],
    [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ],
    [
      [0, 0],
      [2, 0],
      [4, 2],
      [2, 4],
      [0, 2],
    ],
  ];
  let seed = 392;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const sample = () => {
    const vertices = shapes[Math.floor(random() * shapes.length)].map((p) => [...p]);
    if (random() < 0.5) vertices.reverse();
    const dx = Math.floor(random() * 15) - 7;
    const dy = Math.floor(random() * 15) - 7;
    const ring = vertices.map(([x, y]) => [(x + dx) / 10, (y + dy) / 10]);
    return [[ring.concat([ring[0]])]];
  };
  let provedDisjoint = 0;
  let overlaps = 0;
  for (let i = 0; i < 1200; i++) {
    const a = sample();
    const b = sample();
    const verified = provablyDisjointGridGeometry(a, b);
    const overlap = materialGeometryArea(robustIntersection(a, b));
    if (verified) {
      assert.ok(overlap < 1e-7, `false disjointness at sample ${i}: overlap=${overlap}`);
      provedDisjoint++;
    } else if (overlap > 1e-5) {
      overlaps++;
    }
  }
  assert.ok(provedDisjoint > 1000);
  assert.ok(overlaps > 90);
});
