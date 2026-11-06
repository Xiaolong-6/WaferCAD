import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';

test('linked-ring containment keeps upstream decisions and skips repeated boundary scans', async () => {
  const upstream = createRequire(import.meta.url)('clipper-lib');
  await import('../material-process-boolean.js');
  const { default: local } = await import('../vendor/clipper-lib.js');
  const linked = (points) => {
    const nodes = points.map(([X, Y]) => ({ Pt: { X, Y } }));
    nodes.forEach((node, i) => {
      node.Next = nodes[(i + 1) % nodes.length];
      node.Prev = nodes[(i + nodes.length - 1) % nodes.length];
    });
    return nodes[0];
  };
  const vertices = [];
  for (const [a, b] of [
    [
      [-1600, -1600],
      [1600, -1600],
    ],
    [
      [1600, -1600],
      [1600, 1600],
    ],
    [
      [1600, 1600],
      [-1600, 1600],
    ],
    [
      [-1600, 1600],
      [-1600, -1600],
    ],
  ])
    for (let j = 0; j < 64; j++)
      vertices.push([
        10000000000 + a[0] + ((b[0] - a[0]) * j) / 64,
        -10000000000 + a[1] + ((b[1] - a[1]) * j) / 64,
      ]);
  const engine = new local.Clipper(),
    reference = new upstream.Clipper();
  let scans = 0;
  const pointTest = engine.PointInPolygon;
  engine.PointInPolygon = function (...args) {
    scans++;
    return pointTest.apply(this, args);
  };
  assert.equal(engine.Poly2ContainsPoly1(linked(vertices), linked(vertices)), true);
  assert.ok(scans <= 3, 'identical rings need at most three full scans before the shared lookup');
  for (let i = 0; i < 200; i++) {
    const other = vertices.map(([x, y]) => [
      x + ((i % 7) - 3) * 800,
      y + ((Math.floor(i / 7) % 7) - 3) * 800,
    ]);
    if (i % 2) other.reverse();
    assert.equal(
      engine.Poly2ContainsPoly1(linked(other), linked(vertices)),
      reference.Poly2ContainsPoly1(linked(other), linked(vertices)),
    );
  }
  const malformed = linked(vertices);
  malformed.Next.Next = malformed.Next;
  assert.throws(() => engine.Poly2ContainsPoly1(linked(vertices), malformed), /Malformed/);
});

test('native full-range integer slopes agree with pinned upstream exact predicates', async () => {
  const upstream = createRequire(import.meta.url)('clipper-lib');
  await import('../material-process-boolean.js');
  const { default: local } = await import('../vendor/clipper-lib.js');
  let seed = 739123;
  const coordinate = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed - 2147483648) * 40000;
  };
  for (let i = 0; i < 2000; i++) {
    const points = Array.from({ length: 4 }, () => ({ X: coordinate(), Y: coordinate() }));
    if (i % 3 === 0)
      points[2] = {
        X: 2 * points[1].X - points[0].X + (i % 2),
        Y: 2 * points[1].Y - points[0].Y,
      };
    const edges = points.slice(0, 2).map((p, j) => ({
      Delta: { X: points[j + 1].X - p.X, Y: points[j + 1].Y - p.Y },
    }));
    for (const [name, args] of [
      ['SlopesEqual3', [...edges, true]],
      ['SlopesEqual4', [...points.slice(0, 3), true]],
      ['SlopesEqual5', [...points, true]],
    ])
      assert.equal(local.ClipperBase[name](...args), upstream.ClipperBase[name](...args));
  }
});
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const api = await import('../model.js');
const v = await import('../vector-geometry.js');
const { applyAdvancedProcessOperation } = await import('../advanced-process-operations.js');
const { validateProcessModel } = await import('../project-schema.js');
const { parseProcessRecipeSource: parseProcessRecipe, serializeProcessRecipe } =
  await import('../process-recipe.js');
const apply = (m, p) =>
  applyAdvancedProcessOperation(m, p, p.area, api, v) ?? api.applyOperation(m, p);
const at = (m, x, y) => m.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack || [];

test('polygon owner broad phase retains every real overlap and the existing grid envelope', async () => {
  const { materialRegionCandidates, intersection, materialGeometryArea } =
    await import('../material-process-boolean.js');
  const regions = Array.from({ length: 80 }, (_, i) => ({
    geom: [
      ...v.rectMulti(2, 2, (i % 10) * 1.25, Math.floor(i / 10) * 1.25),
      ...v.rectMulti(1, 1, 100 + i * 3, 30),
    ],
  }));
  for (const x of [10000, 10001.00015, 10002.0004]) regions.push({ geom: v.rectMulti(1, 1, x, 0) });
  const before = structuredClone(regions),
    query = materialRegionCandidates(regions);
  for (const [i, r] of regions.entries()) {
    const candidates = query(r.geom);
    assert.deepEqual(
      candidates,
      [...candidates].sort((a, b) => a - b),
    );
    for (let j = 0; j < i; j++)
      if (materialGeometryArea(intersection(r.geom, regions[j].geom)) > 0)
        assert.ok(candidates.includes(j), `missing real owner overlap ${i}/${j}`);
  }
  assert.ok(query(regions[80].geom).includes(81));
  assert.ok(!query(regions[81].geom).includes(82));
  assert.deepEqual(regions, before);
});

test('multi-resist lift-off removes supported waste and rejects a device bridge transactionally', () => {
  const make = () => api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
  const m = make();
  const mma = apply(m, { type: 'add', name: 'MMA', thickness: 0.5, area: m.boundary });
  const pmma = apply(m, { type: 'add', name: 'PMMA', thickness: 0.4, area: m.boundary });
  for (const [layerId, depth] of [
    [pmma.layerId, 0.4],
    [mma.layerId, 0.5],
  ])
    assert.ok(
      apply(m, {
        type: 'etch',
        etchProfile: 'develop',
        thickness: depth,
        etchTargetLayerIds: [layerId],
        area: v.rectMulti(2, 2),
      }).changed,
    );
  const al = apply(m, { type: 'add', name: 'Al', thickness: 0.04, area: m.boundary });
  const release = apply(m, {
    type: 'liftoff',
    sacrificialLayerIds: [mma.layerId, pmma.layerId],
    area: m.boundary,
  });
  assert.ok(release.changed, release.error);
  validateProcessModel(m);
  assert.deepEqual(
    at(m, 0, 0).map((s) => s.layerId),
    ['base', al.layerId],
  );
  assert.deepEqual(
    at(m, 3, 0).map((s) => s.layerId),
    ['base'],
  );
  const bad = make();
  apply(bad, { type: 'add', name: 'Nb pad', thickness: 0.5, area: v.rectMulti(4, 8, 2, 0) });
  const resist = apply(bad, {
    type: 'add',
    name: 'MMA',
    thickness: 0.5,
    area: v.rectMulti(4, 8, -2, 0),
  });
  const alLayer = api.createLayer(bad, 'Bridging metal');
  for (const r of bad.regions) r.stack.push({ layerId: alLayer.id, z0: 1.5, z1: 1.54 });
  const before = structuredClone(bad);
  const rejected = apply(bad, {
    type: 'liftoff',
    sacrificialLayerIds: [resist.layerId],
    area: bad.boundary,
  });
  assert.equal(rejected.changed, false);
  assert.match(rejected.error, /bridge/);
  assert.deepEqual(bad, before);
});

test('physical double resist develops buried MMA without etching PMMA or Si', () => {
  const m = api.createModel({ shape: 'rect', width: 10, height: 10, thickness: 2 });
  const mma = apply(m, { type: 'add', name: 'MMA', thickness: 0.5, area: m.boundary });
  const pmma = apply(m, { type: 'add', name: 'PMMA', thickness: 0.4, area: m.boundary });
  for (const [id, depth, w] of [
    [pmma.layerId, 0.4, 2],
    [mma.layerId, 0.5, 4],
  ]) {
    const r = apply(m, {
      type: 'etch',
      etchProfile: 'develop',
      etchTargetLayerIds: [id],
      thickness: depth,
      area: v.rectMulti(w, 8),
      face: 'front',
    });
    assert.equal(r.changed, true, r.error);
  }
  assert.deepEqual(
    at(m, 0, 0).map((s) => s.layerId),
    ['base'],
  );
  assert.deepEqual(
    at(m, 1.5, 0).map((s) => s.layerId),
    ['base', pmma.layerId],
  );
  assert.equal(at(m, 1.5, 0)[1].z0, 1.5);
  const r = apply(m, {
    type: 'add',
    growth: 'direct',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    face: 'front',
    incidence: { tiltDeg: 45, azimuthDeg: 0, materialGeometry: true, heightStepUm: 0.05 },
  });
  assert.equal(r.changed, true, r.error);
  validateProcessModel(m);
  // The source-facing ray passes the top slot then lands under its left lip.
  assert.ok(at(m, -1.2, 0).some((s) => s.layerId === r.layerId && Math.abs(s.z0 - 1) < 1e-8));
  assert.ok(at(m, 0, 0).some((s) => s.layerId === r.layerId));
  assert.ok(!at(m, 1.5, 0).some((s) => s.layerId === r.layerId && s.z0 < 1.5));
});

test('a sidewall film connecting floor metal to resist topcoat is rejected as a real bridge', () => {
  const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
  const ids = [];
  for (const [name, thickness] of [
    ['MMA', 0.5],
    ['PMMA', 0.4],
  ])
    ids.push(apply(m, { type: 'add', name, thickness, area: m.boundary }).layerId);
  for (const [id, thickness] of [
    [ids[1], 0.4],
    [ids[0], 0.5],
  ])
    apply(m, {
      type: 'etch',
      etchProfile: 'develop',
      etchTargetLayerIds: [id],
      thickness,
      area: v.rectMulti(2, 2),
    });
  const al = apply(m, { type: 'add', name: 'Al', thickness: 0.04, area: m.boundary });
  const wall = v.rectMulti(0.04, 2, -0.98, 0);
  m.regions = m.regions.flatMap((r) => {
    const hit = v.intersection(r.geom, wall),
      rest = v.difference(r.geom, wall);
    return [
      { ...r, geom: rest },
      {
        id: `wall-${r.id}`,
        geom: hit,
        stack: api.normalizeStack([...r.stack, { layerId: al.layerId, z0: 1.04, z1: 1.9 }]),
      },
    ].filter((p) => p.geom.length);
  });
  validateProcessModel(m);
  const before = structuredClone(m);
  const result = apply(m, { type: 'liftoff', sacrificialLayerIds: ids, area: m.boundary });
  assert.equal(result.changed, false);
  assert.match(result.error, /bridge/);
  assert.deepEqual(m, before);
});

test('closed material contact detects a shared wall but preserves a real gap and a resist opening', async () => {
  const { materialGeometriesTouch } = await import('../material-process-boolean.js');
  const left = v.rectMulti(2, 2),
    right = v.rectMulti(1, 1, 1.5, 0);
  assert.equal(materialGeometriesTouch(left, right), true);
  assert.equal(materialGeometriesTouch(left, v.rectMulti(1, 1, 1.505, 0)), false);
  const resist = [[v.rectMulti(8, 8)[0][0], v.rectMulti(2, 2)[0][0]]];
  assert.equal(materialGeometriesTouch(resist, v.rectMulti(0.5, 0.5)), false);
  assert.equal(materialGeometriesTouch(resist, v.rectMulti(1, 1, 0.5, 0)), true);
});

test('material Direct coats upstream vertical wall and preserves original material', () => {
  const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
  const step = apply(m, { type: 'add', name: 'Step', thickness: 0.5, area: v.rectMulti(2, 4) });
  const r = apply(m, {
    type: 'add',
    growth: 'direct',
    name: 'Al',
    thickness: 0.04,
    face: 'front',
    area: m.boundary,
    incidence: { tiltDeg: 45, azimuthDeg: 0, materialGeometry: true, heightStepUm: 0.05 },
  });
  assert.equal(r.changed, true, r.error);
  validateProcessModel(m);
  assert.ok(at(m, 1.02, 0).some((s) => s.layerId === r.layerId && s.z1 > 1.4));
  assert.ok(!at(m, -1.02, 0).some((s) => s.layerId === r.layerId && s.z1 > 1.1));
  assert.ok(at(m, 0, 0).some((s) => s.layerId === step.layerId && s.z0 === 1 && s.z1 === 1.5));
  const volume = m.regions.reduce(
    (total, region) =>
      total +
      api.geometryArea(region.geom) *
        region.stack
          .filter((s) => s.layerId === r.layerId)
          .reduce((sum, s) => sum + s.z1 - s.z0, 0),
    0,
  );
  // 62 µm² horizontal receiving area plus the 4×0.5 µm upstream wall.
  // Subtract the geometric overlap of the horizontal and vertical films.
  assert.ok(
    Math.abs(volume - (62 * 0.04 + 4 * 0.5 * 0.04 - 4 * 0.04 * 0.04)) < 1e-8,
    `Al volume ${volume}`,
  );
});

test('an overhang cannot nucleate film in a projected band severed from the receiving wall', () => {
  const m = api.createModel({ shape: 'rect', width: 8, height: 4, thickness: 2 });
  const solid = (name, area, z0, z1) => {
    const l = api.createLayer(m, name);
    m.regions = m.regions.flatMap((r) => {
      const hit = v.intersection(r.geom, area),
        rest = v.difference(r.geom, area);
      return [
        { geom: rest, stack: r.stack },
        { geom: hit, stack: api.normalizeStack([...r.stack, { layerId: l.id, z0, z1 }]) },
      ]
        .filter((p) => p.geom.length)
        .map((p) => ({ ...p, id: `region-${m.nextRegionId++}` }));
    });
  };
  solid('Pad', v.rectMulti(2, 2, -1, 0), 1, 1.5);
  solid('Rail', v.rectMulti(0.01, 2, 0.205, 0), 1.6, 1.65);
  solid(
    'Rail supports',
    [...v.rectMulti(0.01, 0.2, 0.205, -0.9), ...v.rectMulti(0.01, 0.2, 0.205, 0.9)],
    1,
    1.6,
  );
  validateProcessModel(m);
  const dose = apply(m, {
    type: 'add',
    growth: 'direct',
    name: 'Al',
    thickness: 0.1,
    area: m.boundary,
    face: 'front',
    incidence: {
      materialGeometry: true,
      sidewalls: true,
      tiltDeg: 45,
      azimuthDeg: 0,
      heightStepUm: 0.05,
    },
  });
  assert.ok(dose.changed, dose.error);
  validateProcessModel(m);
  assert.equal(
    at(m, 0.08, 0).some((s) => s.layerId === dose.layerId && s.z0 < 1.42 && s.z1 > 1.42),
    false,
  );
});

test('lateral development forms a physical overhang while preserving PMMA, substrate and the input mask', () => {
  const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
  const mma = apply(m, { type: 'add', name: 'MMA', thickness: 0.5, area: m.boundary });
  const pmma = apply(m, { type: 'add', name: 'PMMA', thickness: 0.4, area: m.boundary });
  const area = v.rectMulti(2, 2),
    source = structuredClone(area);
  apply(m, {
    type: 'etch',
    etchProfile: 'develop',
    thickness: 0.4,
    etchTargetLayerIds: [pmma.layerId],
    area,
  });
  const result = apply(m, {
    type: 'etch',
    etchProfile: 'develop',
    thickness: 0.5,
    developLateralUm: 0.3,
    etchTargetLayerIds: [mma.layerId],
    area,
  });
  assert.ok(result.changed, result.error);
  validateProcessModel(m);
  assert.deepEqual(area, source);
  assert.equal(
    at(m, 1.2, 0).some((s) => s.layerId === mma.layerId),
    false,
  );
  assert.equal(
    at(m, 1.2, 0).some((s) => s.layerId === pmma.layerId),
    true,
  );
  assert.equal(
    at(m, 1.4, 0).some((s) => s.layerId === mma.layerId),
    true,
  );
  const recipe = parseProcessRecipe(
    'etch({target:"MMA",profile:"develop",depth:"500 nm",lateral:"300 nm",area:"mask"});',
  );
  assert.equal(recipe.steps[0].params.developLateralUm, 0.3);
  assert.deepEqual(parseProcessRecipe(serializeProcessRecipe(recipe)).steps, recipe.steps);
});

test('shared hot pixels node a rounded crossing on both rings without mutating source coordinates', async () => {
  const { nodeMaterialProcessInputs } = await import('../material-process-noding.js');
  const input = [
    v.rectMulti(1, 1),
    [
      [
        [
          [-1, -0.3333],
          [1, 0.3333],
          [1, 2],
          [-1, 2],
          [-1, -0.3333],
        ],
      ],
    ],
  ];
  const before = structuredClone(input);
  const result = nodeMaterialProcessInputs(input, { sourceCount: 1 });
  for (const geometry of result)
    assert.ok(geometry.some((p) => p.some((r) => r.some(([x, y]) => x === 0.5 && y === 0.1667))));
  assert.deepEqual(input, before);
});

test('a sub-grid numerical seam cannot become a full-depth wafer wall; a real aperture is preserved', () => {
  const wafer = (gap) => {
    const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 675 });
    const stack = m.regions[0].stack;
    m.regions = [
      {
        id: 'left',
        geom: v.rectMulti(4 - gap / 2, 8, -2 - gap / 4, 0),
        stack: structuredClone(stack),
      },
      {
        id: 'right',
        geom: v.rectMulti(4 - gap / 2, 8, 2 + gap / 4, 0),
        stack: structuredClone(stack),
      },
    ];
    return m;
  };
  const process = (m) =>
    apply(m, {
      type: 'add',
      name: 'Al',
      growth: 'direct',
      thickness: 0.04,
      face: 'front',
      area: m.boundary,
      incidence: { tiltDeg: 45, azimuthDeg: 0, materialGeometry: true, heightStepUm: 0.05 },
    });
  const numerical = wafer(4e-9),
    outcome = process(numerical);
  assert.ok(outcome.changed, outcome.error);
  validateProcessModel(numerical);
  assert.ok(
    numerical.regions.every((r) =>
      r.stack.filter((s) => s.layerId === outcome.layerId).every((s) => s.z0 >= 337.5),
    ),
  );
  const real = wafer(0.01),
    before = structuredClone(real),
    rejected = process(real);
  assert.equal(rejected.changed, false);
  assert.match(rejected.error, /wall budget/);
  assert.deepEqual(real, before);
});

test('Q2 oxide owner noding does not generate a wall through solid Si', async () => {
  const { difference } = await import('../material-process-boolean.js');
  const { materialOwnerCoverage } = await import('../material-process-partition.js');
  const fixture = new URL(
    '../../tests/fixtures/transmon-q2-wall-oxide-noded-gap.json.gz',
    import.meta.url,
  );
  const model = JSON.parse(gunzipSync(readFileSync(fixture)));
  const result = apply(model, {
    type: 'add',
    name: 'Al2',
    growth: 'direct',
    thickness: 0.03,
    face: 'front',
    area: model.boundary,
    incidence: { tiltDeg: 45, azimuthDeg: 135, materialGeometry: true, heightStepUm: 0.05 },
  });
  assert.ok(result.changed, result.error);
  validateProcessModel(model);
  assert.equal(difference(model.boundary, materialOwnerCoverage(model)).length, 0);
  assert.ok(
    model.regions.every(({ stack }) =>
      stack.filter((s) => s.layerId === result.layerId).every((s) => s.z0 >= 337.45 - 1e-8),
    ),
  );
});

test('unsupported incidence fails transactionally and recipe retains physical semantics', () => {
  const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
  const before = structuredClone(m);
  const r = apply(m, {
    type: 'add',
    growth: 'direct',
    name: 'Al',
    thickness: 0.04,
    face: 'front',
    area: m.boundary,
    incidence: { tiltDeg: 45, azimuthDeg: 0, materialGeometry: true, heightStepUm: 0 },
  });
  assert.equal(r.changed, false);
  assert.deepEqual(m, before);
  const recipe = parseProcessRecipe(
    'deposit({material:"Al",thickness:"40 nm",tiltDeg:45,azimuthDeg:-45,materialGeometry:true,heightStepUm:0.025}); etch({target:"MMA",depth:"500 nm",profile:"develop",area:"mask"});',
  );
  assert.deepEqual(parseProcessRecipe(serializeProcessRecipe(recipe)).steps, recipe.steps);
});

test('internal touching material interfaces do not create extra ray-shadow surfaces', () => {
  const build = (split) => {
    const m = api.createModel({ shape: 'rect', width: 8, height: 8, thickness: 2 });
    if (split) {
      const l = api.createLayer(m, 'Internal substrate layer');
      m.regions[0].stack = [
        { layerId: 'base', z0: -1, z1: 0.6 },
        { layerId: l.id, z0: 0.6, z1: 1 },
      ];
    }
    apply(m, { type: 'add', name: 'Pad', thickness: 0.5, area: v.rectMulti(2, 4) });
    const outcome = apply(m, {
      type: 'add',
      name: 'Al',
      growth: 'direct',
      face: 'front',
      area: m.boundary,
      thickness: 0.04,
      incidence: { materialGeometry: true, tiltDeg: 45, azimuthDeg: 0, heightStepUm: 0.05 },
    });
    assert.ok(outcome.changed, outcome.error);
    validateProcessModel(m);
    const parts = m.regions.flatMap((r) =>
      r.stack
        .filter((s) => s.layerId === outcome.layerId)
        .map((s) => ({ geom: r.geom, z0: s.z0, z1: s.z1 })),
    );
    return {
      volume: parts.reduce((n, p) => n + api.geometryArea(p.geom) * (p.z1 - p.z0), 0),
      footprint: v.unionGeometries(parts.map((p) => p.geom)),
    };
  };
  const a = build(false),
    b = build(true);
  assert.ok(Math.abs(a.volume - b.volume) < 1e-10);
  assert.equal(api.geometryArea(v.difference(a.footprint, b.footprint)), 0);
  assert.equal(api.geometryArea(v.difference(b.footprint, a.footprint)), 0);
});

test('local material intersections retain containing holes at chip coordinates', async () => {
  const { intersection, materialGeometryArea } = await import('../material-process-boolean.js');
  const outer = v.rectMulti(10000, 10000)[0][0];
  const empty = v.rectMulti(2, 2, 1400, 2513)[0][0];
  const distant = v.rectMulti(1, 1, -1400, -2513)[0][0];
  const solid = [[outer, empty, distant]];
  assert.deepEqual(intersection(solid, v.rectMulti(0.2, 0.2, 1400, 2513)), []);
  const cut = intersection(solid, v.rectMulti(0.2, 0.2, 1402, 2513));
  assert.ok(Math.abs(materialGeometryArea(cut) - 0.04) < 1e-10);
});

test('indexed perforations preserve holes, islands and partial material intersections', async () => {
  const { intersection, materialGeometryArea, difference } =
    await import('../material-process-boolean.js');
  const holes = [];
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 8; y++) holes.push(v.rectMulti(0.4, 0.4, -7 + 2 * x, -7 + 2 * y)[0]);
  const perforated = [[v.rectMulti(20, 20)[0][0], ...holes.map((p) => p[0])]];
  assert.deepEqual(intersection(perforated, v.rectMulti(0.2, 0.2, -7, -7)), []);
  assert.ok(
    Math.abs(materialGeometryArea(intersection(perforated, v.rectMulti(0.6, 0.6, -7, -7))) - 0.2) <
      1e-12,
  );
  assert.ok(
    Math.abs(materialGeometryArea(intersection(holes, v.rectMulti(0.2, 0.2, -7, -7))) - 0.04) <
      1e-12,
  );
  assert.ok(
    Math.abs(materialGeometryArea(difference(v.rectMulti(0.6, 0.6, -7, -7), holes)) - 0.2) < 1e-12,
  );
});

test('flat integer contours recover nested holes and islands with the original winding geometry', async () => {
  const { unionMaterialSweeps, materialGeometryArea } =
    await import('../material-process-boolean.js');
  const outer = [[v.rectMulti(10, 10)[0][0], v.rectMulti(6, 6)[0][0]]];
  const island = [[v.rectMulti(2, 2)[0][0], v.rectMulti(1, 1)[0][0]]];
  const result = unionMaterialSweeps([outer, island]);
  assert.equal(result.length, 2);
  assert.ok(result.every((p) => p.length === 2));
  assert.equal(materialGeometryArea(result), 67);
  assert.equal(v.pointInMulti([0, 0], result), false);
  assert.equal(v.pointInMulti([0.75, 0], result), true);
  assert.equal(v.pointInMulti([2, 0], result), false);
  assert.equal(v.pointInMulti([4, 0], result), true);
  const reference = v.unionGeometries([outer, island]);
  assert.equal(api.geometryArea(v.difference(reference, result)), 0);
  assert.equal(api.geometryArea(v.difference(result, reference)), 0);
});

test('a hole touching its parent at every vertex is assigned by exact edge midpoints', async () => {
  const { unionMaterialSweeps, materialGeometryArea } =
    await import('../material-process-boolean.js');
  const source = [
    [
      [
        [0, 0],
        [2, 0],
        [3, 1],
        [2, 2],
        [0, 2],
        [-1, 1],
        [0, 0],
      ],
      [
        [0, 0],
        [3, 1],
        [0, 2],
        [0, 0],
      ],
    ],
  ];
  const result = unionMaterialSweeps([source]);
  assert.equal(materialGeometryArea(result), 3);
  assert.equal(v.pointInMulti([1, 1], result), false);
  assert.equal(v.pointInMulti([2, 0.2], result), true);
  assert.equal(v.pointInMulti([-0.5, 1], result), true);
  const reference = v.unionGeometries([source]);
  assert.equal(api.geometryArea(v.difference(reference, result)), 0);
  assert.equal(api.geometryArea(v.difference(result, reference)), 0);
});

test('sidewall receiving support requires a finite shared edge, not a corner tangent', async () => {
  const { materialGeometriesTouch, materialGeometriesShareBoundaryEdge } =
    await import('../material-process-boolean.js');
  const receiver = v.rectMulti(2, 2);
  const corner = v.rectMulti(1, 1, 1.5, 1.5);
  const fullEdge = v.rectMulti(1, 1, 1.5, 0);
  const splitEdge = v.rectMulti(1, 0.5, 1.5, 0.25);
  const physicalGap = v.rectMulti(1, 1, 1.500001, 0);
  assert.equal(materialGeometriesTouch(receiver, corner), true);
  assert.equal(materialGeometriesShareBoundaryEdge(receiver, corner), false);
  assert.equal(materialGeometriesShareBoundaryEdge(receiver, fullEdge), true);
  assert.equal(materialGeometriesShareBoundaryEdge(receiver, splitEdge), true);
  assert.equal(materialGeometriesShareBoundaryEdge(fullEdge, receiver), true);
  assert.equal(materialGeometriesShareBoundaryEdge(receiver, physicalGap), false);
  const opening = [[v.rectMulti(8, 8)[0][0], v.rectMulti(2, 2)[0][0]]];
  assert.equal(
    materialGeometriesShareBoundaryEdge(opening, v.rectMulti(0.5, 0.5)),
    false,
    'a floating polygon inside a lithographic opening has no receiving edge',
  );
  assert.equal(
    materialGeometriesShareBoundaryEdge(opening, v.rectMulti(1, 1, 1.5, 1)),
    true,
    'a receiving wall inside a hole is still a real edge',
  );
});
