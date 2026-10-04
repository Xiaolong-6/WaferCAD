import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSectionDetailRoi,
  sectionDetailRoiFromPoints,
  translateSectionDetailRoi,
} from '../section-detail-roi.js';

test('normalizes a section detail ROI into the canvas', () => {
  assert.deepEqual(
    normalizeSectionDetailRoi({
      x: 0.9,
      y: -0.2,
      width: 0.4,
      height: 0.01,
      shape: 'circle',
    }),
    {
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.025,
      shape: 'circle',
    },
  );
});

test('creates a ROI from drag points regardless of drag direction', () => {
  assert.deepEqual(
    sectionDetailRoiFromPoints({ x: 0.7, y: 0.8 }, { x: 0.2, y: 0.3 }),
    {
      x: 0.2,
      y: 0.3,
      width: 0.5,
      height: 0.5,
      shape: 'rect',
    },
  );
});

test('moves a ROI while keeping it within the canvas', () => {
  assert.deepEqual(
    translateSectionDetailRoi(
      { x: 0.7, y: 0.6, width: 0.25, height: 0.3, shape: 'rect' },
      0.2,
      0.2,
    ),
    {
      x: 0.75,
      y: 0.7,
      width: 0.25,
      height: 0.3,
      shape: 'rect',
    },
  );
});
