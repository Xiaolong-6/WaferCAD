import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, geometryArea } = await import('../model.js');
const { rectMulti, pointInMulti, intersection } = await import('../vector-geometry.js');
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
  assert.deepEqual(
    patches.map(({ a, b }) => [a, b]),
    [
      [
        [2, -0.4],
        [2, 0.4],
      ],
    ],
  );
  const model = makeStep();
  const plan = isolatedDirectSidewallPlan(model, model.boundary, beam(), 0.04);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].visibleHeightIntervals, [[5.2, 5.8]]);
  assert.ok(pointInMulti([2.02, 0], plan[0].area));
  assert.ok(!pointInMulti([2.02, 0.7], plan[0].area));
});

test('upper aperture intersections, empty tangential windows and inward 0.1 nm snapping', () => {
  assert.deepEqual(
    clipFixedSidewallLength(
      facet,
      beam(0, [rectMulti(1.2, 0.8, 2.8), rectMulti(3, 0.5, 3, 0.05)]),
    ).map(({ a, b }) => [a, b]),
    [
      [
        [2, -0.2],
        [2, 0.3],
      ],
    ],
  );
  assert.deepEqual(clipFixedSidewallLength(facet, beam(0, [rectMulti(1.2, 0.3, 2.8, 2)])), []);
  assert.deepEqual(
    clipFixedSidewallLength(facet, beam(0, [rectMulti(1.2, 0.800108, 2.8, 0)])).map(({ a, b }) => [
      a,
      b,
    ]),
    [
      [
        [2, -0.4],
        [2, 0.4],
      ],
    ],
  );
});

test('unmasked legacy Direct retains original sub-grid wall coordinates', () => {
  const original = { a: [2, -1.0000123], b: [2, 1.0000456], lowZ: 5, highZ: 6 };
  assert.deepEqual(
    clipFixedSidewallLength(original, {
      tiltDeg: 45,
      azimuthDeg: 0,
    }),
    [original],
  );
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

test('angled partial exposure conservatively partitions wall length and Z', () => {
  const model = makeStep();
  const incidence = { ...beam(45), facetSliceUm: 0.05 };
  const plan = isolatedDirectSidewallPlan(model, model.boundary, incidence, 0.04);
  const plannedVolume = plan.reduce(
    (sum, patch) =>
      sum +
      geometryArea(patch.area) *
        patch.visibleHeightIntervals.reduce((v, [z0, z1]) => v + z1 - z0, 0),
    0,
  );
  const result = applyOperation(model, {
    type: 'add',
    thickness: 0.04,
    area: model.boundary,
    incidence,
  });
  assert.equal(result.changed, true, result.error);
  const walls = wallRegions(model, result.layerId);
  assert.ok(walls.length > 2);
  let volumeUm3 = 0;
  for (const region of walls) {
    const wall = region.stack.find(
      (segment) => segment.layerId === result.layerId && segment.role === 'direct-sidewall',
    );
    assert.ok(wall && wall.z1 > wall.z0);
    volumeUm3 += geometryArea(region.geom) * (wall.z1 - wall.z0);
  }
  assert.ok(volumeUm3 > 0 && volumeUm3 < 0.04);
  // A direct-sidewall role alone undercounts where the same Al layer's
  // horizontal and vertical films join. Check actual union material volume.
  let actualCoverageVolume = 0;
  for (const patch of plan) {
    for (const region of model.regions) {
      const overlapXY = geometryArea(intersection(region.geom, patch.area));
      if (overlapXY <= 1e-15) continue;
      for (const segment of region.stack) {
        if (segment.layerId !== result.layerId) continue;
        for (const [z0, z1] of patch.visibleHeightIntervals)
          actualCoverageVolume +=
            overlapXY * Math.max(0, Math.min(segment.z1, z1) - Math.max(segment.z0, z0));
      }
    }
  }
  assert.ok(Math.abs(actualCoverageVolume - plannedVolume) < 1e-8);
  validateProcessModel(model);
});

test('nonrectangular oblique partial-facet request fails and rolls back', () => {
  const model = makeStep();
  const before = structuredClone(model);
  const triangle = [
    [
      [
        [2.2, -0.4],
        [3.4, -0.4],
        [3.0, 0.4],
      ],
    ],
  ];
  const result = applyOperation(model, {
    type: 'add',
    thickness: 0.04,
    area: model.boundary,
    incidence: { ...beam(45), apertureStack: [{ bottomZUm: 6, topZUm: 6.6, opening: triangle }] },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(model, before);
});

test('strict project schema and compact storage preserve XY/Z sidewall segmentation', () => {
  const model = makeStep();
  const result = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    incidence: beam(),
  });
  assert.equal(result.changed, true, result.error);
  const project = {
    format: 'WaferCAD-vector',
    version: 14,
    model,
    name: 'Fixed Direct XY/Z isolation fixture',
    layout: {
      name: 'None',
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
    section: { a: [1.8, 0], b: [2.2, 0] },
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
