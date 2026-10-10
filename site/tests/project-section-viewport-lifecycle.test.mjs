import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Model imports the strict polygon kernel at module initialization. Install the
// same vendored kernel bootstrap used by project-file.test.mjs BEFORE importing.
const vendor = readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8');
const cjs = { exports: {} };
new Function('module', 'exports', vendor)(cjs, cjs.exports);
globalThis.polygonClipping = cjs.exports;
const { createModel } = await import('../model.js');
const { createEmptyLayout, createProjectStateController } =
  await import('../controllers/project-state-controller.js');

function setup() {
  let state = {
    model: createModel({ shape: 'rect', width: 200, height: 100, thickness: 8 }),
    layout: createEmptyLayout(),
    projectName: 'Viewport lifecycle',
    processRecipe: null,
    selectedLayerKeys: new Set(),
    activeCell: null,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    maskRoi: null,
    maskRoiAnchor: 'center',
    activeFace: 'front',
    roi: null,
    roiAnchor: 'center',
    section: { a: [-50, 0], b: [50, 0] },
    sectionScaleMode: 'physical',
    sectionViewport: { zoom: 2.5, panX: -37, panY: 62 },
    sectionShowBorders: false,
    sectionCollapse: null,
    sectionDetailRoi: null,
    planViews: {
      main: { zoom: 1, panX: 0, panY: 0 },
      mask: { zoom: 1, panX: 0, panY: 0 },
    },
    xyDisplayUnit: 'um',
    activeStructurePalette: 'balanced',
    customStructurePalette: null,
    maskOpacity: 0.65,
    threeOpacity: 1,
    threeShowBorders: false,
    threeFastMode: true,
    threeCamera: null,
  };
  const controller = createProjectStateController({
    ensureHierarchy() {},
    getState: () => state,
    applyState: (next) => {
      state = { ...state, ...next };
    },
    setSectionEditEnabled() {},
  });
  return {
    controller,
    getState: () => state,
    setState: (next) => {
      state = { ...state, ...next };
    },
  };
}

test('Section viewport survives the exact project snapshot build/load path', () => {
  const fixture = setup();
  const saved = fixture.controller.buildProjectSnapshot(false);
  assert.deepEqual(saved.display.sectionViewport, { zoom: 2.5, panX: -37, panY: 62 });
  fixture.setState({ sectionViewport: { zoom: 1, panX: 0, panY: 0 } });
  fixture.controller.loadProjectSnapshot(saved);
  assert.deepEqual(fixture.getState().sectionViewport, { zoom: 2.5, panX: -37, panY: 62 });
});

test('legacy projects lacking Section viewport explicitly reset previous framing', () => {
  const fixture = setup();
  const legacy = fixture.controller.buildProjectSnapshot(false);
  delete legacy.display.sectionViewport;
  fixture.controller.loadProjectSnapshot(legacy);
  assert.deepEqual(fixture.getState().sectionViewport, { zoom: 1, panX: 0, panY: 0 });
});

test('new Base/project reset clears Section viewport without changing physical geometry units', () => {
  const fixture = setup();
  fixture.controller.resetProjectState();
  const after = fixture.getState();
  assert.deepEqual(after.sectionViewport, { zoom: 1, panX: 0, panY: 0 });
  assert.equal(after.model.units.xy, 'µm');
  assert.equal(after.model.units.z, 'µm');
  assert.equal(after.sectionScaleMode, 'auto');
});
