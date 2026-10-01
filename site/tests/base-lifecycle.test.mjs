import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const {
  applyOperation,
  baseCoverageState,
  createModel,
  exposedLayerIds,
  fullFaceGeometry,
  hasMaterial,
  surfaceZ,
} = await import('../model.js');
const { pointInMulti, rectMulti } = await import('../vector-geometry.js');
const { serializeProject } = await import('../project-io.js');
const { createEmptyLayout } = await import('../controllers/project-state-controller.js');

function stackAt(model, x, y = 0) {
  return model.regions.find((region) => pointInMulti([x, y], region.geom))?.stack || [];
}

test('partial through-etch creates a true material-free hole while Base remains elsewhere', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const result = applyOperation(model, {
    type: 'etch',
    thickness: 10,
    face: 'front',
    area: rectMulti(4, 20),
  });

  assert.equal(result.changed, true);
  assert.equal(stackAt(model, 0).length, 0);
  assert.equal(stackAt(model, 6).at(-1)?.layerId, 'base');
  assert.equal(hasMaterial(model), true);
  assert.equal(baseCoverageState(model), 'partial');
});

test('whole-face over-etch leaves a valid empty-material model and blocks further surface processes', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(model, {
    type: 'etch',
    thickness: 20,
    face: 'front',
    area: fullFaceGeometry(model),
  });

  assert.equal(model.regions.length, 0);
  assert.equal(hasMaterial(model), false);
  assert.equal(baseCoverageState(model), 'removed');

  for (const params of [
    { type: 'etch', thickness: 1 },
    { type: 'add', thickness: 1, name: 'Film', growth: 'direct' },
    { type: 'grow', thickness: 1, targetLayerId: 'base', growth: 'direct' },
  ]) {
    const result = applyOperation(model, {
      ...params,
      face: 'front',
      area: fullFaceGeometry(model),
    });
    assert.equal(result.changed, false);
    assert.match(result.error, /No material remains/);
  }
});

test('Base is a valid Grow target when exposed on front and back', () => {
  const front = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  assert.deepEqual(exposedLayerIds(front, fullFaceGeometry(front), 'front'), ['base']);
  const frontBefore = surfaceZ(stackAt(front, 0), 'front');
  const frontResult = applyOperation(front, {
    type: 'grow',
    targetLayerId: 'base',
    thickness: 2,
    face: 'front',
    area: fullFaceGeometry(front),
    growth: 'direct',
  });
  assert.equal(frontResult.changed, true);
  assert.equal(surfaceZ(stackAt(front, 0), 'front'), frontBefore + 2);

  const back = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const backBefore = surfaceZ(stackAt(back, 0), 'back');
  const backResult = applyOperation(back, {
    type: 'grow',
    targetLayerId: 'base',
    thickness: 2,
    face: 'back',
    area: fullFaceGeometry(back),
    growth: 'direct',
  });
  assert.equal(backResult.changed, true);
  assert.equal(surfaceZ(stackAt(back, 0), 'back'), backBefore - 2);
});

test('buried Base is not offered as a Grow target and cannot grow through a covering layer', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const add = applyOperation(model, {
    type: 'add',
    name: 'Cover',
    thickness: 1,
    face: 'front',
    area: fullFaceGeometry(model),
    growth: 'direct',
  });
  assert.equal(add.changed, true);

  const exposed = exposedLayerIds(model, fullFaceGeometry(model), 'front');
  assert.equal(exposed.includes('base'), false);
  assert.equal(exposed.includes(add.layerId), true);

  const grow = applyOperation(model, {
    type: 'grow',
    targetLayerId: 'base',
    thickness: 1,
    face: 'front',
    area: fullFaceGeometry(model),
    growth: 'direct',
  });
  assert.equal(grow.changed, false);
  assert.match(grow.error, /not exposed/);
});


test('fully etched empty-material state remains a valid persisted project', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  applyOperation(model, {
    type: 'etch',
    thickness: 20,
    face: 'front',
    area: fullFaceGeometry(model),
  });

  const project = {
    format: 'WaferCAD-vector',
    version: 5,
    name: 'empty-material',
    model,
    layout: createEmptyLayout(),
    selectedLayerKeys: [],
    activeCell: null,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    roi: null,
    roiAnchor: 'center',
    section: { a: [-5, 0], b: [5, 0] },
    planViews: {
      mask: { zoom: 1, panX: 0, panY: 0 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      customStructurePalette: null,
      threeOpacity: 1,
      threeShowBorders: false,
      sectionScaleMode: 'auto',
    },
    snapshots: [],
  };

  const stored = JSON.parse(serializeProject(project));
  assert.equal(stored.model.regions.length, 0);
  assert.equal(stored.name, 'empty-material');
});
