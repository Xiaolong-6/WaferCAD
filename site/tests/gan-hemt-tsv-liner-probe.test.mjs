import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGanMicrochannel } from '../../scripts/build-gan-hemt-microchannel-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');

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

function depositConformal(model, mask, name, thickness) {
  const op = { type: 'add', name, thickness, growth: 'conformal', face: 'front' };
  const result =
    applyAdvancedProcessOperation(model, op, mask, modelApi, vectorApi) ||
    modelApi.applyOperation(model, { ...op, area: mask });
  assert.equal(result?.changed, true, name + ': ' + (result?.error || 'no material change'));
  return result.layerId;
}

test('TSV-focused conformal Ti/Cu probe preserves the coolant and open via cores', async () => {
  const { project } = await buildGanMicrochannel();
  const model = structuredClone(project.model);
  // The 70 um square bore must be surrounded by a little exposed silicon:
  // a mask exactly equal to the empty bore cannot seed a physical wall.
  const tsvMask = vectorApi.unionGeometries(
    tsvCenters.map(([x, y]) => vectorApi.rectMulti(90, 90, x, y)),
  );
  const ti = depositConformal(model, tsvMask, 'TSV Ti seed probe 0.2 um', 0.2);
  const cu = depositConformal(model, tsvMask, 'TSV Cu seed probe 0.5 um', 0.5);
  const heights = [-150, 50, 250, 450, 550];
  const seen = {};
  for (const [x, y] of tsvCenters) {
    for (const z of heights) {
      assert.equal(layerAt(model, [x, y], z), null, 'Plating blocked TSV core at ' + [x, y, z]);
      const observed = new Set();
      for (let offset = 33; offset <= 37.0001; offset += 0.05) {
        observed.add(layerAt(model, [x + offset, y], z));
      }
      for (const [name, id] of [['Ti', ti], ['Cu', cu]]) {
        assert.ok(observed.has(id), name + ' wall film absent at ' + [x, y, z]);
      }
      seen[[x, y, z].join(',')] = [...observed].filter(Boolean).length;
    }
  }
  for (const side of [-1, 1]) {
    for (const y of [side * 1450, side * 1200, side * 420]) {
      for (const z of [-150, 100]) {
        assert.equal(
          layerAt(model, [0, y], z),
          null,
          'Conformal plating encroached on coolant at ' + [0, y, z],
        );
      }
    }
  }
  console.log('TSV conformal film probe passed:', JSON.stringify({ heightChecks: heights, sample: seen }));
});
