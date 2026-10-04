import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { roughMeshDataFromPreparedCap } = await import('../rough-mesh-geometry.js');
const { prepareMorphologyExportTasks } = await import('../morphology-mesh-policy.js');

class Vector2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

const THREE = {
  Vector2,
  ShapeUtils: {
    triangulateShape(outer, holes) {
      assert.equal(holes.length, 0);
      assert.equal(outer.length, 4);
      return [
        [0, 1, 2],
        [0, 2, 3],
      ];
    },
  },
};

const square = [
  [
    [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ],
  ],
];

test('morphology export policy creates deterministic detailed Pyramid mesh data', () => {
  const cap = {
      z: 0,
      normal: 1,
      profileNormal: 1,
      polys: square,
      appearance: {
        kind: 'rough',
        morphology: 'pyramid',
        polarity: 'normal',
        featureSize: 2,
        meanHeight: 1,
        etchDepth: 1,
        featureCv: 0.3,
        heightCv: 0.2,
        seed: 2018,
      },
    },
    tasks = prepareMorphologyExportTasks(THREE, [cap], { totalTriangleBudget: 120000 });

  assert.equal(tasks.length, 1);
  assert.ok(tasks[0].lodZones.length >= 4);
  assert.ok(tasks[0].lodZones.every((zone) => zone.triangleBudget >= zone.baseTriangles.length));

  const first = roughMeshDataFromPreparedCap({
      ...cap,
      closeToIdeal: true,
      lodZones: tasks[0].lodZones,
    }),
    second = roughMeshDataFromPreparedCap({
      ...cap,
      closeToIdeal: true,
      lodZones: tasks[0].lodZones,
    });

  assert.deepEqual([...first.positions], [...second.positions]);
  assert.deepEqual([...first.normals], [...second.normals]);
  assert.ok(first.positions.length > 0);
  assert.equal(first.positions.length, first.normals.length);

  const zValues = [];
  for (let index = 2; index < first.positions.length; index += 3) zValues.push(first.positions[index]);
  assert.ok(Math.max(...zValues) > Math.min(...zValues) + 0.1);
  assert.ok(first.metadata.roughSubdivisionDepth > 0);
});

test('morphology export triangle budget is shared across multiple rough caps', () => {
  const appearance = {
      kind: 'rough',
      morphology: 'stochastic',
      polarity: 'inverted',
      featureSize: 1.5,
      meanHeight: 0.5,
      etchDepth: 0.5,
      featureCv: 0.2,
      heightCv: 0.2,
      seed: 42,
    },
    tasks = prepareMorphologyExportTasks(
      THREE,
      [
        { z: 0, normal: 1, profileNormal: 1, polys: square, appearance },
        { z: -3, normal: -1, profileNormal: -1, polys: square, appearance },
      ],
      { totalTriangleBudget: 80000 },
    ),
    allocated = tasks.flatMap((task) => task.lodZones).reduce(
      (sum, zone) => sum + Number(zone.triangleBudget || 0),
      0,
    );

  assert.equal(tasks.length, 2);
  assert.ok(allocated <= 80000);
});
