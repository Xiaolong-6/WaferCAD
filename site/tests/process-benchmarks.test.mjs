import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isotropicReleaseBenchmark,
  loadGeometryKernel,
  processBenchmark,
  projectForBenchmark,
} from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, baseCoverageState, createModel, surfaceZ } = await import('../model.js');
const { circleMulti, difference, pointInMulti, rectMulti, intersection, isEmpty, unionGeometries } =
  await import('../vector-geometry.js');
const { electricalRegionSolids, extrusionGroups, sectionSlices } =
  await import('../model-view-geometry.js');
const { prepareProjectForStorage } = await import('../project-io.js');
const { migrateProjectFile } = await import('../project-schema.js');

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
      const lateral = 1;
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

test('Electrical Region follows current material and is clipped by later Etch', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const marked = applyOperation(model, {
    type: 'electrical',
    name: 'Al2O3-induced p inversion',
    thickness: 2,
    face: 'front',
    area: rectMulti(8, 8),
    electricalRegionType: 'p-inversion',
    electricalRegionSource: 'induced',
  });
  assert.equal(marked.changed, true);
  assert.ok(marked.electricalRegionId);
  assert.equal(model.electricalRegions.length, 1);

  let solids = electricalRegionSolids(model);
  assert.equal(solids.length, 1);
  assert.equal(solids[0].outerZ, 5);
  assert.equal(solids[0].innerZ, 3);
  assert.equal(solids[0].regionType, 'p-inversion');
  assert.equal(solids[0].source, 'induced');
  assert.equal(solids[0].hostLayerId, 'base');

  const cap = applyOperation(model, {
    type: 'add',
    name: 'Passivation',
    thickness: 0.5,
    face: 'front',
    area: model.boundary,
  });
  solids = electricalRegionSolids(model);
  assert.equal(solids.length, 1);
  assert.equal(solids[0].hostLayerId, 'base');
  assert.equal(solids[0].outerZ, 5);
  assert.equal(solids[0].surfaceExposed, false);
  applyOperation(model, {
    type: 'etch',
    thickness: 1,
    face: 'front',
    area: model.boundary,
    etchTargetLayerIds: [cap.layerId],
  });

  applyOperation(model, {
    type: 'etch',
    thickness: 1,
    face: 'front',
    area: rectMulti(4, 4),
  });
  solids = electricalRegionSolids(model);
  assert.ok(solids.some((solid) => solid.outerZ === 4 && solid.innerZ === 3));
  assert.ok(solids.some((solid) => solid.outerZ === 5 && solid.innerZ === 3));

  applyOperation(model, {
    type: 'etch',
    thickness: 3,
    face: 'front',
    area: rectMulti(4, 4),
  });
  solids = electricalRegionSolids(model);
  assert.equal(
    solids.some((solid) => pointInMulti([0, 0], solid.polys)),
    false,
  );
});

test('literature-scale isotropic release produces a suspended silica microdisk in Section and 3D', async () => {
  const benchmark = await isotropicReleaseBenchmark(),
    { model, oxideLayerId, section, probes } = benchmark,
    ringStack = stackAt(model, probes.ring[0], probes.ring[1]),
    hubStack = stackAt(model, probes.hub[0], probes.hub[1]),
    exposedStack = stackAt(model, probes.exposed[0], probes.exposed[1]),
    ringOxide = ringStack.find((segment) => segment.layerId === oxideLayerId),
    ringSi = ringStack.find((segment) => segment.layerId === 'base'),
    hubOxide = hubStack.find((segment) => segment.layerId === oxideLayerId),
    hubSi = hubStack.find((segment) => segment.layerId === 'base'),
    exposedSi = exposedStack.find((segment) => segment.layerId === 'base');

  assert.ok(ringOxide && ringSi, 'suspended ring must retain both oxide and lower silicon');
  assert.ok(ringOxide.z0 - ringSi.z1 > 10, 'released ring must contain a true air gap');
  assert.ok(hubOxide && hubSi, 'central support must retain oxide on silicon');
  assert.ok(
    Math.abs(hubOxide.z0 - hubSi.z1) < 1e-9,
    'central support must remain mechanically attached to its silicon pedestal',
  );
  assert.ok(exposedSi && exposedSi.z1 < 10, 'open silicon must be etched deeply by the release');

  const overlapTolerance = Math.max(1e-18, model.width * model.height * 1e-15);
  for (let i = 0; i < model.regions.length; i++) {
    for (let j = i + 1; j < model.regions.length; j++) {
      const overlapArea = area(intersection(model.regions[i].geom, model.regions[j].geom));
      assert.ok(
        overlapArea <= overlapTolerance,
        `release overlap ${i}/${j} = ${overlapArea} µm² exceeds ${overlapTolerance}`,
      );
    }
  }

  const slices = sectionSlices(model, section.a, section.b),
    extrusions = extrusionGroups(model),
    intervalsAt = (x) => {
      const t = (x - section.a[0]) / (section.b[0] - section.a[0]);
      return {
        section: slices
          .filter((slice) => t > slice.t0 + 1e-9 && t < slice.t1 - 1e-9)
          .map((slice) => [slice.layerId, slice.z0, slice.z1])
          .sort(),
        three: extrusions
          .filter((solid) => pointInMulti([x, 0], solid.polys))
          .map((solid) => [solid.layerId, solid.z0, solid.z1])
          .sort(),
      };
    };

  const ringIntervals = intervalsAt(probes.ring[0]),
    hubIntervals = intervalsAt(probes.hub[0]);
  assert.deepEqual(ringIntervals.section, ringIntervals.three);
  assert.deepEqual(hubIntervals.section, hubIntervals.three);
  assert.ok(
    ringIntervals.three.some(([layerId]) => layerId === oxideLayerId) &&
      ringIntervals.three.some(([layerId]) => layerId === 'base'),
    '3D must contain the suspended oxide and the lower silicon as separate solids',
  );
  assert.ok(
    hubIntervals.three.some(([layerId, z0, z1]) => layerId === 'base' && z1 >= 40 - 1e-9),
    '3D must keep the central silicon support at the oxide interface',
  );
});

test('released microdisk remains valid through project migration and storage packing', async () => {
  const benchmark = await isotropicReleaseBenchmark(),
    project = migrateProjectFile(projectForBenchmark(benchmark)),
    stored = prepareProjectForStorage(project);
  assert.equal(stored.version, project.version);
  assert.ok(stored.model.regions.length > 0);
  assert.ok(
    stored.model.regions.some((region) => {
      const oxide = region.stack.find((segment) => segment.layerId === benchmark.oxideLayerId),
        silicon = region.stack.find((segment) => segment.layerId === 'base');
      return oxide && silicon && oxide.z0 - silicon.z1 > 10;
    }),
    'packed project must retain the physical release cavity',
  );
});

test('material-selective Etch removes an exposed target and stops on the next material', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const ald = applyOperation(model, {
    type: 'add',
    name: 'Al2O3',
    thickness: 1,
    area: model.boundary,
  });
  const metal = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 2,
    area: model.boundary,
  });
  const aldVolume = volume(model, ald.layerId);

  const etched = applyOperation(model, {
    type: 'etch',
    thickness: 5,
    area: model.boundary,
    etchTargetLayerIds: [metal.layerId],
  });
  assert.equal(etched.changed, true);
  assert.equal(
    stackAt(model, 0).some((segment) => segment.layerId === metal.layerId),
    false,
  );
  assert.ok(stackAt(model, 0).some((segment) => segment.layerId === ald.layerId));
  assert.equal(surfaceZ(stackAt(model, 0)), 6);
  assert.ok(Math.abs(volume(model, ald.layerId) - aldVolume) < 1e-9);

  const covered = applyOperation(model, {
    type: 'add',
    name: 'Cap',
    thickness: 1,
    area: model.boundary,
  });
  const before = structuredClone(model);
  const blocked = applyOperation(model, {
    type: 'etch',
    thickness: 1,
    area: model.boundary,
    etchTargetLayerIds: [ald.layerId],
  });
  assert.equal(blocked.changed, false);
  assert.match(blocked.error, /selected etch materials are exposed/);
  assert.deepEqual(model, before);
  assert.ok(covered.layerId);
});

test('Conformal sidewall offsets outward by the requested distance after Direct growth', () => {
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
  const sidewall = stackAt(model, 0.5).find((s) => s.layerId === coat.layerId);
  assert.deepEqual(
    { layerId: sidewall.layerId, z0: sidewall.z0, z1: sidewall.z1, role: sidewall.role },
    { layerId: coat.layerId, z0: 5, z1: 8, role: 'conformal-sidewall' },
  );
  assert.deepEqual(
    stackAt(model, 2).find((s) => s.layerId === coat.layerId),
    { layerId: coat.layerId, z0: 5, z1: 6 },
  );
});

test('partial-area Conformal keeps the process-mask edge hard-clipped', () => {
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
    stackAt(model, 1.5).find((s) => s.layerId === coat.layerId),
    { layerId: coat.layerId, z0: 5, z1: 6 },
  );
  assert.equal(
    stackAt(model, 2.5).find((s) => s.layerId === coat.layerId),
    undefined,
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
  assert.deepEqual(layerAt(4999.5), {
    layerId: coat.layerId,
    z0: 4,
    z1: 7,
    role: 'conformal-sidewall',
  });
  assert.deepEqual(layerAt(0), { layerId: coat.layerId, z0: 4, z1: 5 });
  assert.deepEqual(layerAt(5001), { layerId: coat.layerId, z0: 6, z1: 7 });
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
  const sideX = 4999.5;
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
  assert.deepEqual(at(5001, conformal.layerId), {
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
  assert.deepEqual(at(1749.5), {
    layerId: conformal.layerId,
    z0: 6,
    z1: 9,
    role: 'conformal-sidewall',
  });
  assert.deepEqual(at(0), { layerId: conformal.layerId, z0: 6, z1: 7 });
  assert.deepEqual(at(1751), { layerId: conformal.layerId, z0: 8, z1: 9 });
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

test('Conformal Extend reuses the Deposit coating kernel and still requires an exposed target', () => {
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
    stackAt(model, 2.5).find((s) => s.layerId === seed.layerId),
    { layerId: seed.layerId, z0: 5, z1: 8, role: 'conformal-sidewall' },
  );
  assert.deepEqual(
    stackAt(model, 5).find((s) => s.layerId === seed.layerId),
    { layerId: seed.layerId, z0: 5, z1: 6 },
  );
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

for (const face of ['front', 'back']) {
  test(`Conformal Extend coats exposed surfaces and sidewalls on the ${face} face`, () => {
    const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
    const seed = applyOperation(model, {
      type: 'add',
      name: 'Extend seed',
      thickness: 2,
      face,
      area: rectMulti(4, 4),
      growth: 'direct',
    });
    const result = applyOperation(model, {
      type: 'grow',
      targetLayerId: seed.layerId,
      thickness: 1,
      face,
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(result.changed, true);
    const side = stackAt(model, 2.5).find((segment) => segment.layerId === seed.layerId),
      far = stackAt(model, 5).find((segment) => segment.layerId === seed.layerId);
    if (face === 'front') {
      assert.deepEqual(side, {
        layerId: seed.layerId,
        z0: 5,
        z1: 8,
        role: 'conformal-sidewall',
      });
      assert.deepEqual(far, { layerId: seed.layerId, z0: 5, z1: 6 });
    } else {
      assert.deepEqual(side, {
        layerId: seed.layerId,
        z0: -8,
        z1: -5,
        role: 'conformal-sidewall',
      });
      assert.deepEqual(far, { layerId: seed.layerId, z0: -6, z1: -5 });
    }
  });
}

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

for (const face of ['front', 'back']) {
  test(`through-trench void receives Conformal sidewall material on the ${face} face`, () => {
    const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
    applyOperation(model, { type: 'etch', thickness: 10, area: rectMulti(4, 20) });
    const coat = applyOperation(model, {
      type: 'add',
      name: 'Through-wall coat',
      thickness: 1,
      face,
      area: model.boundary,
      growth: 'conformal',
    });
    assert.equal(coat.changed, true);
    const side = stackAt(model, 1.5).find((segment) => segment.layerId === coat.layerId);
    assert.ok(side);
    assert.equal(side.role, 'conformal-sidewall');
    if (face === 'front') {
      assert.deepEqual([side.z0, side.z1], [-5, 6]);
    } else {
      assert.deepEqual([side.z0, side.z1], [-6, 5]);
    }
    assert.deepEqual(stackAt(model, 0), []);
  });
}

test('sub-grid rough-step seam is healed before Conformal can enter the model interior', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 }),
    gap = 5e-5,
    halfWidth = 10 - gap / 2;
  model.regions = [
    {
      id: 'left-step',
      geom: rectMulti(halfWidth, 20, -5 - gap / 4, 0),
      stack: [{ layerId: 'base', z0: -5, z1: 7 }],
    },
    {
      id: 'right-rough',
      geom: rectMulti(halfWidth, 20, 5 + gap / 4, 0),
      stack: [
        {
          layerId: 'base',
          z0: -5,
          z1: 4,
          frontSurface: {
            kind: 'rough',
            morphology: 'stochastic',
            polarity: 'inverted',
            featureSize: 0.5,
            meanHeight: 0.3,
            featureCv: 0.1,
            heightCv: 0.1,
            seed: 7,
            profileId: 'rough-step-seam-regression',
            geometryMode: 'ideal',
            etchDepth: 1,
          },
        },
      ],
    },
  ];

  assert.equal(baseCoverageState(model), 'partial');
  const coat = applyOperation(model, {
    type: 'add',
    name: 'Conformal after rough step',
    thickness: 0.5,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);
  assert.equal(baseCoverageState(model), 'full');

  const deepIntrusions = model.regions.flatMap((region) =>
    region.stack.filter(
      (segment) =>
        segment.layerId === coat.layerId &&
        segment.role === 'conformal-sidewall' &&
        segment.z0 <= -5 + 1e-9,
    ),
  );
  assert.equal(deepIntrusions.length, 0);
});

test('rough Etch followed by whole-face Conformal cannot penetrate below the etched floor', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 }),
    roughFloor = 2.5;

  const etched = applyOperation(model, {
    type: 'etch',
    thickness: 1.5,
    face: 'front',
    area: rectMulti(10, 8),
    surface: {
      kind: 'rough',
      featureSize: 0.45,
      meanHeight: 0.6,
      featureCv: 0.3,
      heightCv: 0.35,
      morphology: 'stochastic',
      polarity: 'inverted',
    },
  });
  assert.equal(etched.changed, true);

  const coat = applyOperation(model, {
    type: 'add',
    name: 'Rough conformal guard',
    thickness: 0.8,
    face: 'front',
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);
  assert.equal(baseCoverageState(model), 'full');

  const sidewalls = model.regions.flatMap((region) =>
    region.stack.filter(
      (segment) => segment.layerId === coat.layerId && segment.role === 'conformal-sidewall',
    ),
  );
  assert.ok(sidewalls.length > 0);
  assert.equal(
    sidewalls.every((segment) => segment.z0 >= roughFloor - 1e-9),
    true,
    `Conformal entered below etched floor: ${JSON.stringify(sidewalls)}`,
  );
});

test('Conformal sidewall keeps the inherited rough profile at the exposed cap', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(model, {
    type: 'etch',
    thickness: 1,
    area: model.boundary,
    surface: {
      kind: 'rough',
      featureSize: 0.8,
      meanHeight: 0.4,
      featureCv: 0.15,
      heightCv: 0.1,
      morphology: 'stochastic',
      polarity: 'inverted',
    },
  });
  applyOperation(model, {
    type: 'add',
    name: 'Rough mesa',
    thickness: 2,
    area: rectMulti(4, 20),
    growth: 'direct',
  });
  const coat = applyOperation(model, {
    type: 'add',
    name: 'Rough conformal',
    thickness: 0.5,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);

  const source = stackAt(model, 0).find((segment) => segment.layerId === coat.layerId),
    side = stackAt(model, 2.25).find((segment) => segment.layerId === coat.layerId);
  assert.ok(source?.frontSurface?.profileId);
  assert.equal(side?.role, 'conformal-sidewall');
  assert.equal(side?.frontSurface?.profileId, source.frontSurface.profileId);
});

test('dense nested-ring topography completes whole-face Conformal without internal overlap', () => {
  const model = createModel({ shape: 'circle', width: 100000, height: 100000, thickness: 12 });
  applyOperation(model, {
    type: 'add',
    name: 'Blanket',
    thickness: 2,
    area: model.boundary,
    growth: 'direct',
  });

  const rings = [];
  for (const x of [-30000, -18000, -6000, 6000, 18000, 30000]) {
    for (const y of [-30000, -18000, -6000, 6000, 18000, 30000]) {
      const outer = circleMulti(7000, 7000, 40, x, y),
        inner = circleMulti(3200, 3200, 32, x, y);
      rings.push(difference(outer, inner));
    }
  }
  const patterned = unionGeometries(rings);
  applyOperation(model, {
    type: 'add',
    name: 'Ring mesa',
    thickness: 1.5,
    area: patterned,
    growth: 'direct',
  });

  const coat = applyOperation(model, {
    type: 'add',
    name: 'Conformal ring coat',
    thickness: 0.8,
    area: model.boundary,
    growth: 'conformal',
  });
  assert.equal(coat.changed, true);
  assert.ok(coat.layerId);

  for (let i = 0; i < model.regions.length; i++) {
    const region = model.regions[i];
    for (let j = i + 1; j < model.regions.length; j++) {
      assert.equal(isEmpty(intersection(region.geom, model.regions[j].geom)), true);
    }
    for (let j = 1; j < region.stack.length; j++) {
      assert.ok(region.stack[j].z0 >= region.stack[j - 1].z1 - 1e-9);
    }
  }
});
