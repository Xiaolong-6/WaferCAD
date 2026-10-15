import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGanMicrochannel } from '../../scripts/build-gan-hemt-microchannel-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const vectorApi = await import('../vector-geometry.js');

const tsvCenters = [-1450, 1450].flatMap((x) => [-950, 950].map((y) => [x, y]));

function stackAt(model, point) {
  return model.regions
    .filter((region) => vectorApi.pointInMulti(point, region.geom))
    .flatMap((region) => region.stack);
}

function layerAt(model, point, z) {
  const segment = stackAt(model, point).find((s) => s.z0 < z && s.z1 > z);
  return segment?.layerId || null;
}

test('Production Cu-filled TSVs retain seed liners and open coolant network', async () => {
  const { project } = await buildGanMicrochannel();
  const model = project.model;
  const ti = model.layers.find((l) => l.name === 'TSV Ti conformal seed surrogate 0.2 um');
  const cu = model.layers.find((l) => l.name === 'TSV Cu conformal seed surrogate 0.5 um');
  assert.ok(ti && cu, 'Production build omitted real Ti/Cu wall material');
  const heights = [-150, 50, 250, 450, 550];
  const seen = {};
  for (const [x, y] of tsvCenters) {
    for (const z of heights) {
      const fill = model.layers.find((l) => l.name === 'TSV Cu electrofill surrogate 35 um');
      assert.ok(fill, 'No actual Cu fill layer');
      assert.equal(layerAt(model, [x, y], z), fill.id, 'Cu core missing at ' + [x, y, z]);
      const observed = new Set();
      for (let offset = 33; offset <= 37.0001; offset += 0.05) {
        observed.add(layerAt(model, [x + offset, y], z));
      }
      for (const [name, id] of [
        ['Ti', ti.id],
        ['Cu', cu.id],
      ]) {
        assert.ok(observed.has(id), name + ' wall film absent at ' + [x, y, z]);
      }
      seen[[x, y, z].join(',')] = [...observed].filter(Boolean).length;
    }
  }
  // A fluid point is a 3D position, not an XY position: the lower feeder
  // has silicon beneath the 200 um trench while the rear bore is through-open.
  // Compare the exact material occupancy before and after plating and assert
  // known fluid-path points remain empty.
  for (const side of [-1, 1]) {
    const coolantPath = [
      [0, side * 1450, -150],
      [0, side * 1450, 100],
      [0, side * 1200, 100],
      [0, side * 420, 100],
      [30, side * 395, 350],
      [30, side * 395, 550],
      [0, side * 425, 550],
    ];
    for (const [x, y, z] of coolantPath) {
      assert.equal(
        layerAt(model, [x, y], z),
        null,
        'TSV metal altered fluid-path material at ' + [x, y, z],
      );
    }
  }
  console.log(
    'TSV conformal film probe passed:',
    JSON.stringify({ heightChecks: heights, sample: seen }),
  );
});

