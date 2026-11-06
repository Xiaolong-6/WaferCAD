import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const api = await import('../model.js');
const v = await import('../vector-geometry.js');
const { tileMaterialModel } = await import('../material-model-tiling.js');
const { resolveArrayModel } = await import('../model-array.js');
const { validateProcessModel } = await import('../project-schema.js');

test('dense Al6 owner coverage preserves the full source footprint when tile edges cannot cancel', async () => {
  const { owner, boundary } = JSON.parse(
    gunzipSync(
      await readFile(
        new URL('../../tests/fixtures/transmon-material-dense-owner.json.gz', import.meta.url),
      ),
    ),
  );
  const { unionMaterialTiles } = await import('../material-tile-union.js');
  const { materialOwnerCoverage } = await import('../material-process-partition.js');
  assert.equal(unionMaterialTiles(owner, { gridScale: 10000000 }), null);
  assert.deepEqual(
    materialOwnerCoverage({ boundary, regions: owner.map((geom) => ({ geom })) }),
    boundary,
  );
});

test('a dense Al6 halo repairs only its numerical seam and preserves the source support', async () => {
  const model = JSON.parse(
    gunzipSync(
      await readFile(
        new URL('../../tests/fixtures/transmon-material-dense-halo.json.gz', import.meta.url),
      ),
    ),
  );
  const { repairMaterialHaloPartition } = await import('../material-process-partition.js');
  const { difference, materialGeometryArea } = await import('../material-process-boolean.js');
  assert.throws(() => validateProcessModel(model), /geom overlaps/);
  assert.ok(repairMaterialHaloPartition(model, () => model.boundary));
  validateProcessModel(model);
  let uncovered = model.boundary;
  for (const region of model.regions) uncovered = difference(uncovered, region.geom);
  assert.ok(materialGeometryArea(uncovered) <= 2e-8);
});

for (const file of [
  'transmon-material-support-repair.json.gz',
  'transmon-material-crop-owner.json.gz',
  'transmon-material-repaired-seam.json.gz',
  'transmon-material-residual-support.json.gz',
])
  test(`real Al5 owners preserve support through crop and shared-grid repair: ${file}`, async () => {
    const fixture = JSON.parse(
      gunzipSync(await readFile(new URL(`../../tests/fixtures/${file}`, import.meta.url))),
    );
    const model = fixture.context;
    const { unionGeometries, difference, materialGeometryArea } =
      await import('../material-process-boolean.js');
    const before = unionGeometries(model.regions.map((r) => r.geom));
    const result = api.applyOperation(model, fixture.params);
    assert.ok(result.changed, result.error);
    validateProcessModel(model);
    const after = unionGeometries(model.regions.map((r) => r.geom));
    const tolerance = Math.max(2e-8, model.width * model.height * 1e-15);
    assert.ok(materialGeometryArea(difference(before, after)) <= tolerance);
    assert.ok(materialGeometryArea(difference(after, before)) <= tolerance);
    assert.ok(model.regions.some((r) => r.stack.some((s) => s.layerId === result.layerId)));
    const { cropContext } = await import('../model-array-context.js');
    const { partitionMaterialProcess } = await import('../material-process-partition.js');
    const { intersection } = await import('../material-process-boolean.js');
    const leaf = cropContext(model, fixture.ownerBoundary, { intersect: intersection });
    leaf.regions = partitionMaterialProcess(
      leaf,
      fixture.ownerCoverage ?? intersection(before, fixture.ownerBoundary),
    );
    validateProcessModel(leaf);
    const savedCoverage = unionGeometries(leaf.regions.map((r) => r.geom));
    assert.ok(materialGeometryArea(difference(fixture.ownerBoundary, savedCoverage)) <= tolerance);
    assert.ok(materialGeometryArea(difference(savedCoverage, fixture.ownerBoundary)) <= tolerance);
  });

test('an Al4 hole ambiguity uses finer arithmetic and preserves the physical difference', async () => {
  const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL(
          '../../tests/fixtures/transmon-material-refined-hole-input.json.gz',
          import.meta.url,
        ),
      ),
    ),
  );
  const { difference, materialGeometryArea } = await import('../material-process-boolean.js');
  const result = difference(fixture.subject, fixture.clip);
  const reference = v.difference(fixture.subject, fixture.clip);
  assert.ok(Math.abs(materialGeometryArea(result) - materialGeometryArea(reference)) < 1e-9);
  const model = api.createModel({ shape: 'rect', width: 130, height: 130, thickness: 1 });
  model.regions[0].geom = result;
  validateProcessModel(model);
  assert.ok(materialGeometryArea(result) > 7);
});

test('real chip2 touching winding contours normalize without changing exact signed area', async () => {
  const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL('../../tests/fixtures/transmon-material-winding-input.json.gz', import.meta.url),
      ),
    ),
  );
  const { difference } = await import('../material-process-boolean.js');
  const geometry = difference(fixture.subject, fixture.clip);
  const area2 = geometry.reduce(
    (total, polygon) =>
      total +
      polygon.reduce(
        (sum, ring) =>
          sum +
          ring.slice(1).reduce((n, b, i) => {
            const a = ring[i],
              integer = (p) => p.map((x) => BigInt(Math.round(x * 10000000)));
            const [ax, ay] = integer(a),
              [bx, by] = integer(b);
            return n + ax * by - bx * ay;
          }, 0n),
        0n,
      ),
    0n,
  );
  assert.equal(area2, 136160611203993000n);
  const model = api.createModel({ shape: 'rect', width: 150, height: 100, thickness: 1 });
  model.regions[0].geom = geometry;
  validateProcessModel(model);
});

test('a real chip2 halo keeps exact material sets while sharing collinear source nodes', async () => {
  const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL('../../tests/fixtures/transmon-material-halo-context.json.gz', import.meta.url),
      ),
    ),
  );
  const { synchronizeMaterialPartition } = await import('../material-process-noding.js');
  const { difference, materialGeometryArea } = await import('../material-process-boolean.js');
  const model = fixture.model,
    before = structuredClone(model.regions);
  assert.throws(() => validateProcessModel(model), /overlaps/);
  model.regions = synchronizeMaterialPartition(model.regions);
  validateProcessModel(model);
  for (const region of before) {
    const after = model.regions.find((r) => r.id === region.id);
    const geometry = after?.geom || [];
    assert.equal(materialGeometryArea(difference(region.geom, geometry)), 0);
    assert.equal(materialGeometryArea(difference(geometry, region.geom)), 0);
    if (after) assert.deepEqual(after.stack, region.stack);
  }
  const { applyArrayOperation } = await import('../model-array-process.js');
  const source = fixture.sourceArray;
  validateProcessModel(source);
  let contexts = 0;
  const result = applyArrayOperation(
    source,
    {
      type: 'add',
      growth: 'direct',
      face: 'front',
      thickness: 0.03,
      area: source.boundary,
      incidence: {
        materialGeometry: true,
        sidewalls: true,
        tiltDeg: 45,
        azimuthDeg: 135,
        heightStepUm: 0.05,
      },
    },
    (context) => {
      validateProcessModel(context);
      contexts++;
      return { changed: false, error: 'No exposed surface in context-only regression.' };
    },
  );
  assert.equal(result.changed, false);
  assert.ok(contexts >= source.array.instances.length);
});

test('native material tiling is an exact partition and shares repeated physical cells', () => {
  const m = api.createModel({ shape: 'rect', width: 24, height: 8, thickness: 2 });
  const holes = [];
  for (let x = -10; x < 12; x += 4)
    for (const y of [-2, 2]) holes.push(...v.rectMulti(0.8, 0.8, x, y));
  api.applyOperation(m, { type: 'etch', thickness: 0.25, area: holes });
  const before = structuredClone(m),
    tiled = tileMaterialModel(m, { cellSizeUm: 4 });
  assert.deepEqual(m, before);
  assert.equal(tiled.array.instances.length, 12);
  assert.equal(tiled.array.templates.length, 1);
  validateProcessModel(tiled);
  const restored = resolveArrayModel(tiled);
  for (const r of m.regions) {
    const same = restored.regions
      .filter((q) => JSON.stringify(q.stack) === JSON.stringify(r.stack))
      .map((q) => q.geom);
    const combined = v.unionGeometries(same);
    assert.equal(api.geometryArea(v.difference(r.geom, combined)), 0);
    assert.equal(api.geometryArea(v.difference(combined, r.geom)), 0);
  }
});

test('a raised neighbor shadows material across a tile edge without creating a wafer wall', () => {
  const source = api.createModel({ shape: 'rect', width: 8, height: 4, thickness: 2 });
  api.applyOperation(source, {
    type: 'add',
    name: 'Pad',
    thickness: 0.5,
    area: v.rectMulti(2, 4, 1, 0),
  });
  const flat = structuredClone(source),
    tiled = tileMaterialModel(source, { cellSizeUm: 4 });
  assert.equal(tiled.array.instances.length, 2);
  const dose = (m) =>
    api.applyOperation(m, {
      type: 'add',
      growth: 'direct',
      name: 'Al',
      thickness: 0.04,
      face: 'front',
      area: m.boundary,
      incidence: {
        tiltDeg: 45,
        azimuthDeg: 0,
        materialGeometry: true,
        sidewalls: true,
        heightStepUm: 0.05,
      },
    });
  const normal = dose(flat),
    array = dose(tiled);
  assert.ok(normal.changed, normal.error);
  assert.ok(array.changed, array.error);
  validateProcessModel(tiled);
  const resolved = resolveArrayModel(tiled);
  const footprint = (m, id) =>
    v.unionGeometries(
      m.regions.filter((r) => r.stack.some((s) => s.layerId === id)).map((r) => r.geom),
    );
  const a = footprint(flat, normal.layerId),
    b = footprint(resolved, array.layerId);
  assert.equal(api.geometryArea(v.difference(a, b)), 0);
  assert.equal(api.geometryArea(v.difference(b, a)), 0);
  assert.equal(v.pointInMulti([-0.25, 0], b), false);
  assert.equal(v.pointInMulti([-0.75, 0], b), true);
  const volume = (m, id) =>
    m.regions.reduce(
      (n, r) =>
        n +
        api.geometryArea(r.geom) *
          r.stack.filter((s) => s.layerId === id).reduce((z, s) => z + s.z1 - s.z0, 0),
      0,
    );
  assert.ok(Math.abs(volume(flat, normal.layerId) - volume(resolved, array.layerId)) < 1e-10);
});

test('successive diagonal beams keep cropped tile owners disjoint at an oblique material edge', () => {
  const source = api.createModel({ shape: 'rect', width: 16, height: 8, thickness: 2 });
  const pad = [
    [
      [
        [-5.1234, -1.2345],
        [3.4567, -0.6543],
        [4.321, 1.5432],
        [-4.2591, 0.963],
        [-5.1234, -1.2345],
      ],
    ],
  ];
  api.applyOperation(source, { type: 'add', name: 'Nb', thickness: 0.25, area: pad });
  const model = tileMaterialModel(source, { cellSizeUm: 4 });
  assert.equal(model.array.instances.length, 8);
  for (const [name, thickness, phi] of [
    ['Al1', 0.04, -45],
    ['Al2', 0.03, 45],
    ['Al3', 0.03, -135],
  ]) {
    const outcome = api.applyOperation(model, {
      type: 'add',
      growth: 'direct',
      name,
      thickness,
      face: 'front',
      area: model.boundary,
      incidence: {
        materialGeometry: true,
        sidewalls: true,
        tiltDeg: 45,
        azimuthDeg: phi,
        heightStepUm: 0.05,
      },
    });
    assert.ok(outcome.changed, outcome.error);
    validateProcessModel(model);
  }
});
