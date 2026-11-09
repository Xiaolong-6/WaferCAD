import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { resolveArrayModel } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');
const { difference, materialGeometryArea } = await import('../material-process-boolean.js');

test('3 µm dense chip tile boundaries share exact material-grid coordinates', () => {
  // 125.6108 µm is the boundary of the original chip2 dense-halo fixture.
  // Before canonical local translation, a derived -1.4999999999999982 µm
  // border falsely excludes the actual -1.5 µm clipped substrate polygon.
  const source = createModel({ shape: 'rect', width: 125.6108, height: 125.6108, thickness: 1 });
  const original = structuredClone(source);
  const tiled = tileMaterialModel(source, { cellSizeUm: 3 });
  assert.deepEqual(source, original, 'tiling must not mutate the source model');
  for (const { model } of tiled.array.templates) validateProcessModel(model);
  validateProcessModel(tiled);
  const restored = resolveArrayModel(tiled);
  validateProcessModel(restored);
  assert.equal(materialGeometryArea(difference(original.boundary, restored.boundary)), 0);
  assert.equal(materialGeometryArea(difference(restored.boundary, original.boundary)), 0);
  for (const { model } of tiled.array.templates) {
    for (const polygon of model.boundary)
      for (const ring of polygon)
        for (const point of ring)
          for (const coordinate of point) {
            const scaled = coordinate * 10000000;
            assert.ok(Math.abs(scaled - Math.round(scaled)) < 1e-6);
          }
  }
});

test('4 µm retile preserves exact grid contact when the floating sweep cannot close a ring', async () => {
  const { rectMulti } = await import('../vector-geometry.js');
  const { provablyDisjointGridGeometry } = await import('../geometry-grid-separation.js');
  // Exact local rings from the dense chip2 Al5 fixture (region-365 and
  // region-603), cropped around (-20, 25) µm and re-tiled at 4 µm.
  const local = [
    [
      [-15652399, 20000000],
      [6000000, -1653000],
      [6000000, -7318000],
      [6046000, -7364000],
      [6000000, -7410000],
      [6000000, -18347000],
      [4345870, -20000000],
      [8589223, -20000000],
      [8652000, -19937000],
      [8723000, -19867000],
      [9000000, -19590000],
      [9000000, -410000],
      [-11410000, 20000000],
      [-15652399, 20000000],
    ],
    [
      [-11410000, 20000000],
      [7590000, 1000000],
      [7640000, 1050000],
      [-11310000, 20000000],
      [-11410000, 20000000],
    ],
  ];
  const grid = 10000000;
  const origin = [-22, 27];
  const model = createModel({ shape: 'rect', width: 4, height: 4, thickness: 1 });
  model.boundary = rectMulti(4, 4, ...origin);
  model.regions = local.map((ring, i) => ({
    ...model.regions[0],
    id: `owner-${i}`,
    geom: [[ring.map(([x, y]) => [(x + origin[0] * grid) / grid, (y + origin[1] * grid) / grid])]],
  }));
  const tiled = tileMaterialModel(model, { cellSizeUm: 4 });
  const { regions } = tiled.array.templates[0].model;
  for (const [i, { geom }] of regions.entries()) {
    const expected = [[local[i].map(([x, y]) => [x / grid, y / grid])]];
    assert.equal(materialGeometryArea(difference(geom, expected)), 0);
    assert.equal(materialGeometryArea(difference(expected, geom)), 0);
  }
  assert.equal(provablyDisjointGridGeometry(regions[0].geom, regions[1].geom), true);
  validateProcessModel(tiled);
});
