import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { createModel } = await import('../model.js');
const { createSelectionGeometry } = await import('../selection-geometry.js');
const {
  drawShapeMayIntersectRoi,
  maskElementMayDefineArea,
  maskElementMayIntersectRoi,
  maskRoiLocalBounds,
} = await import('../mask-roi-culling.js');
const { maskRoiWorldGeometry, maskLocalToWorld } = await import('../mask-roi-geometry.js');
const { difference, intersection, isEmpty, rectMulti } =
  await import('../vector-geometry.js');

function polygon(x, y, width = 1) {
  return {
    kind: 'polygon',
    layer: 1,
    datatype: 0,
    points: rectMulti(width, width, x, y)[0][0].slice(0, -1),
  };
}

function makeSelection({ elements, roi, transform = { x: 0, y: 0, scale: 1, rotation: 0 } }) {
  const model = createModel({ shape: 'rect', width: 40, height: 40, thickness: 2 });
  const state = {
    model,
    maskSourceMode: 'file',
    layout: { elements },
    maskRoi: roi,
    maskTransform: transform,
  };
  let visitedPoints = 0;
  const selection = createSelectionGeometry({
    getState: () => state,
    selectedElement: (element) => element.layer === 1,
    maskPoint: (point) => {
      visitedPoints++;
      return maskLocalToWorld(point, transform);
    },
  });
  return { model, state, selection, visits: () => visitedPoints };
}

function samePhysicalArea(actual, expected, description) {
  assert.equal(isEmpty(difference(actual, expected)), true, description + ' missing area');
  assert.equal(isEmpty(difference(expected, actual)), true, description + ' extra area');
}

test('conservative local ROI bounds retain rotated-square corners and path width', () => {
  const bounds = maskRoiLocalBounds({ type: 'square', c: [1, 2], size: 4, rotation: 45 });
  assert.ok(Math.abs(bounds.minX - (1 - Math.SQRT2 * 2)) < 1e-12);
  assert.ok(Math.abs(bounds.maxY - (2 + Math.SQRT2 * 2)) < 1e-12);
  assert.equal(maskElementMayIntersectRoi(polygon(50, 50), bounds), false);
  assert.equal(maskElementMayIntersectRoi(polygon(0, 2), bounds), true);
  assert.equal(
    maskElementMayIntersectRoi(
      { kind: 'path', width: 0.6, points: [[bounds.maxX + 0.1, 1], [bounds.maxX + 0.1, 3]] },
      bounds,
    ),
    true,
    'a path can overlap the ROI even when its centerline does not',
  );
  assert.equal(maskElementMayDefineArea({ kind: 'path', width: 0, points: [[0, 0], [1, 1]] }), false);
  assert.equal(
    drawShapeMayIntersectRoi({ type: 'ring-sector', c: [20, 20], innerR: 1, outerR: 2 }, bounds),
    false,
  );
  assert.equal(
    drawShapeMayIntersectRoi({ type: 'circle', c: [0, 0], r: 5 }, bounds),
    true,
  );
});

test('File Mask ROI eliminates outside polygon transformations before union', () => {
  const roi = { type: 'square', c: [0, 0], size: 2, rotation: 0 };
  const elements = [
    ...Array.from({ length: 1200 }, (_, i) => polygon(7 + (i % 25) / 10, 7 + Math.floor(i / 25) / 10, 0.04)),
    polygon(0, 0),
  ];
  const { model, selection, visits } = makeSelection({ elements, roi });
  const domain = intersection(model.boundary, maskRoiWorldGeometry(roi));
  const center = rectMulti(1, 1);
  samePhysicalArea(selection.operationAreaGeometry('mask'), center, 'selected');
  assert.equal(visits(), 4, 'only the in-ROI polygon may reach the expensive transform/union path');
  samePhysicalArea(
    selection.operationAreaGeometry('invert'),
    difference(domain, center),
    'invert',
  );
  samePhysicalArea(selection.operationAreaGeometry('full'), domain, 'full');
});

test('existing File mask wholly outside the ROI inverts to its entire process domain', () => {
  const roi = { type: 'circle', c: [0, 0], r: 2 };
  const { model, state, selection, visits } = makeSelection({ elements: [polygon(10, 10)], roi });
  const domain = intersection(model.boundary, maskRoiWorldGeometry(roi));
  assert.deepEqual(selection.operationAreaGeometry('mask'), []);
  assert.equal(visits(), 0);
  samePhysicalArea(selection.operationAreaGeometry('invert'), domain, 'empty local candidates');
  state.layout.elements = [{ kind: 'path', layer: 1, width: 0, points: [[10, 10], [11, 11]] }];
  assert.deepEqual(selection.operationAreaGeometry('invert'), [], 'truly empty operable source');
});

test('Mask alignment does not move ROI filtering into world-coordinate input space', () => {
  const roi = { type: 'square', c: [0, 0], size: 2, rotation: 24 };
  const transform = { x: 3, y: -2, scale: 1.5, rotation: 31 };
  const { model, selection, visits } = makeSelection({
    elements: [polygon(100, 100), polygon(0, 0)],
    roi,
    transform,
  });
  const worldSquare = maskRoiWorldGeometry(roi, transform);
  const selected = selection.operationAreaGeometry('mask');
  const center = [polygon(0, 0)].map((shape) => [
    [shape.points.map((point) => maskLocalToWorld(point, transform))],
  ]);
  samePhysicalArea(selected, intersection(intersection(center, model.boundary), worldSquare), 'transformed');
  assert.equal(visits(), 4);
});
