import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;
import { triangulatePolygon } from '../polygon-triangulation.js';

function circularRing(radius, segments, clockwise = false) {
  const ring = [];
  for (let index = 0; index < segments; index++) {
    const step = (Math.PI * 2 * index) / segments,
      angle = Math.PI + (clockwise ? -step : step);
    ring.push([
      Number((radius * Math.cos(angle)).toFixed(4)),
      Number((radius * Math.sin(angle)).toFixed(4)),
    ]);
  }
  ring.push([...ring[0]]);
  return ring;
}

function ringArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index],
      b = ring[index + 1];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea) / 2;
}

function triangleArea([a, b, c]) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

test('validated triangulation preserves wafer-scale thin annuli', () => {
  const polygon = [circularRing(3100, 96), circularRing(3099.95, 96, true)],
    expected = ringArea(polygon[0]) - ringArea(polygon[1]),
    rawRings = polygon.map((ring) => ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))),
    rawPoints = rawRings.flat(),
    rawTriangles = THREE.ShapeUtils.triangulateShape(rawRings[0], rawRings.slice(1)).map((face) =>
      face.map((index) => [rawPoints[index].x, rawPoints[index].y]),
    ),
    rawArea = rawTriangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0),
    triangles = triangulatePolygon(THREE, polygon),
    actual = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);

  assert.ok(rawArea > expected * 100, 'fixture must reproduce the thin-annulus Earcut failure');
  assert.ok(triangles.length > 0);
  assert.ok(Math.abs(actual - expected) <= expected * 1e-8);
});

test('validated triangulation keeps ordinary solid caps unchanged', () => {
  const polygon = [
      [
        [-2, -1],
        [2, -1],
        [2, 1],
        [-2, 1],
        [-2, -1],
      ],
    ],
    triangles = triangulatePolygon(THREE, polygon),
    actual = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);

  assert.equal(triangles.length, 2);
  assert.ok(Math.abs(actual - 8) < 1e-12);
});

test('validated triangulation drops sub-grid degenerate cap slivers', () => {
  const polygon = [
    [
      [0, 0],
      [1e-10, 0],
      [1e-10, 1],
      [0, 1],
      [0, 0],
    ],
  ];
  assert.deepEqual(triangulatePolygon(THREE, polygon), []);
});

test('validated triangulation slab-falls back for clipped multi-hole metal caps', () => {
  const polygon = [
      [
        [-6, -4],
        [6, -4],
        [6, -1],
        [4, -1],
        [4, 1],
        [6, 1],
        [6, 4],
        [-6, 4],
        [-6, 1],
        [-4, 1],
        [-4, -1],
        [-6, -1],
        [-6, -4],
      ],
      [
        [-3.5, -2.5],
        [-1.5, -2.5],
        [-1.5, 2.5],
        [-3.5, 2.5],
        [-3.5, -2.5],
      ],
      [
        [1.5, -2.5],
        [3.5, -2.5],
        [3.5, 2.5],
        [1.5, 2.5],
        [1.5, -2.5],
      ],
    ],
    expected = ringArea(polygon[0]) - ringArea(polygon[1]) - ringArea(polygon[2]),
    forced = {
      Vector2: THREE.Vector2,
      ShapeUtils: {
        triangulateShape(contour, holes) {
          if (holes.length >= 2) return [[0, 1, 2]];
          return THREE.ShapeUtils.triangulateShape(contour, holes);
        },
      },
    },
    triangles = triangulatePolygon(forced, polygon),
    actual = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);

  assert.ok(triangles.length > 0);
  assert.ok(Math.abs(actual - expected) <= expected * 1e-8);
});

test('validated triangulation ignores repeated boolean corner vertices', () => {
  const polygon = [
      [
        [-5, -5],
        [-5, -5],
        [5, -5],
        [5, -5],
        [5, 5],
        [5, 5],
        [-5, 5],
        [-5, 5],
        [-5, -5],
      ],
      [
        [-4.9, -4.9],
        [-4.9, 4.9],
        [4.9, 4.9],
        [4.9, -4.9],
        [-4.9, -4.9],
      ],
    ],
    expected = ringArea(polygon[0]) - ringArea(polygon[1]),
    triangles = triangulatePolygon(THREE, polygon),
    actual = triangles.reduce((sum, triangle) => sum + triangleArea(triangle), 0);

  assert.ok(triangles.length > 0);
  assert.ok(Math.abs(actual - expected) <= expected * 1e-8);
});
