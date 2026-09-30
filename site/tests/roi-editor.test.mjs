import assert from 'node:assert/strict';
import test from 'node:test';

import {
  circleRoiFromAnchor,
  normalizeRoi,
  rectRoiFromAnchor,
  resizeRoiFromHandle,
  roiAnchorPoint,
  roiContainsPoint,
  roiHandlePoints,
  translateRoi,
} from '../roi-editor.js';

const anchors = ['center', 'top-left', 'bottom-left', 'top-right', 'bottom-right'];

test('rectangle anchors preserve the requested position', () => {
  for (const anchor of anchors) {
    const roi = rectRoiFromAnchor(20, 10, anchor, 7, -3);
    assert.deepEqual(roiAnchorPoint(roi, anchor), [7, -3]);
    assert.equal(roi.b[0] - roi.a[0], 20);
    assert.equal(roi.b[1] - roi.a[1], 10);
  }
});

test('circle anchors use the bounding-box corners', () => {
  for (const anchor of anchors) {
    const roi = circleRoiFromAnchor(5, anchor, 9, 4);
    assert.deepEqual(roiAnchorPoint(roi, anchor), [9, 4]);
    assert.equal(roi.r, 5);
  }
});

test('ROI normalization, hit testing, and translation are deterministic', () => {
  const rect = normalizeRoi({ type: 'rect', a: [5, 4], b: [-5, -4] });
  assert.deepEqual(rect, { type: 'rect', a: [-5, -4], b: [5, 4] });
  assert.equal(roiContainsPoint(rect, [0, 0]), true);
  assert.equal(roiContainsPoint(rect, [7, 0]), false);
  assert.deepEqual(translateRoi(rect, 2, 3), {
    type: 'rect',
    a: [-3, -1],
    b: [7, 7],
  });
});

test('ROI exposes four corner handles and resizes from a fixed opposite corner', () => {
  const rect = rectRoiFromAnchor(20, 10, 'center', 0, 0);
  assert.deepEqual(Object.keys(roiHandlePoints(rect)).sort(), [
    'bottom-left',
    'bottom-right',
    'top-left',
    'top-right',
  ]);
  const resizedRect = resizeRoiFromHandle(rect, 'top-left', [-20, 10]);
  assert.deepEqual(roiHandlePoints(resizedRect)['bottom-right'], [10, -5]);
  assert.deepEqual(roiHandlePoints(resizedRect)['top-left'], [-20, 10]);

  const circle = circleRoiFromAnchor(5, 'center', 0, 0);
  const resizedCircle = resizeRoiFromHandle(circle, 'top-left', [-9, 8]);
  assert.deepEqual(roiHandlePoints(resizedCircle)['bottom-right'], [5, -5]);
  assert.equal(resizedCircle.r, 7);
});

test('circle resize follows the pointer when it crosses the opposite corner', () => {
  const roi = circleRoiFromAnchor(0.005, 'center', 0, 0);
  const fixed = roiHandlePoints(roi)['bottom-right'];
  const next = resizeRoiFromHandle(roi, 'top-left', [0.009, -0.01]);
  roiHandlePoints(next)['top-left'].forEach((value, i) =>
    assert.ok(Math.abs(value - fixed[i]) < 1e-15),
  );
  assert.equal(next.r, 0.0025);
  roiHandlePoints(next)['bottom-right'].forEach((value, i) =>
    assert.ok(Math.abs(value - [0.01, -0.01][i]) < 1e-15),
  );
});

test('nm-scale geometry survives every reference-point round trip', () => {
  for (const type of ['rect', 'circle']) {
    const shape =
      type === 'rect'
        ? rectRoiFromAnchor(0.012345, 0.008765, 'center', 0.025123, -0.017456)
        : circleRoiFromAnchor(0.004321, 'center', 0.025123, -0.017456);
    for (const anchor of anchors) {
      const [x, y] = roiAnchorPoint(shape, anchor);
      const next =
        type === 'rect'
          ? rectRoiFromAnchor(shape.b[0] - shape.a[0], shape.b[1] - shape.a[1], anchor, x, y)
          : circleRoiFromAnchor(shape.r, anchor, x, y);
      const expected = type === 'rect' ? [...shape.a, ...shape.b] : [...shape.c, shape.r];
      const actual = type === 'rect' ? [...next.a, ...next.b] : [...next.c, next.r];
      actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-15));
    }
  }
});
