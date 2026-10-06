import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkspaceViewState,
  captureWorkspaceStructuralIdentity,
  extractWorkspaceViewState,
  workspaceStructuralIdentityEqual,
} from '../workspace-dirty-domains.js';

function projectFixture() {
  const model = { revision: 4, processRevision: 3 },
    elements = [{ layer: 1 }],
    linework = [],
    bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
    combos = [],
    hierarchy = {},
    units = { xy: 'µm' };
  return {
    format: 'WaferCAD-vector',
    version: 14,
    model,
    layout: { name: 'mask', root: 'TOP', elements, linework, bounds, combos, hierarchy, units },
    selectedLayerKeys: ['1|0'],
    activeCell: 'TOP',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    maskRoi: null,
    maskRoiAnchor: 'center',
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
      maskOpacity: 0.65,
      threeOpacity: 1,
      threeShowBorders: false,
      threeCamera: null,
      sectionScaleMode: 'auto',
      sectionShowBorders: false,
      sectionCollapse: null,
      sectionDetailRoi: null,
    },
  };
}

function identity(project, historyToken = '0') {
  return captureWorkspaceStructuralIdentity(project, {
    projectName: 'Fixture',
    historyToken,
  });
}

test('camera, plan zoom, working selections, Section inspection and display toggles stay view-only', () => {
  const project = projectFixture(),
    before = identity(project);

  project.selectedLayerKeys = ['7|1'];
  project.activeCell = 'DEVICE';
  project.maskTransform = { x: 5, y: -3, scale: 0.8, rotation: 12 };
  project.maskSourceMode = 'draw';
  project.maskRoi = { type: 'circle', c: [0, 0], r: 2 };
  project.maskRoiAnchor = 'corner';
  project.planViews.main = { zoom: 4, panX: 120, panY: -40 };
  project.section = { a: [-2, 1], b: [3, -1] };
  project.activeFace = 'back';
  project.roi = { type: 'rect', a: [-1, -1], b: [1, 1] };
  project.roiAnchor = 'corner';
  project.display.maskOpacity = 0.25;
  project.display.threeOpacity = 0.55;
  project.display.threeShowBorders = true;
  project.display.threeCamera = {
    position: [12, -8, 5],
    target: [0, 0, 0],
    up: [0, 0, 1],
  };
  project.display.sectionScaleMode = 'physical';
  project.display.sectionShowBorders = true;
  project.display.sectionCollapse = { top: 2, bottom: -2, enabled: true };
  project.display.sectionDetailRoi = { x: 0.2, y: 0.2, width: 0.3, height: 0.3, shape: 'rect' };

  assert.equal(workspaceStructuralIdentityEqual(before, identity(project)), true);
});

test('process, mask geometry, alignment, project and History changes are structural', () => {
  const base = projectFixture(),
    before = identity(base);

  const cases = [
    (project) => {
      project.model.revision += 1;
    },
    (project) => {
      project.layout.elements = [...project.layout.elements, { layer: 2 }];
    },
    (project) => {
      project.drawMask = { nextShapeId: 2, shapes: [{ id: 1, type: 'circle', c: [0, 0], r: 2 }] };
    },
  ];

  for (const mutate of cases) {
    const project = projectFixture();
    mutate(project);
    assert.equal(workspaceStructuralIdentityEqual(before, identity(project)), false);
  }

  assert.equal(
    workspaceStructuralIdentityEqual(before, captureWorkspaceStructuralIdentity(base, {
      projectName: 'Renamed',
      historyToken: '0',
    })),
    false,
  );
  assert.equal(workspaceStructuralIdentityEqual(before, identity(base, '1')), false);
});

test('lightweight view state round-trips without structural geometry', () => {
  const source = projectFixture();
  source.selectedLayerKeys = ['2|0', '4|1'];
  source.activeCell = 'DEVICE';
  source.maskTransform = { x: 7, y: 9, scale: 1.25, rotation: -18 };
  source.maskSourceMode = 'draw';
  source.maskRoi = { type: 'circle', c: [1, 2], r: 3 };
  source.maskRoiAnchor = 'corner';
  source.activeFace = 'back';
  source.roi = { type: 'rect', a: [-2, -1], b: [2, 1] };
  source.roiAnchor = 'corner';
  source.planViews.mask.zoom = 7;
  source.planViews.mask.panX = 81;
  source.display.maskOpacity = 0.3;
  source.display.threeOpacity = 0.45;
  source.display.threeShowBorders = true;
  source.display.threeCamera = {
    position: [3, 4, 5],
    target: [1, 2, 0],
    up: [0, 0, 1],
  };
  source.display.sectionCollapse = { top: 5, bottom: -4, enabled: true };

  const view = extractWorkspaceViewState(source),
    target = projectFixture(),
    originalModel = target.model,
    originalElements = target.layout.elements;

  assert.equal(applyWorkspaceViewState(target, view), true);
  assert.deepEqual(target.selectedLayerKeys, source.selectedLayerKeys);
  assert.equal(target.activeCell, 'DEVICE');
  assert.deepEqual(target.maskTransform, source.maskTransform);
  assert.equal(target.maskSourceMode, 'draw');
  assert.deepEqual(target.maskRoi, source.maskRoi);
  assert.equal(target.maskRoiAnchor, 'corner');
  assert.equal(target.activeFace, 'back');
  assert.deepEqual(target.roi, source.roi);
  assert.equal(target.roiAnchor, 'corner');
  assert.equal(target.planViews.mask.zoom, 7);
  assert.equal(target.planViews.mask.panX, 81);
  assert.equal(target.display.maskOpacity, 0.3);
  assert.equal(target.display.threeOpacity, 0.45);
  assert.equal(target.display.threeShowBorders, true);
  assert.deepEqual(target.display.threeCamera, source.display.threeCamera);
  assert.deepEqual(target.display.sectionCollapse, source.display.sectionCollapse);
  assert.equal(target.model, originalModel);
  assert.equal(target.layout.elements, originalElements);
});
