import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel, applyOperation } = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');
const { isolatedDirectSidewallPlan } = await import('../direct-sidewall-geometry.js');

const make = () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  const step = applyOperation(model, {
    type: 'add',
    name: 'Raised step',
    thickness: 1,
    face: 'front',
    growth: 'direct',
    area: rectMulti(4, 8, 2),
  });
  assert.equal(step.changed, true);
  return model;
};
const beam = (azimuthDeg, extra = {}) => ({
  tiltDeg: 45,
  azimuthDeg,
  heightStepUm: 0.1,
  sidewallGeometry: 'isolated-step',
  ...extra,
});
const wall = (model, layerId) =>
  model.regions.filter((r) =>
    r.stack.some((s) => s.layerId === layerId && s.role === 'direct-sidewall'),
  );

test('isolated step gets projected sidewall on source-facing wall only', () => {
  const model = make();
  const before = structuredClone(model);
  const exposed = isolatedDirectSidewallPlan(model, model.boundary, beam(0), 0.04);
  assert.equal(exposed.length, 1);
  assert.ok(Math.abs(exposed[0].projectedWidthUm - 0.04) < 1e-9);
  assert.equal(pointInMulti([4.02, 0], exposed[0].area), true);
  assert.equal(pointInMulti([-0.02, 0], exposed[0].area), false);
  assert.deepEqual(model, before);
  const applied = applyOperation(model, {
    type: 'add',
    name: 'Directional Al',
    growth: 'direct',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(0),
  });
  assert.equal(applied.changed, true, applied.error);
  const bands = wall(model, applied.layerId);
  assert.ok(bands.length > 0, 'The exposed sidewall must become physical model geometry');
  assert.equal(
    bands.some((region) => pointInMulti([4.02, 0], region.geom)),
    true,
  );
  assert.equal(
    bands.some((region) => pointInMulti([-0.02, 0], region.geom)),
    false,
  );
  const seg = bands.find((r) => pointInMulti([4.02, 0], r.geom)).stack.at(-1);
  assert.ok(Math.abs(seg.z1 - 6) < 1e-9);
  assert.ok(seg.z0 >= 5);
});

test('reversing incoming azimuth reverses physically deposited wall', () => {
  const model = make();
  const applied = applyOperation(model, {
    type: 'add',
    name: 'Directional Al',
    growth: 'direct',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(180),
  });
  assert.equal(applied.changed, true, applied.error);
  const bands = wall(model, applied.layerId);
  assert.equal(
    bands.some((region) => pointInMulti([-0.02, 0], region.geom)),
    true,
  );
  assert.equal(
    bands.some((region) => pointInMulti([4.02, 0], region.geom)),
    false,
  );
});

test('unsupported resist and non-isolated topology reject and roll back entirely', () => {
  const model = make();
  for (const incidence of [
    beam(0, { apertureStack: [{ bottomZUm: 5, topZUm: 5.5, opening: rectMulti(4, 5) }] }),
    beam(0, { tiltDeg: 0 }),
    beam(0, { tiltDeg: 89.1 }),
  ]) {
    const before = structuredClone(model);
    const applied = applyOperation(model, {
      type: 'add',
      name: 'Al',
      growth: 'direct',
      thickness: 0.04,
      area: model.boundary,
      incidence,
    });
    assert.equal(applied.changed, false);
    assert.deepEqual(model, before);
  }
});

test('sidewall flag omitted preserves ordinary Direct without a wall role', () => {
  const model = make();
  const applied = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    growth: 'direct',
    area: model.boundary,
    incidence: { tiltDeg: 45, azimuthDeg: 0, heightStepUm: 0.1 },
  });
  assert.equal(applied.changed, true, applied.error);
  assert.equal(wall(model, applied.layerId).length, 0);
});

test('diagonal 45-degree incoming beam deposits on two illuminated vertical step walls', () => {
  const model = createModel({ shape: 'rect', width: 12, height: 12, thickness: 10 });
  assert.equal(
    applyOperation(model, { type: 'add', name: 'Step', thickness: 1, area: rectMulti(4, 4, 0, 0) })
      .changed,
    true,
  );
  const plans = isolatedDirectSidewallPlan(model, model.boundary, beam(45), 0.04);
  assert.equal(plans.length, 2);
  const projectedWidth = 0.04 * Math.SQRT1_2;
  for (const p of plans) assert.ok(Math.abs(p.projectedWidthUm - projectedWidth) < 1e-8);
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(45),
  });
  assert.equal(result.changed, true, result.error);
  const bands = wall(model, result.layerId);
  assert.ok(bands.length >= 1);
  assert.equal(
    bands.some((r) => pointInMulti([2.01, 0], r.geom)),
    true,
  );
  assert.equal(
    bands.some((r) => pointInMulti([0, 2.01], r.geom)),
    true,
  );
  assert.equal(
    bands.some((r) => pointInMulti([-2.01, 0], r.geom)),
    false,
  );
  assert.equal(
    bands.some((r) => pointInMulti([0, -2.01], r.geom)),
    false,
  );
});

test('strict schema validation, storage persistence and restored direct-sidewall role', async () => {
  const { validateProcessModel, validateProjectFile } = await import('../project-schema.js');
  const { prepareProjectForExport, expandProjectStorage } = await import('../project-io.js');
  const model = make();
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(0),
  });
  assert.equal(result.changed, true, result.error);
  validateProcessModel(model);
  const project = {
    format: 'WaferCAD-vector',
    version: 14,
    name: 'Direct isolated-step sidewall science fixture',
    model,
    layout: {
      name: 'No source Mask',
      root: 'EMPTY',
      elements: [],
      linework: [],
      combos: [],
      hierarchy: {},
      bounds: { minX: -6, minY: -4, maxX: 6, maxY: 4, width: 12, height: 8 },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [],
    activeCell: 'EMPTY',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'draw',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section: { a: [3.75, 0], b: [4.25, 0] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      threeShowBorders: true,
      threeOpacity: 1,
      maskOpacity: 0.8,
    },
    snapshots: [],
  };
  validateProjectFile(project);
  const output = prepareProjectForExport(project);
  const restored = JSON.parse(JSON.stringify(output.stored));
  expandProjectStorage(restored);
  validateProjectFile(restored);
  assert.ok(wall(restored.model, result.layerId).length > 0);
});

test('unknown wall solver mode rejects rather than silently dropping sidewalls', () => {
  const model = make();
  const before = structuredClone(model);
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(0, { sidewallGeometry: 'conformal' }),
  });
  assert.equal(result.changed, false);
  assert.match(result.error, /Unsupported Direct sidewall/);
  assert.deepEqual(model, before);
});

test('masked 2D sidewall request fails closed without an aperture height', () => {
  const model = make(),
    before = structuredClone(model);
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: rectMulti(6, 8),
    incidence: beam(0),
  });
  assert.equal(result.changed, false);
  assert.match(result.error, /complete physical face/);
  assert.deepEqual(model, before);
});

test('subsequent Direct does not deposit onto the artificial sidewall top', () => {
  const model = make();
  const first = applyOperation(model, {
    type: 'add',
    name: 'Al 1',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(0),
  });
  assert.equal(first.changed, true);
  const firstBand = wall(model, first.layerId);
  assert.ok(firstBand.length);
  const second = applyOperation(model, {
    type: 'add',
    name: 'Al 2',
    thickness: 0.03,
    area: model.boundary,
    incidence: { tiltDeg: 45, azimuthDeg: 180, heightStepUm: 0.1 },
  });
  assert.equal(second.changed, true, second.error);
  const after = model.regions.filter((r) => pointInMulti([4.02, 0], r.geom));
  assert.equal(after.length, 1);
  assert.equal(
    after[0].stack.some((s) => s.layerId === second.layerId),
    false,
  );
});
