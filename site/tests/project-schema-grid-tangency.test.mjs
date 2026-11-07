import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');
const { provablyDisjointGridGeometry } = await import('../geometry-grid-separation.js');
const { robustIntersection } = await import('../polygon-boolean.js');
const { materialGeometryArea } = await import('../material-process-boolean.js');
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL('../../tests/fixtures/transmon-material-grid-tangencies.json.gz', import.meta.url),
    ),
  ),
);
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
function modelWithPair(first, second) {
  const model = createModel({ shape: 'rect', width: 6, height: 6, thickness: 1 });
  model.regions = [
    { ...model.regions[0], id: 'left', geom: first },
    { ...model.regions[0], id: 'right', geom: second },
  ];
  return model;
}

test('original dense halo grazing-grid contacts are not fabricated as overlapping material', () => {
  assert.match(fixture.source, /Transmon dense halo/);
  for (const { first, second } of fixture.pairs) {
    // Independent exact contour proof must rule out only area overlap. The
    // general floating-point Boolean can manufacture an impossible positive
    // region from these legitimate near-collinear material boundaries.
    assert.ok(materialGeometryArea(robustIntersection(first, second)) > 1e-7);
    assert.equal(provablyDisjointGridGeometry(first, second), true);
    validateProcessModel(modelWithPair(first, second));
  }
});

test('exact grid contour proof never accepts a genuine shared-material area', () => {
  const base = rect(-1, 1, -1, 1);
  const real = rect(0.999, 2, -1, 1);
  const contained = rect(-0.5, 0.5, -0.5, 0.5);
  const coincident = structuredClone(base);
  for (const other of [real, contained, coincident]) {
    assert.equal(provablyDisjointGridGeometry(base, other), false);
    assert.throws(() => validateProcessModel(modelWithPair(base, other)), /geom overlaps/);
  }
  assert.equal(provablyDisjointGridGeometry(base, rect(1, 2, -1, 1)), true);
  assert.equal(provablyDisjointGridGeometry(base, rect(1, 2, 1, 2)), true);
});

test('off-grid sub-lattice intersections are never treated as disjoint', () => {
  const base = rect(-1, 1, -1, 1);
  const positive = rect(1 - 3e-8, 2, -1, 1);
  assert.equal(provablyDisjointGridGeometry(base, positive), false);
  assert.throws(() => validateProcessModel(modelWithPair(base, positive)), /geom overlaps/);
});
