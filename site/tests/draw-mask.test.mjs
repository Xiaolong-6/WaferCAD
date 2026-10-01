import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const {
  allocateDrawShapeId,
  createEmptyDrawMask,
  drawMaskGeometry,
  drawShapeContainsPoint,
  drawShapeGeometry,
  normalizeDrawMask,
  resizeDrawShape,
  translateDrawShape,
} = await import('../draw-mask-geometry.js');

test('Draw mask normalizes Rect, Circle and Polygon geometry', () => {
  const mask = normalizeDrawMask({
    nextShapeId: 4,
    shapes: [
      { id: 'shape-1', type: 'rect', a: [5, 4], b: [-5, -4] },
      { id: 'shape-2', type: 'circle', c: [10, 0], r: 3 },
      {
        id: 'shape-3',
        type: 'polygon',
        points: [
          [0, 0],
          [4, 0],
          [0, 4],
        ],
      },
    ],
  });

  assert.deepEqual(mask.shapes[0].a, [-5, -4]);
  assert.deepEqual(mask.shapes[0].b, [5, 4]);
  assert.equal(mask.shapes[1].r, 3);
  assert.equal(mask.shapes[2].points.length, 3);
  assert.equal(mask.nextShapeId, 4);
  assert.ok(drawShapeGeometry(mask.shapes[0]).length);
  assert.ok(drawShapeGeometry(mask.shapes[1]).length);
  assert.ok(drawShapeGeometry(mask.shapes[2]).length);
});

test('Draw mask unions overlapping temporary shapes', () => {
  const geometry = drawMaskGeometry({
    nextShapeId: 3,
    shapes: [
      { id: 'shape-1', type: 'rect', a: [-5, -5], b: [2, 5] },
      { id: 'shape-2', type: 'rect', a: [-2, -5], b: [5, 5] },
    ],
  });

  assert.ok(geometry.length > 0);
  assert.equal(drawShapeContainsPoint({ id: 'shape-1', type: 'rect', a: [-5, -5], b: [2, 5] }, [0, 0]), true);
  assert.equal(drawShapeContainsPoint({ id: 'shape-1', type: 'rect', a: [-5, -5], b: [2, 5] }, [4, 0]), false);
});

test('Draw shapes remain editable after creation', () => {
  const rect = { id: 'shape-1', type: 'rect', a: [-2, -1], b: [2, 1] };
  const moved = translateDrawShape(rect, 3, -4);
  assert.deepEqual(moved.a, [1, -5]);
  assert.deepEqual(moved.b, [5, -3]);

  const resized = resizeDrawShape(rect, 'se', [6, 4]);
  assert.deepEqual(resized.a, [-2, -1]);
  assert.deepEqual(resized.b, [6, 4]);

  const circle = { id: 'shape-2', type: 'circle', c: [0, 0], r: 2 };
  assert.equal(resizeDrawShape(circle, 'radius', [3, 4]).r, 5);

  const polygon = {
    id: 'shape-3',
    type: 'polygon',
    points: [
      [0, 0],
      [3, 0],
      [0, 3],
    ],
  };
  assert.deepEqual(resizeDrawShape(polygon, 'v1', [5, 1]).points[1], [5, 1]);
});

test('Draw shape IDs are monotonic and survive normalization', () => {
  const empty = createEmptyDrawMask();
  const first = allocateDrawShapeId(empty);
  assert.equal(first.id, 'shape-1');
  assert.equal(first.nextShapeId, 2);

  const normalized = normalizeDrawMask({
    nextShapeId: 1,
    shapes: [{ id: 'shape-7', type: 'circle', c: [0, 0], r: 1 }],
  });
  assert.equal(normalized.nextShapeId, 8);
});
