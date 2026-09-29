import assert from 'node:assert/strict';
import test from 'node:test';

import {
  circleRoiFromAnchor,
  normalizeRoi,
  rectRoiFromAnchor,
  roiAnchorPoint,
  roiContainsPoint,
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
