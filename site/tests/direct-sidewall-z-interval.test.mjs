import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { sidewallVisibleHeightIntervals } = await import('../direct-sidewall-aperture.js');
const { createModel, applyOperation } = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');
const { validateProcessModel, validateProjectFile } = await import('../project-schema.js');
const { prepareProjectForExport, expandProjectStorage } = await import('../project-io.js');

const facet = { a: [2, -1], b: [2, 1], lowZ: 5, highZ: 6 };
const aperture = (opening, bottomZUm = 6, topZUm = 6.6) => ({
  bottomZUm,
  topZUm,
  opening,
});
const beam = (opening, other = {}) => ({
  tiltDeg: 45,
  azimuthDeg: 0,
  heightStepUm: 0.05,
  sidewallGeometry: 'isolated-step',
  apertureStack: [aperture(opening)],
  ...other,
});
const model = () => {
  const m = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  const r = applyOperation(m, {
    type: 'add',
    name: 'Raised step',
    thickness: 1,
    growth: 'direct',
    area: rectMulti(4, 2),
  });
  assert.equal(r.changed, true);
  return m;
};
const wallBands = (m, layerId) =>
  m.regions.flatMap((r) =>
    r.stack.filter((s) => s.layerId === layerId && s.role === 'direct-sidewall'),
  );

test('analytical fixed-angle wall Z clipping handles visible, blocked and two resist levels', () => {
  assert.deepEqual(sidewallVisibleHeightIntervals(facet, beam(rectMulti(1.2, 3, 2.8))), [
    [5.2, 5.8],
  ]);
  assert.deepEqual(sidewallVisibleHeightIntervals(facet, beam(rectMulti(2, 3, 2.8))), [[5, 6]]);
  assert.deepEqual(sidewallVisibleHeightIntervals(facet, beam(rectMulti(0.2, 3, 6))), []);
  const two = beam(rectMulti(1.2, 3, 2.8));
  two.apertureStack.push(aperture(rectMulti(1.2, 3, 3.4), 6.6, 7));
  const intervals = sidewallVisibleHeightIntervals(facet, two);
  assert.equal(intervals.length, 1);
  assert.ok(intervals[0][0] >= 5.2 - 1e-7);
  assert.ok(intervals[0][1] <= 5.8 + 1e-7);
});

test('native material stack saves and restores partial-height wall with an actual Z gap', () => {
  const m = model();
  const applied = applyOperation(m, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    incidence: beam(rectMulti(1.2, 3, 2.8)),
  });
  assert.equal(applied.changed, true, applied.error);
  const walls = wallBands(m, applied.layerId);
  assert.equal(walls.length, 1);
  assert.deepEqual([walls[0].z0, walls[0].z1], [5.2, 5.8]);
  validateProcessModel(m);
  const project = {
    format: 'WaferCAD-vector',
    version: 14,
    name: 'Z-segmented Direct test',
    model: m,
    layout: {
      name: 'No Mask',
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
    section: { a: [1.75, 0], b: [2.25, 0] },
    planViews: {
      main: { zoom: 1, panX: 0, panY: 0 },
      mask: { zoom: 1, panX: 0, panY: 0 },
    },
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
  const serialized = JSON.parse(JSON.stringify(prepareProjectForExport(project).stored));
  expandProjectStorage(serialized);
  validateProjectFile(serialized);
  assert.deepEqual(
    wallBands(serialized.model, applied.layerId).map((s) => [s.z0, s.z1]),
    [[5.2, 5.8]],
  );
});

test('rectangular lengthwise clipping is physical; invalid upper masks fail closed', () => {
  const m = model();
  const clipped = applyOperation(m, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    incidence: beam(rectMulti(1.2, 1, 2.8)),
  });
  assert.equal(clipped.changed, true, clipped.error);
  const walls = m.regions.filter((r) =>
    r.stack.some(
      (segment) => segment.layerId === clipped.layerId && segment.role === 'direct-sidewall',
    ),
  );
  assert.equal(walls.length, 1);
  assert.ok(pointInMulti([2.02, 0], walls[0].geom));
  assert.ok(!pointInMulti([2.02, 0.75], walls[0].geom));
  validateProcessModel(m);

  const triangle = [
    [
      [
        [2.2, -2],
        [3.4, -2],
        [2.8, 2],
        [2.2, -2],
      ],
    ],
  ];
  const cases = [
    beam(rectMulti(2, 3, 2.8), { apertureStack: [aperture(rectMulti(2, 3, 2.8), 5.5, 6.6)] }),
    beam(triangle),
  ];
  for (const incidence of cases) {
    const rejected = model();
    const original = structuredClone(rejected);
    const result = applyOperation(rejected, {
      type: 'add',
      name: 'Al',
      thickness: 0.04,
      area: rejected.boundary,
      incidence,
    });
    assert.equal(result.changed, false);
    assert.deepEqual(rejected, original);
  }
});

test('nonrectangular fully clear aperture retains previous full-height behavior', () => {
  const multiplePolygons = [...rectMulti(2, 3, 2.8), ...rectMulti(0.2, 0.3, -3)];
  assert.deepEqual(sidewallVisibleHeightIntervals(facet, beam(multiplePolygons)), [[5, 6]]);
});
