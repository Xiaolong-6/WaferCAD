import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel, applyOperation } = await import('../model.js');
const { rectMulti, pointInMulti, intersection, difference, unionGeometries } =
  await import('../vector-geometry.js');
const { directIncidenceArea } = await import('../direct-incidence-geometry.js');

const base = () => createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
const incidence = (tiltDeg, azimuthDeg = 0, extra = {}) => ({
  tiltDeg, azimuthDeg, heightStepUm: 0.1, ...extra,
});
const materialAt = (model, point, layerId) =>
  model.regions.some((r) =>
    pointInMulti(point, r.geom) && r.stack.some((s) => s.layerId === layerId),
  );

test('default Direct equals explicit zero-angle Direct', () => {
  const legacy = base(), angled = base();
  const args = { type: 'add', growth: 'direct', name: 'Al', thickness: 0.04, face: 'front', area: legacy.boundary };
  assert.equal(applyOperation(legacy, args).changed, true);
  assert.equal(applyOperation(angled, { ...args, incidence: incidence(0) }).changed, true);
  assert.deepEqual(angled, legacy);
});

test('fixed incidence shades lower surface behind a step, with azimuth reversal', () => {
  const make = () => {
    const m = base();
    assert.equal(applyOperation(m, {
      type: 'add', name: 'Step', thickness: 1, area: rectMulti(4, 8, 2, 0),
    }).changed, true);
    return m;
  };
  const east = make(), west = make();
  const a = applyOperation(east, {
    type: 'add', name: 'Al', thickness: 0.04, area: east.boundary,
    incidence: incidence(45, 0),
  });
  const b = applyOperation(west, {
    type: 'add', name: 'Al', thickness: 0.04, area: west.boundary,
    incidence: incidence(45, 180),
  });
  assert.equal(a.changed, true); assert.equal(b.changed, true);
  assert.equal(materialAt(east, [-0.5, 0], a.layerId), false);
  assert.equal(materialAt(east, [-2, 0], a.layerId), true);
  assert.equal(materialAt(west, [-0.5, 0], b.layerId), true);
  assert.equal(materialAt(west, [4.5, 0], b.layerId), false);
});

test('absolute-Z resist apertures shadow Direct and preserve native material geometry', () => {
  const m = base();
  const openings = [{ bottomZUm: 5, topZUm: 5.9, opening: rectMulti(3, 6) }];
  const beam = incidence(45, 0, { apertureStack: openings });
  const visible = directIncidenceArea(m, m.boundary, beam);
  assert.equal(pointInMulti([-1, 0], visible.area), true);
  assert.equal(pointInMulti([1, 0], visible.area), false);
  const result = applyOperation(m, {
    type: 'add', name: 'Al', thickness: 0.04, area: m.boundary, incidence: beam,
  });
  assert.equal(result.changed, true);
  assert.equal(materialAt(m, [-1, 0], result.layerId), true);
  assert.equal(materialAt(m, [1, 0], result.layerId), false);
});

test('material-step silhouette converges when height sampling is refined', () => {
  const m = base();
  applyOperation(m, { type: 'add', name: 'Step', thickness: 1, area: rectMulti(4, 8, 2, 0) });
  const coarse = directIncidenceArea(m, m.boundary, incidence(45, 0, { heightStepUm: 0.2 }));
  const fine = directIncidenceArea(m, m.boundary, incidence(45, 0, { heightStepUm: 0.05 }));
  assert.equal(intersection(difference(coarse.area, fine.area), m.boundary).length, 0);
});

test('invalid input and over-budget shadow calculation leave model unchanged', () => {
  for (const input of [
    incidence(90),
    incidence(NaN),
    incidence(45, 0, { heightStepUm: 0 }),
    incidence(45, 0, {
      heightStepUm: 1e-5, maxSamples: 20,
      apertureStack: [{ bottomZUm: 5, topZUm: 5.9, opening: rectMulti(2, 2) }],
    }),
    incidence(45, 0, {
      apertureStack: [{ bottomZUm: 5.1, topZUm: 5, opening: rectMulti(2, 2) }],
    }),
  ]) {
    const m = base(), before = structuredClone(m);
    const result = applyOperation(m, {
      type: 'add', thickness: 0.03, area: m.boundary, incidence: input,
    });
    assert.equal(result.changed, false);
    assert.match(result.error, /failed safely/);
    assert.deepEqual(m, before);
  }
});

test('angled Direct rejects non-Direct operation and back face without mutation', () => {
  for (const params of [
    { type: 'add', growth: 'conformal' },
    { type: 'grow', growth: 'direct' },
    { type: 'add', growth: 'direct', face: 'back' },
  ]) {
    const m = base(), before = structuredClone(m);
    const r = applyOperation(m, { name: 'X', thickness: 0.03, area: m.boundary,
      incidence: incidence(45), ...params });
    assert.equal(r.changed, false);
    assert.deepEqual(m, before);
  }
});

test('original Q2 author GDS produces the same fixed-direction substrate exposure', {
  skip: !process.env.WAFERCAD_TRANSMON_GDS,
}, async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { parseGDS, flattenGDS } = await import('../gds.js');
  const { polygonAreaUm2, substrateShadowFootprint } =
    await import('../shadow-exposure-geometry.js');
  const bytes = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02');
  const parsed = parseGDS(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  );
  const jj = flattenGDS(parsed, 'jj_width0p18');
  const open = (datatype) => unionGeometries(jj.elements
    .filter((e) => e.layer === 8 && e.datatype === datatype)
    .map((e) => [[e.points]]));
  const upper = open(1), lower = unionGeometries([upper, open(0)]);
  const ref = substrateShadowFootprint([
    { bottomUm: 0, topUm: 0.5, opening: lower },
    { bottomUm: 0.5, topUm: 0.9, opening: upper },
  ], { thetaDeg: 45, azimuthDeg: -45, heightStepUm: 0.0375 });
  const m = createModel({ shape: 'rect', width: 40, height: 30, thickness: 675 });
  const beam = incidence(45, -45, { heightStepUm: 0.0375, apertureStack: [
    { bottomZUm: 337.5, topZUm: 338, opening: lower },
    { bottomZUm: 338, topZUm: 338.4, opening: upper },
  ] });
  const visible = directIncidenceArea(m, m.boundary, beam);
  assert.ok(Math.abs(polygonAreaUm2(visible.area) - polygonAreaUm2(ref.footprint)) < 1e-7);
  const result = applyOperation(m, {
    type: 'add', name: 'Al', thickness: 0.04, area: m.boundary, incidence: beam,
  });
  assert.equal(result.changed, true);
  const film = unionGeometries(m.regions
    .filter((r) => r.stack.some((s) => s.layerId === result.layerId))
    .map((r) => r.geom));
  // Compare the stored film to the independently grid-quantized visibility.
  // The unquantized analytical oracle is checked above at its original tolerance.
  const grid = 1e-4;
  const quantized = visible.area.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => [
        Number((Math.round(x / grid) * grid).toFixed(4)),
        Number((Math.round(y / grid) * grid).toFixed(4)),
      ]),
    ),
  );
  assert.ok(Math.abs(polygonAreaUm2(film) - polygonAreaUm2(quantized)) < 1e-9);
  assert.ok(Math.abs(polygonAreaUm2(film) - polygonAreaUm2(ref.footprint)) < 2e-4);
});

test('fixed-angle Direct rejects material already above modeled resist ceiling with rollback', () => {
  const m = base();
  const step = applyOperation(m, {
    type: 'add',
    thickness: 0.7,
    name: 'Raised existing surface',
    area: m.boundary,
  });
  assert.equal(step.changed, true);
  const before = structuredClone(m);
  const result = applyOperation(m, {
    type: 'add',
    name: 'Al through exhausted resist',
    thickness: 0.04,
    area: m.boundary,
    incidence: incidence(45, 0, {
      apertureStack: [{ bottomZUm: 5, topZUm: 5.5, opening: rectMulti(2, 2) }],
    }),
  });
  assert.equal(result.changed, false);
  assert.match(result.error, /resist top/);
  assert.deepEqual(m, before);
});

test('fixed-angle Direct checks the incoming dose height, not only the old material height', () => {
  const beam = incidence(45, 0, {
    apertureStack: [{ bottomZUm: 5, topZUm: 5.05, opening: rectMulti(3, 3) }],
  });
  const m = base();
  const before = structuredClone(m);
  const rejected = applyOperation(m, {
    type: 'add',
    thickness: 0.06,
    name: 'Dose crossing resist ceiling',
    area: m.boundary,
    incidence: beam,
  });
  assert.equal(rejected.changed, false);
  assert.match(rejected.error, /resist top/);
  assert.deepEqual(m, before);

  const accepted = applyOperation(m, {
    type: 'add',
    thickness: 0.04,
    name: 'Dose below resist ceiling',
    area: m.boundary,
    incidence: beam,
  });
  assert.equal(accepted.changed, true);
});
