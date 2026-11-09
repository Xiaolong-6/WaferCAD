import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { scanlineTriangulatePolygon } from '../scanline-triangulation.js';
import { triangulatePolygon } from '../polygon-triangulation.js';

function square(x, y, size) {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}
function area(triangle) {
  const [a, b, c] = triangle;
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}
function covers(triangles, [x, y]) {
  return triangles.some(([a, b, c]) => {
    const cross = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const v = [cross(a, b), cross(b, c), cross(c, a)];
    return v.every((n) => n >= -1e-8) || v.every((n) => n <= 1e-8);
  });
}

test('exact scanline triangulation preserves a large grid of Mask holes', () => {
  const polygon = [square(0, 0, 210)];
  for (let row = 0; row < 40; row++)
    for (let col = 0; col < 40; col++) polygon.push(square(5 + col * 5, 5 + row * 5, 3));
  const original = structuredClone(polygon);
  const triangles = triangulatePolygon(THREE, polygon);
  assert.ok(triangles.length > 0 && triangles.length < 100000);
  const expected = 210 * 210 - 40 * 40 * 9;
  const obtained = triangles.reduce((sum, t) => sum + area(t), 0);
  assert.ok(Math.abs(obtained - expected) <= expected * 1e-6);
  assert.equal(covers(triangles, [6.5, 6.5]), false, 'Interior of a real hole remains empty');
  assert.equal(covers(triangles, [3, 3]), true, 'Substrate material remains filled');
  assert.deepEqual(polygon, original, 'Source polygon and hole rings are immutable');
});

test('scanline rejects incompatible polygon geometry without introducing bad triangles', () => {
  const large = [square(0, 0, 100)];
  for (let i = 0; i < 1600; i++) large.push(square(10, 10, 3));
  assert.equal(
    scanlineTriangulatePolygon(large),
    null,
    'Overlapping holes cannot pass area parity',
  );
  assert.equal(
    scanlineTriangulatePolygon([square(0, 0, 100)]),
    null,
    'Small polygons use existing path',
  );
});
