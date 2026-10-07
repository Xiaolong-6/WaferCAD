import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { ARRAY_MODEL_KERNEL, isArrayModel, resolveArrayModel, translateGeometry } =
  await import('../model-array.js');
const { validateProcessModel, migrateProjectFile } = await import('../project-schema.js');
const { serializeProject, readProjectFile } = await import('../project-io.js');
function twoSites() {
  const leaf = createModel({ shape: 'rect', width: 10, height: 10, thickness: 2 });
  return {
    ...leaf,
    kernel: ARRAY_MODEL_KERNEL,
    width: 20,
    boundary: rectMulti(20, 10),
    regions: [],
    array: {
      version: 1,
      templates: [{ id: 'cell', model: leaf }],
      instances: [
        { id: 'left', templateId: 'cell', x: -5, y: 0 },
        { id: 'right', templateId: 'cell', x: 5, y: 0 },
      ],
    },
  };
}
test('canonical arrays retain instances and expand only the queried physical area', () => {
  const model = twoSites();
  validateProcessModel(model);
  const local = resolveArrayModel(model, { minX: 1, maxX: 8, minY: -2, maxY: 2 });
  assert.equal(local.regions.length, 1);
  assert.equal(pointInMulti([5, 0], local.regions[0].geom), true);
  assert.deepEqual(model.array.templates[0].model.boundary, rectMulti(10, 10));
  const all = resolveArrayModel(model);
  assert.equal(all.regions.length, 2);
  assert.deepEqual(
    all.regions[0].geom,
    translateGeometry(model.array.templates[0].model.regions[0].geom, -5, 0),
  );
  assert.throws(
    () => resolveArrayModel(model, null, { maxPoints: 9 }),
    /bounded geometry point budget/,
  );
});
test('array schema rejects invalid templates, ownership overlaps, outside domains and nested arrays', () => {
  const source = twoSites();
  for (const mutate of [
    (m) => (m.array.instances[0].templateId = 'missing'),
    (m) => (m.array.instances[1].x = -5),
    (m) => (m.array.instances[1].x = 50),
    (m) => (m.array.instances[1].x = NaN),
    (m) => (m.array.templates[0].model = twoSites()),
    (m) => (m.array.instances[1].id = 'left'),
    (m) => (m.array.templates[0].model.regions[0].stack[0].z1 = -2),
  ]) {
    const bad = structuredClone(source);
    mutate(bad);
    assert.throws(() => validateProcessModel(bad), /Invalid project/);
  }
});
test('normal project IO preserves canonical array definitions without eager expansion', async () => {
  const model = twoSites(),
    p = migrateProjectFile(projectForBenchmark({ model, section: { a: [-9, 0], b: [9, 0] } }));
  const text = serializeProject(p),
    loaded = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  assert.deepEqual(loaded, p);
  assert.equal(loaded.model.regions.length, 0);
  assert.equal(loaded.model.array.templates[0].model.regions.length, 1);
});

const modelApi = await import('../model.js');
const { applyOperation, cloneModel } = modelApi;
const { applyArrayOperation } = await import('../model-array-process.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const vector = await import('../vector-geometry.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');
function physicalAt(m, point) {
  return m.regions
    .filter((r) => pointInMulti(point, r.geom))
    .flatMap((r) => r.stack.map((s) => [s.layerId, s.z0, s.z1, s.role || null]));
}
test('array Apply uses copy on write, shared global IDs and atomic failure', () => {
  const source = twoSites(),
    before = cloneModel(source);
  const result = applyOperation(source, {
    type: 'add',
    name: 'Local film',
    thickness: 0.01,
    area: rectMulti(4, 4, -5, 0),
  });
  assert.equal(result.changed, true);
  validateProcessModel(source);
  const resolved = resolveArrayModel(source);
  assert.equal(physicalAt(resolved, [-5, 0]).length, 2);
  assert.equal(physicalAt(resolved, [5, 0]).length, 1);
  assert.deepEqual(before.array.templates[0].model.regions[0].stack, [
    { layerId: 'base', z0: -1, z1: 1 },
  ]);
  const saved = cloneModel(source);
  assert.throws(() =>
    applyArrayOperation(
      source,
      { type: 'add', growth: 'conformal', thickness: 0.1, area: source.boundary },
      () => {
        throw new Error('reject');
      },
    ),
  );
  assert.deepEqual(source, saved);
});
test('conformal crosses instance seams with the same physical result as the ordinary kernel', () => {
  const array = twoSites(),
    normal = resolveArrayModel(array);
  const island = { type: 'add', name: 'Step across seam', thickness: 0.5, area: rectMulti(4, 6) };
  assert.equal(applyOperation(array, island).changed, true);
  assert.equal(applyOperation(normal, island).changed, true);
  const film = {
    type: 'add',
    name: 'Conformal',
    growth: 'conformal',
    thickness: 0.1,
    area: normal.boundary,
  };
  assert.equal(applyOperation(array, film).changed, true);
  assert.equal(applyOperation(normal, film).changed, true);
  validateProcessModel(array);
  const resolved = resolveArrayModel(array);
  for (const x of [-8, -2.2, -2.05, -1, 0.25, 1, 2.05, 2.2, 8])
    for (const y of [-4, -3.05, -2, 0, 2, 3.05, 4])
      assert.deepEqual(physicalAt(resolved, [x, y]), physicalAt(normal, [x, y]), `${x},${y}`);
});
test('array rendering removes instance seams and preserves actual exterior walls', () => {
  const array = twoSites();
  const plan = buildRenderSurfacePlan(array);
  const walls = plan.sidewalls.flatMap((group) =>
    (group.parts || [group]).flatMap((w) =>
      (group.instanceTranslations || [[0, 0]]).map(([x, y]) => ({
        ...w,
        p: [w.p[0] + x, w.p[1] + y],
        q: [w.q[0] + x, w.q[1] + y],
      })),
    ),
  );
  assert.equal(walls.filter((w) => w.p[0] === 0 && w.q[0] === 0).length, 0);
  const area = walls.reduce(
    (sum, w) => sum + Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]) * (w.z1 - w.z0),
    0,
  );
  assert.equal(area, 120);
});
test('array transfer uses one global plane across different site heights', () => {
  const m = twoSites();
  applyOperation(m, {
    type: 'add',
    name: 'Tall left',
    thickness: 2,
    area: rectMulti(10, 10, -5, 0),
  });
  const result = applyArrayOperation(
    m,
    { type: 'add', growth: 'transfer', name: 'Wafer laminate', thickness: 0.1, area: m.boundary },
    (leaf, params) => applyAdvancedProcessOperation(leaf, params, params.area, modelApi, vector),
  );
  assert.equal(result.changed, true);
  validateProcessModel(m);
  const resolved = resolveArrayModel(m);
  for (const x of [-5, 5])
    assert.deepEqual(physicalAt(resolved, [x, 0]).at(-1).slice(1, 3), [3, 3.1]);
});

const { sectionColumns } = await import('../model-view-geometry.js');
const { roughProfileOffsetAtPoint } = await import('../surface-rendering.js');
const { prepareProjectForWorkspaceStorage, expandProjectStorage } =
  await import('../project-io.js');
test('array profiles retain their physical local frame in Section and resolved geometry', () => {
  const m = twoSites();
  const surface = {
    kind: 'rough',
    meanHeight: 0.1,
    featureSize: 1,
    featureCv: 0,
    heightCv: 0,
    morphology: 'pyramid',
    polarity: 'normal',
    seed: 7,
  };
  applyOperation(m, { type: 'etch', thickness: 0.2, surface, area: m.boundary });
  validateProcessModel(m);
  const columns = sectionColumns(m, [-9, 0], [9, 0]);
  const local = m.array.templates[0].model.regions[0].stack[0].frontSurface;
  const world = columns.find((c) => c.t0 < 0.2 && c.t1 > 0.2).stack[0].frontSurface;
  assert.equal(
    roughProfileOffsetAtPoint(-5.5, 0.125, world),
    roughProfileOffsetAtPoint(-0.5, 0.125, local),
  );
  const resolved = resolveArrayModel(m);
  validateProcessModel(resolved);
  assert.equal(
    roughProfileOffsetAtPoint(-5.5, 0.125, resolved.regions[0].stack[0].frontSurface),
    roughProfileOffsetAtPoint(-0.5, 0.125, local),
  );
});
test('lossless workspace arrays share template dictionaries and reject invalid v4 references', () => {
  const m = twoSites();
  for (const i of m.array.instances) i.x += 0.000001;
  m.boundary = translateGeometry(m.boundary, 0.000001, 0);
  const p = projectForBenchmark({ model: m, section: { a: [-9, 0], b: [9, 0] } });
  const stored = prepareProjectForWorkspaceStorage(p);
  assert.equal(stored.storage.encoding, 'shared-assets-v4');
  assert.deepEqual(expandProjectStorage(structuredClone(stored)), p);
  const bad = structuredClone(stored);
  bad.model.array.instancesRef = 99999;
  assert.throws(() => expandProjectStorage(bad), /array instance dictionary reference/);
  const recursive = structuredClone(stored);
  recursive.model.array.templates[0].modelRef = 'project';
  assert.throws(() => validateProcessModel(expandProjectStorage(recursive).model), /non-nested/);
});
test('strict array ownership rejects missing cells and revalidates mutated geometry in the next call', () => {
  const m = twoSites();
  m.array.instances.pop();
  assert.throws(() => validateProcessModel(m), /complete physical model domain/);
  const source = twoSites();
  validateProcessModel(source);
  source.array.instances[1].x = 5.001;
  assert.throws(() => validateProcessModel(source), /outside/);
});

test('array back-face Conformal, planarize, isotropic and undercut match ordinary physical working sets', () => {
  const apply = (m, params) =>
    isArrayModel(m)
      ? applyArrayOperation(
          m,
          params,
          (leaf, p) =>
            applyAdvancedProcessOperation(leaf, p, p.area, modelApi, vector) ??
            applyOperation(leaf, p),
        )
      : (applyAdvancedProcessOperation(m, params, params.area, modelApi, vector) ??
        applyOperation(m, params));
  for (const scenario of ['back-conformal', 'planarize', 'isotropic', 'undercut']) {
    const array = twoSites(),
      normal = resolveArrayModel(array);
    const seed = {
      type: 'add',
      name: 'Seed',
      face: scenario === 'back-conformal' ? 'back' : 'front',
      thickness: 0.5,
      area: rectMulti(6, 6),
    };
    assert.equal(apply(array, seed).changed, true);
    assert.equal(apply(normal, seed).changed, true);
    const seedId = normal.layers.at(-1).id;
    const params =
      scenario === 'back-conformal'
        ? {
            type: 'add',
            name: 'Back film',
            face: 'back',
            growth: 'conformal',
            thickness: 0.1,
            area: normal.boundary,
          }
        : scenario === 'planarize'
          ? {
              type: 'etch',
              etchProfile: 'planarize',
              targetZ: 1.2,
              thickness: 1.2,
              area: normal.boundary,
            }
          : {
              type: 'etch',
              etchProfile: scenario,
              etchTargetLayerIds: [seedId],
              thickness: 0.1,
              area: rectMulti(2, 8, 2.5, 0),
            };
    const a = apply(array, params),
      b = apply(normal, params);
    assert.equal(a.changed, b.changed, scenario);
    assert.equal(a.changed, true, scenario + ': ' + a.error);
    validateProcessModel(array);
    const resolved = resolveArrayModel(array);
    for (const x of [-8, -3.2, -2.8, -1, 0.2, 1.6, 2.4, 2.8, 3.2, 8])
      for (const y of [-4, -2.5, 0.25, 2.5, 4])
        assert.deepEqual(
          physicalAt(resolved, [x, y]),
          physicalAt(normal, [x, y]),
          `${scenario} at ${x},${y}`,
        );
  }
});
test('array implant and electrical annotations preserve local host depths and global identities', () => {
  const array = twoSites(),
    normal = resolveArrayModel(array);
  for (const type of ['implant', 'electrical']) {
    const params = {
      type,
      name: type,
      thickness: 0.2,
      tilt: 15,
      area: rectMulti(12, 6),
      electricalRegionType: 'n-type',
      electricalRegionSource: 'doped',
    };
    assert.equal(applyOperation(array, params).changed, true);
    assert.equal(applyOperation(normal, params).changed, true);
    validateProcessModel(array);
    const resolved = resolveArrayModel(array),
      key = type === 'implant' ? 'implants' : 'electricalRegions';
    assert.equal(resolved[key].length, 1);
    assert.equal(resolved[key][0].id, normal[key][0].id);
    for (const point of [
      [-4, 1],
      [4, 1],
      [-8, 1],
      [8, 1],
    ]) {
      const at = (m) =>
        m[key][0].patches.filter((p) => pointInMulti(point, p.geom)).map(({ geom, ...p }) => p);
      assert.deepEqual(at(resolved), at(normal), `${type} at ${point}`);
    }
  }
});
test('a changed neighboring site rebuilds its own seam context while unchanged repeat sites still share', () => {
  const m = twoSites();
  applyOperation(m, { type: 'add', name: 'Left', thickness: 0.5, area: rectMulti(2, 4, -0.5, 0) });
  const normal = resolveArrayModel(m);
  const params = {
    type: 'add',
    name: 'Coat',
    growth: 'conformal',
    thickness: 0.1,
    area: m.boundary,
  };
  assert.equal(applyOperation(m, params).changed, true);
  assert.equal(applyOperation(normal, params).changed, true);
  const resolved = resolveArrayModel(m);
  for (const x of [-1.55, -1, 0.1, 0.55, 5])
    assert.deepEqual(physicalAt(resolved, [x, 0.1]), physicalAt(normal, [x, 0.1]));
});
