import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAdditiveMaskPolygons, appendUnionMaskPolygons } from '../mask-additive-path.js';

function recorder() {
  const calls = [];
  return {
    calls,
    moveTo: (...args) => calls.push(['move', ...args]),
    lineTo: (...args) => calls.push(['line', ...args]),
    closePath: () => calls.push(['close']),
  };
}

test('opposite GDS polygon windings become additive without modifying vertices', () => {
  const a = {
    kind: 'polygon',
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  };
  const b = {
    kind: 'polygon',
    points: [
      [15, 10],
      [15, 0],
      [5, 0],
      [5, 10],
    ],
  };
  const before = JSON.stringify([a, b]);
  const ctx = recorder();
  assert.equal(
    appendAdditiveMaskPolygons(ctx, [a, b], (point) => point),
    2,
  );
  const subpaths = [];
  let path = [];
  for (const call of ctx.calls) {
    if (call[0] === 'move') path = [[call[1], call[2]]];
    if (call[0] === 'line') path.push([call[1], call[2]]);
    if (call[0] === 'close') subpaths.push(path);
  }
  assert.equal(subpaths.length, 2);
  const signedArea2 = (points) =>
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0);
  assert.ok(subpaths.every((points) => signedArea2(points) > 0));
  assert.equal(JSON.stringify([a, b]), before);
});

test('skips paths and preserves 1 um rectangles', () => {
  const narrow = {
    kind: 'polygon',
    points: [
      [0, 0],
      [100, 0],
      [100, 1],
      [0, 1],
    ],
  };
  const ctx = recorder();
  assert.equal(
    appendAdditiveMaskPolygons(
      ctx,
      [
        {
          kind: 'path',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
        narrow,
      ],
      ([x, y]) => [x * 2, y * 2],
    ),
    1,
  );
  assert.deepEqual(ctx.calls[0], ['move', 0, 0]);
  assert.deepEqual(ctx.calls[2], ['line', 200, 2]);
  assert.equal(narrow.points[2][1], 1);
});

test('entire layer is one path and no per-polygon stroke or fill is emitted', () => {
  const ctx = recorder();
  const rectangles = Array.from({ length: 300 }, (_, i) => ({
    kind: 'polygon',
    points: [
      [i, 0],
      [i + 2, 0],
      [i + 2, 1],
      [i, 1],
    ],
  }));
  assert.equal(
    appendAdditiveMaskPolygons(ctx, rectangles, (point) => point),
    300,
  );
  assert.equal(ctx.calls.filter((c) => c[0] === 'close').length, 300);
  assert.equal(ctx.calls.length, 300 * 5);
});


test('premerged display silhouette traces exterior and real hole without source edits', () => {
  const shape = [[
    [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
    [[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]],
  ]];
  const before = JSON.stringify(shape);
  const ctx = recorder();
  assert.equal(appendUnionMaskPolygons(ctx, shape, ([x, y]) => [x * 2, y * 2]), 2);
  assert.equal(ctx.calls.filter((step) => step[0] === 'close').length, 2);
  assert.deepEqual(ctx.calls[0], ['move', 0, 0]);
  assert.ok(ctx.calls.some((step) => step[0] === 'move' && step[1] === 10 && step[2] === 10));
  assert.equal(JSON.stringify(shape), before);
});

test('empty silhouette renders no subpaths', () => {
  const ctx = recorder();
  assert.equal(appendUnionMaskPolygons(ctx, [], (point) => point), 0);
  assert.deepEqual(ctx.calls, []);
});
