import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, geometryArea } = await import('../model.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { clipFixedSidewallLength } = await import('../direct-sidewall-xy-clip.js');
const { isolatedDirectSidewallPlan } = await import('../direct-sidewall-geometry.js');
const { validateProcessModel, validateProjectFile } = await import('../project-schema.js');
const { prepareProjectForExport, expandProjectStorage } = await import('../project-io.js');

const facet = { a: [2, -1], b: [2, 1], lowZ: 5, highZ: 6 };
const beam = (azimuthDeg = 0, apertures = [rectMulti(1.2, 0.8, 2.8)]) => ({
  tiltDeg: 45,
  azimuthDeg,
  heightStepUm: 0.05,
  sidewallGeometry: 'isolated-step',
  apertureStack: apertures.map((opening, i) => ({
    bottomZUm: i === 0 ? 6 : 6.6,
    topZUm: i === 0 ? 6.6 : 7,
    opening,
  })),
});
const makeStep = () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  const step = applyOperation(model, {
    type: 'add',
    name: 'Rectangular step',
    thickness: 1,
    area: rectMulti(4, 2),
  });
  assert.equal(step.changed, true);
  return model;
};
const wallRegions = (model, layerId) =>
  model.regions.filter((r) =>
    r.stack.some((s) => s.layerId === layerId && s.role === 'direct-sidewall'),
  );

test('perpendicular beam clips the physical wall length to the upper resist window', () => {
  const patches = clipFixedSidewallLength(facet, beam());
  assert.deepEqual(patches.map(({ a, b }) => [a, b]), [[[2, -0.4], [2, 0.4]]]);
  const model = makeStep();
  const plan = isolatedDirectSidewallPlan(model, model.boundary, beam(), 0.04);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].visibleHeightIntervals, [[5.2, 5.8]]);
  assert.ok(pointInMulti([2.02, 0], plan[0].area));
  assert.ok(!pointInMulti([2.02, 0.7], plan[0].area));
});

test('upper aperture intersections, empty tangential windows and inward 0.1 nm snapping', () => {
  assert.deepEqual(
    clipFixedSidewallLength(facet, beam(0, [
      rectMulti(1.2, 0.8, 2.8),
      rectMulti(3, 0.5, 3, 0.05),
    ])).map(({ a, b }) => [a, b]),
    [[[2, -0.2], [2, 0.3]]],
  );
  assert.deepEqual(clipFixedSidewallLength(facet, beam(0, [rectMulti(1.2, 0.3, 2.8, 2)])), []);
  assert.deepEqual(
    clipFixedSidewallLength(facet, beam(0, [rectMulti(1.2, 0.800108, 2.8, 0)]))
      .map(({ a, b }) => [a, b]),
    [[[2, -0.4], [2, 0.4]]],
  );
});

test('unmasked legacy Direct retains original sub-grid wall coordinates', () => {
  const original = { a: [2, -1.0000123], b: [2, 1.0000456], lowZ: 5, highZ: 6 };
  assert.deepEqual(clipFixedSidewallLength(original, {
    tiltDeg: 45, azimuthDeg: 0,
  }), [original]);
});

test('native Direct allows wall-only deposition when no horizontal surface receives flux', () => {
  const model = makeStep();
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(),
  });
  assert.equal(result.changed, true, result.error);
  const regions = wallRegions(model, result.layerId);
  assert.equal(regions.length, 1);
  assert.ok(pointInMulti([2.02, 0], regions[0].geom));
  assert.ok(!pointInMulti([2.02, 0.7], regions[0].geom));
  const segment = regions[0].stack.find((s) => s.role === 'direct-sidewall');
  assert.deepEqual([segment.z0, segment.z1], [5.2, 5.8]);
  const volume = geometryArea(regions[0].geom) * (segment.z1 - segment.z0);
  assert.ok(Math.abs(volume - 0.0192) < 1e-7);
  validateProcessModel(model);
});

test('partial angled exposure fails closed without modifying source material', () => {
  const model = makeStep(), original = structuredClone(model);
  const result = applyOperation(model, {
    type: 'add',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(45),
  });
  assert.equal(result.changed, false);
  assert.deepEqual(model, original);
});

test('strict project schema and compact storage preserve XY/Z sidewall segmentation', () => {
  const model = makeStep();
  const result = applyOperation(model, {
    type: 'add', name: 'Al', thickness: 0.04, area: model.boundary, incidence: beam(),
  });
  assert.equal(result.changed, true, result.error);
  const project = {
    format: 'WaferCAD-vector', version: 14, model,
    name: 'Fixed Direct XY/Z isolation fixture',
    layout: {
      name: 'None', root: 'EMPTY', elements: [], linework: [], combos: [], hierarchy: {},
      bounds: { minX: -6, minY: -4, maxX: 6, maxY: 4, width: 12, height: 8 },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: [], activeCell: 'EMPTY',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'draw', drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front', roi: null, maskRoi: null,
    roiAnchor: 'center', maskRoiAnchor: 'center',
    section: { a: [1.8, 0], b: [2.2, 0] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    display: {
      xyUnit: 'um', structurePalette: 'balanced', sectionScaleMode: 'auto',
      sectionShowBorders: true, threeShowBorders: true,
      threeOpacity: 1, maskOpacity: 0.8,
    },
    snapshots: [],
  };
  validateProjectFile(project);
  const encoded = JSON.parse(JSON.stringify(prepareProjectForExport(project).stored));
  expandProjectStorage(encoded);
  validateProjectFile(encoded);
  const recovered = wallRegions(encoded.model, result.layerId);
  assert.equal(recovered.length, 1);
  assert.ok(pointInMulti([2.02, 0], recovered[0].geom));
  assert.ok(!pointInMulti([2.02, 0.7], recovered[0].geom));
  const segment = recovered[0].stack.find((s) => s.role === 'direct-sidewall');
  assert.deepEqual([segment.z0, segment.z1], [5.2, 5.8]);
});
