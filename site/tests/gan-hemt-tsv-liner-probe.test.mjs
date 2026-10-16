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

test('Persisted Cu-filled TSV geometry is planarized without losing metal', async () => {
  const { project } = await buildGanMicrochannel();
  const model = project.model;
  const fill = model.layers.find((layer) => layer.name === 'TSV Cu electrofill surrogate 35 um');
  const seed = model.layers.find(
    (layer) => layer.name === 'TSV Cu conformal seed surrogate 0.5 um',
  );
  assert.ok(fill && seed);
  for (const [x, y] of tsvCenters) {
    for (const z of [-150, 50, 250, 450, 550, 600]) {
      assert.equal(layerAt(model, [x, y], z), fill.id);
    }
    assert.notEqual(layerAt(model, [x, y], 625), fill.id);
    assert.equal(layerAt(model, [x + 35.4, y], 600.45), seed.id);
  }
});

test('GSG pad footprints and Cu TSV cores are distinct modeled contacts', async () => {
  const { project } = await buildGanMicrochannel();
  const model = project.model;
  const gsgPad = model.layers.find((layer) => layer.name === 'GSG Au pads surrogate 0.5 um');
  const copper = model.layers.find((layer) => layer.name === 'TSV Cu electrofill surrogate 35 um');
  assert.ok(gsgPad && copper, 'Expected GSG pad footprint and Cu-filled TSV materials');

  // Fig. 2(f) shows wire bonds between the HEMT and the separate GSG pad
  // chips. TSV copper supports distinct vertical interconnection / grounding.
  // DO NOT require a fabricated direct GSG-to-TSV Au trace as a paper fact.
  for (const side of [-1, 1]) {
    assert.equal(
      layerAt(model, [side * 1250, 0], 600.25),
      gsgPad.id,
      'Illustrative GSG pad footprint is missing',
    );
    assert.equal(
      layerAt(model, [side * 1250, 0], 600.51),
      null,
      'The 0.5 um GSG pad footprint must not silently grow into a thicker structure',
    );
    for (const y of [-950, 950]) {
      assert.equal(
        layerAt(model, [side * 1450, y], 550),
        copper.id,
        'Actual TSV copper is missing inside the interposer',
      );
    }
  }
  const wireBondRecord = project.processRecipe.steps.find(
    (step) => step.command === 'record' && step.params.label.includes('Au wire bonds'),
  );
  assert.ok(wireBondRecord, 'Published HEMT-to-GSG gold wire bonding must remain documented');
  assert.match(
    wireBondRecord.params.note,
    /True curved wires.*not geometric model features/,
    'A recorded source operation must not be mistaken for fabricated wire geometry',
  );
});
