import assert from 'node:assert/strict';
import test from 'node:test';

import {
  maskLocalToWorld,
  maskRoiAnchorPoint,
  maskRoiContainsPoint,
  maskRoiWorldGeometry,
  maskSquareCorners,
  normalizeMaskRoi,
  resizeMaskRoiFromHandle,
  squareMaskRoiFromAnchor,
  worldToMaskLocal,
} from '../mask-roi-geometry.js';

test('mask-local coordinates follow mask translation, scale and rotation', () => {
  const transform = { x: 10, y: -4, scale: 2, rotation: 30 },
    local = [3, -2],
    world = maskLocalToWorld(local, transform),
    roundTrip = worldToMaskLocal(world, transform);
  assert.ok(Math.abs(roundTrip[0] - local[0]) < 1e-10);
  assert.ok(Math.abs(roundTrip[1] - local[1]) < 1e-10);
});

test('Square ROI keeps size and rotation in mask-local space', () => {
  const square = normalizeMaskRoi({
    type: 'square',
    c: [2, 3],
    size: 4,
    rotation: 30,
  });
  assert.equal(square.type, 'square');
  assert.equal(square.size, 4);
  assert.equal(square.rotation, 30);

  const corners = maskSquareCorners(square);
  for (const point of Object.values(corners)) {
    assert.equal(maskRoiContainsPoint(square, point), true);
    assert.ok(
      Math.abs(Math.hypot(point[0] - square.c[0], point[1] - square.c[1]) - Math.SQRT2 * 2) < 1e-10,
    );
  }

  const anchor = maskRoiAnchorPoint(square, 'top-left'),
    rebuilt = squareMaskRoiFromAnchor(4, 75, 'top-left', anchor[0], anchor[1]);
  assert.ok(Math.abs(maskRoiAnchorPoint(rebuilt, 'top-left')[0] - anchor[0]) < 1e-10);
  assert.ok(Math.abs(maskRoiAnchorPoint(rebuilt, 'top-left')[1] - anchor[1]) < 1e-10);
  assert.equal(rebuilt.rotation, 75);
});

test('rotated Square ROI world geometry follows the mask transform', () => {
  const square = { type: 'square', c: [0, 0], size: 4, rotation: 15 },
    transform = { x: 12, y: -7, scale: 3, rotation: 25 },
    geometry = maskRoiWorldGeometry(square, transform),
    ring = geometry[0][0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring.at(-1));

  const center = maskLocalToWorld(square.c, transform),
    expectedRadius = (square.size * transform.scale * Math.SQRT2) / 2;
  for (const point of ring.slice(0, -1)) {
    assert.ok(
      Math.abs(Math.hypot(point[0] - center[0], point[1] - center[1]) - expectedRadius) < 1e-9,
    );
  }
});

test('resizing a rotated Square preserves rotation and opposite corner', () => {
  const square = { type: 'square', c: [0, 0], size: 4, rotation: 35 },
    fixed = maskSquareCorners(square)['bottom-right'],
    resized = resizeMaskRoiFromHandle(square, 'top-left', [-5, 5]),
    fixedAfter = maskSquareCorners(resized)['bottom-right'];
  assert.equal(resized.rotation, 35);
  assert.ok(Math.abs(fixedAfter[0] - fixed[0]) < 1e-9);
  assert.ok(Math.abs(fixedAfter[1] - fixed[1]) < 1e-9);
  assert.ok(resized.size > 0);
});
