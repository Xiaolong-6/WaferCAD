import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, processBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, conformalCarrierXYScale, createModel, surfaceZ } =
  await import('../model.js');
const { circleMulti, pointInMulti, rectMulti, intersection, isEmpty, unionGeometries } =
  await import('../vector-geometry.js');
const { extrusionGroups, sectionSlices } = await import('../model-view-geometry.js');

function stackAt(model, x, y = 0) {
  return model.regions.find((r) => pointInMulti([x, y], r.geom))?.stack || [];
}
function coatAt(benchmark, x, y = 0) {
  return stackAt(benchmark.model, x, y).find((s) => s.layerId === benchmark.layerId);
}

function area(geom) {
  const ringArea = (ring) =>
    Math.abs(
      ring
        .slice(1)
        .reduce((sum, point, i) => sum + ring[i][0] * point[1] - point[0] * ring[i][1], 0) / 2,
    );
  return geom.reduce(
    (sum, poly) =>
      sum + ringArea(poly[0]) - poly.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0),
    0,
  );
}

function volume(model, layerId = null) {
  return extrusionGroups(model)
    .filter((s) => !layerId || s.layerId === layerId)
    .reduce((sum, s) => sum + area(s.polys) * (s.z1 - s.z0), 0);
}
function assertCoat(benchmark, x, expected, face, y = 0) {
  const segment = coatAt(benchmark, x, y);
  assert.ok(segment);
  const actual = face === 'front' ? [segment.z0, segment.z1] : [-segment.z1, -segment.z0];
  assert.deepEqual(actual, expected);
}

for (const face of ['front', 'back']) {
  for (const kind of ['step', 'trench', 'island']) {
    test(`${kind} ${face}: Direct/Conformal top, sidewall and far field`, async () => {
      const direct = await processBenchmark(kind, 'direct', face);
      const conformal = await processBenchmark(kind, 'conformal', face);
      const lateral = conformalCarrierXYScale(conformal.model);
      const sideX =
        kind === 'step' ? lateral / 2 : kind === 'trench' ? 2 - lateral / 2 : 2 + lateral / 2;
      const lower = kind === 'trench' ? 3 : 5;
      const upper = kind === 'trench' ? 5 : 7;
      assert.ok(Math.abs(volume(direct.model, direct.layerId) - 400) < 1e-8);
      const conformalVolume =
        kind === 'step'
          ? 400 + 40 * lateral
          : kind === 'trench'
            ? 400 + 80 * lateral
            : 400 + 2 * (16 * lateral + Math.PI * lateral ** 2);
      assert.ok(Math.abs(volume(conformal.model, conformal.layerId) - conformalVolume) < 0.05);
      assertCoat(direct, sideX, [lower, lower + 1], face);
      assertCoat(conformal, sideX, [lower, upper + 1], face);
      assertCoat(
        conformal,
        kind === 'step' ? 3 : kind === 'trench' ? 0 : 5,
        [lower, lower + 1],
        face,
      );
      assertCoat(
        conformal,
        kind === 'step' ? -3 : kind === 'trench' ? 5 : 0,
        [upper, upper + 1],
        face,
      );
      if (kind === 'island') {
        assertCoat(conformal, 0, [5, 8], face, 2 + lateral / 2);
        // The corner buffer is round, not the expanded bounding box.
        assertCoat(conformal, 2 + lateral * 0.9, [5, 6], face, 2 + lateral * 0.9);
      }
      for (const benchmark of [direct, conformal]) {
        const { model, section } = benchmark;
        // Partition and stack invariants guard against overlapping materials.
        for (let i = 0; i < model.regions.length; i++) {
          const region = model.regions[i];
          for (let j = i + 1; j < model.regions.length; j++)
            assert.equal(isEmpty(intersection(region.geom, model.regions[j].geom)), true);
          for (let j = 1; j < region.stack.length; j++)
            assert.ok(region.stack[j].z0 >= region.stack[j - 1].z1 - 1e-9);
        }
        const slices = sectionSlices(model, section.a, section.b);
        const extrusions = extrusionGroups(model);
        // Independently compare material intervals rendered by Section and 3D.
        for (const x of [-8, -3, -1.5, 0, 0.5, 1.5, 2.5, 5, 8]) {
          const t = (x + 9) / 18;
          const fromSection = slices
            .filter((s) => t > s.t0 && t < s.t1)
            .map((s) => [s.layerId, s.z0, s.z1])
            .sort();
          const from3D = extrusions
            .filter((s) => pointInMulti([x, 0], s.polys))
            .map((s) => [s.layerId, s.z0, s.z1])
            .sort();
          // Avoid exact region boundaries in this point-sampling comparison.
          if (!slices.some((s) => Math.abs(t - s.t0) < 1e-9 || Math.abs(t - s.t1) < 1e-9))
            assert.deepEqual(fromSection, from3D);
        }
        // A directional etch must remove the coating and underlying material in order.
        const before = surfaceZ(stackAt(model, sideX), face);
        const beforeVolume = volume(model);
        applyOperation(model, {
          type: 'etch',
          thickness: 1.5,
          face,
          area: rectMulti(2, 2, sideX, 0),
        });
        assert.equal(
          surfaceZ(stackAt(model, sideX), face),
          before + (face === 'front' ? -1.5 : 1.5),
        );
        assert.ok(Math.abs(volume(model) - (beforeVolume - 6)) < 1e-7);
      }
    });
  }
}

test('Conformal sidewall uses a thin canonical XY carrier independent of wafer display scale', () => {
  const model = createModel({ shape: 'rect', width: 100000, height: 100000, thickness: 10 });
  applyOperation(model, {
    type: 'add',
    name: 'Step',
    thickness: 2,
    area: rectMulti(50000, 100000, -25000, 0),
  });
  const coat = applyOperation(model, {
    type: 'add',
    name: 'Conformal coat',
    thickness: 1,
    area: model.boundary,
    growth: 'conformal',
  });
  const carrier = conformalCarrierXYScale(model);
  assert.equal(carrier, 0.5);
  const sidewall = stackAt(model, carrier / 2).find((s) => s.layerId === coat.layerId);
  assert.deepEqual(
    { layerId: sidewall.layerId, z0: sidewall.z0, z1: sidewall.z1, role: sidewall.role },
    { layerId: coat.layerId, z0: 5, z1: 8, role: 'conformal-sidewall' },
  );
  assert.deepEqual(
    stackAt(model, 2).find((s) => s.layerId === coat.layerId),
    { layerId: coat.layerId, z0: 5, z1: 6 },
  );
});

test('partial-area Conformal keeps its footprint-edge buffer', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const coat = applyOperation(model, {
    type: 'add',
    name: 'Partial conformal',
    thickness: 1,
    area: rectMulti(4, 4),
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);
  assert.deepEqual(
    stackAt(model, 2 + conformalCarrierXYScale(model) / 2).find(
      (s) => s.layerId === coat.layerId,
    ),
    { layerId: coat.layerId, z0: 5, z1: 6, role: 'conformal-sidewall' },
  );
  assert.equal(
    stackAt(model, 3).find((s) => s.layerId === coat.layerId),
    undefined,
  );
});

test('wafer-scale circular trench receives a visible conformal sidewall band', () => {
  const model = createModel({ shape: 'circle', width: 100000, height: 100000, thickness: 12 });
  applyOperation(model, {
    type: 'etch',
    thickness: 2,
    area: circleMulti(10000),
  });
  const coat = applyOperation(model, {
    type: 'add',
    name: 'Conformal coat',
    thickness: 1,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);
  assert.ok(coat.layerId);
  const layerAt = (x) => stackAt(model, x).find((s) => s.layerId === coat.layerId);
  const carrier = conformalCarrierXYScale(model);
  assert.equal(carrier, 0.5);
  assert.deepEqual(layerAt(5000 - carrier / 2), {
    layerId: coat.layerId,
    z0: 4,
    z1: 7,
    role: 'conformal-sidewall',
  });
  assert.deepEqual(layerAt(0), { layerId: coat.layerId, z0: 4, z1: 5 });
  assert.deepEqual(layerAt(5000 + carrier), { layerId: coat.layerId, z0: 6, z1: 7 });
});

test('layered circular trench keeps conformal sidewalls after a later direct blanket', () => {
  const model = createModel({ shape: 'circle', width: 100000, height: 100000, thickness: 12 });
  applyOperation(model, {
    type: 'add',
    name: 'Layer 1',
    thickness: 2,
    area: model.boundary,
    growth: 'direct',
  });
  applyOperation(model, {
    type: 'etch',
    thickness: 2,
    area: circleMulti(10000),
  });
  const conformal = applyOperation(model, {
    type: 'add',
    name: 'Conformal',
    thickness: 1,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(conformal.changed, true);
  assert.ok(conformal.layerId);
  const direct = applyOperation(model, {
    type: 'add',
    name: 'Direct',
    thickness: 1,
    area: model.boundary,
    growth: 'direct',
  });
  const at = (x, layerId) => stackAt(model, x).find((s) => s.layerId === layerId);
  const carrier = conformalCarrierXYScale(model);
  const sideX = 5000 - carrier / 2;
  assert.deepEqual(at(sideX, conformal.layerId), {
    layerId: conformal.layerId,
    z0: 6,
    z1: 9,
    role: 'conformal-sidewall',
  });
  assert.deepEqual(at(sideX, direct.layerId), {
    layerId: direct.layerId,
    z0: 9,
    z1: 10,
  });
  assert.deepEqual(at(0, conformal.layerId), {
    layerId: conformal.layerId,
    z0: 6,
    z1: 7,
  });
  assert.deepEqual(at(5000 + carrier, conformal.layerId), {
    layerId: conformal.layerId,
    z0: 8,
    z1: 9,
  });
});

test('multi-hole layered wafer keeps conformal sidewalls around every etched opening', () => {
  const model = createModel({ shape: 'circle', width: 100000, height: 100000, thickness: 12 });
  applyOperation(model, {
    type: 'add',
    name: 'Layer 1',
    thickness: 2,
    area: model.boundary,
    growth: 'direct',
  });
  const holes = [];
  const centers = [-32000, -24000, -16000, -8000, 0, 8000, 16000, 24000, 32000];
  for (const x of centers) for (const y of centers) holes.push(circleMulti(3500, 3500, 48, x, y));
  assert.equal(holes.length, 81);
  const etched = unionGeometries(holes);
  applyOperation(model, {
    type: 'etch',
    thickness: 2,
    area: etched,
  });
  const conformal = applyOperation(model, {
    type: 'add',
    name: 'Conformal',
    thickness: 1,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(conformal.changed, true);
  assert.ok(conformal.layerId);
  const at = (x, y = 0) => stackAt(model, x, y).find((s) => s.layerId === conformal.layerId);
  const carrier = conformalCarrierXYScale(model);
  assert.deepEqual(at(1750 - carrier / 2), {
    layerId: conformal.layerId,
    z0: 6,
    z1: 9,
    role: 'conformal-sidewall',
  });
  assert.deepEqual(at(0), { layerId: conformal.layerId, z0: 6, z1: 7 });
  assert.deepEqual(at(1750 + carrier), { layerId: conformal.layerId, z0: 8, z1: 9 });
});

test('Conformal geometry failure rolls back the model atomically', () => {
  const model = createModel({ shape: 'rect', width: 100, height: 100, thickness: 10 });
  applyOperation(model, {
    type: 'add',
    name: 'Step',
    thickness: 2,
    area: rectMulti(50, 100, -25, 0),
  });
  const before = structuredClone(model);
  const originalUnion = globalThis.polygonClipping.union;
  globalThis.polygonClipping.union = () => {
    throw new Error('forced conformal geometry failure');
  };
  try {
    const result = applyOperation(model, {
      type: 'add',
      name: 'Must roll back',
      thickness: 1,
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(result.changed, false);
    assert.match(result.error, /Conformal geometry failed safely/);
    assert.deepEqual(model, before);
  } finally {
    globalThis.polygonClipping.union = originalUnion;
  }
});

test('Conformal Grow only starts from exposed target, and ROI clips render geometry only', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const seed = applyOperation(model, { type: 'add', thickness: 2, area: rectMulti(4, 4) });
  applyOperation(model, {
    type: 'grow',
    targetLayerId: seed.layerId,
    thickness: 1,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.deepEqual(
    stackAt(model, 2 + conformalCarrierXYScale(model) / 2).find((s) => s.layerId === seed.layerId),
    { layerId: seed.layerId, z0: 5, z1: 8, role: 'conformal-sidewall' },
  );
  assert.equal(stackAt(model, 5).length, 1);
  const before = structuredClone(model);
  assert.ok(extrusionGroups(model, rectMulti(2, 2)).length);
  assert.deepEqual(model, before);
  applyOperation(model, { type: 'add', thickness: 1, area: model.boundary });
  const buried = structuredClone(model);
  assert.equal(
    applyOperation(model, {
      type: 'grow',
      targetLayerId: seed.layerId,
      thickness: 1,
      area: model.boundary,
      growth: 'conformal',
    }).changed,
    false,
  );
  assert.deepEqual(model, buried);
});

test('3D groups retain distinct Z intervals below the old eight-decimal grouping threshold', () => {
  const model = createModel({ shape: 'rect', width: 2, height: 2, thickness: 10 });
  model.regions = [
    { geom: rectMulti(1, 2, -0.5, 0), stack: [{ layerId: 'base', z0: -5, z1: 5.000000001 }] },
    { geom: rectMulti(1, 2, 0.5, 0), stack: [{ layerId: 'base', z0: -5, z1: 5.000000002 }] },
  ];
  const groups = extrusionGroups(model);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((s) => s.z1),
    [5.000000001, 5.000000002],
  );
});

test('through-trench void remains empty: current Conformal needs an adjacent material stack', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(model, { type: 'etch', thickness: 10, area: rectMulti(4, 20) });
  applyOperation(model, { type: 'add', thickness: 1, area: model.boundary, growth: 'conformal' });
  assert.deepEqual(stackAt(model, 1.5), []);
});
