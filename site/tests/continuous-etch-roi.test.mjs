import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { continuousRectRoiBounds, continuousRectRoiPlanes } =
  await import('../continuous-etch-roi.js');
const { buildContinuousRectRoiCaps } = await import('../continuous-etch-roi-cap.js');
const { attachContinuousEtchModel, continuousEtchDisplayCollapse } =
  await import('../continuous-etch-model.js');
const { continuousSectionContours } = await import('../continuous-etch-section.js');
const { expandProjectStorage } = await import('../project-io.js');
const { resolveSectionCollapse } = await import('../section-z-collapse.js');
const { setLayerVisible } = await import('../model.js');

const project = expandProjectStorage(
  JSON.parse(
    readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
  ),
);
const predecessor = project.snapshots.find((step) => step.id === 'snapshot-microdisk-07')?.state
  ?.model;
const rect = [
  [
    [
      [-170, 0],
      [170, 0],
      [170, 75],
      [-170, 75],
      [-170, 0],
    ],
  ],
];
function model() {
  return attachContinuousEtchModel(predecessor, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
}

test('Continuous ROI retains physical rectangular bounds and clips precisely', () => {
  const before = JSON.stringify(rect);
  assert.deepEqual(continuousRectRoiBounds(rect), {
    minX: -170,
    minY: 0,
    maxX: 170,
    maxY: 75,
  });
  assert.equal(continuousRectRoiBounds(null), null);
  const planes = continuousRectRoiPlanes(THREE, rect);
  assert.equal(planes.length, 4);
  const visible = (xyz) => planes.every((plane) => plane.normal.dot(xyz) <= plane.constant);
  assert.equal(visible(new THREE.Vector3(0, 25, 0)), true);
  assert.equal(visible(new THREE.Vector3(170, 75, 33)), true);
  for (const point of [
    [171, 30, 0],
    [-171, 30, 0],
    [0, -1, 0],
    [0, 76, 0],
  ])
    assert.equal(visible(new THREE.Vector3(...point)), false);
  assert.equal(JSON.stringify(rect), before, 'ROI is derived presentation only');
});

test('Continuous ROI rejects unsupported shapes rather than presenting a false crop', () => {
  for (const invalid of [
    [],
    [[], []],
    [
      [
        [
          [0, 0],
          [20, 0],
          [10, 10],
          [0, 0],
        ],
      ],
    ],
    [
      [
        [
          [0, 0],
          [20, 0],
          [20, 10],
          [10, 8],
          [0, 0],
        ],
      ],
    ],
    [
      [
        [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [5, 3],
          [3, 3],
        ],
      ],
    ],
  ])
    assert.throws(() => continuousRectRoiBounds(invalid), RangeError);
});

test('Real Microdisk ROI 3D cut faces follow the same continuous Section material', () => {
  const device = model();
  const before = JSON.stringify(device);
  const parts = buildContinuousRectRoiCaps(THREE, device, continuousRectRoiBounds(rect));
  assert.deepEqual(parts.map((p) => p.layerId).sort(), ['base', 'layer-1']);
  for (const part of parts) {
    assert.ok(part.triangles > 0 && part.triangles < 100000);
    assert.equal(part.positions.length, part.normals.length);
    for (let i = 0; i < part.positions.length; i += 3) {
      const x = part.positions[i],
        y = part.positions[i + 1],
        z = part.positions[i + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(x >= -170.00001 && x <= 170.00001);
      assert.ok(y >= -0.00001 && y <= 75.00001);
      assert.ok(z >= -40.001 && z <= 41.801);
      assert.ok(
        Math.min(Math.abs(x + 170), Math.abs(x - 170), Math.abs(y), Math.abs(y - 75)) < 0.00001,
        'No artificial interior cap surfaces',
      );
    }
  }
  assert.equal(JSON.stringify(device), before, 'Rendering must not alter scientific owner');
});

test('Continuous release Section uses physical Z and current layer visibility', () => {
  const device = model();
  const requested = { enabled: true, top: 37, bottom: -37 };
  const effective = resolveSectionCollapse(
    continuousEtchDisplayCollapse(device, requested),
    device,
    [-40, 41.8],
  );
  assert.equal(effective.enabled, false, 'Do not hide a release curvature behind Z Break');
  assert.equal(
    continuousEtchDisplayCollapse(device, { ...requested, continuousEtchExplicit: true }).enabled,
    true,
    'Explicitly requested continuous Z collapse remains permitted',
  );
  const visible = continuousSectionContours(device, [-170, 0], [170, 0]);
  assert.deepEqual(visible.map((item) => item.layerId).sort(), ['base', 'layer-1']);
  setLayerVisible(device, 'base', false);
  const hidden = continuousSectionContours(device, [-170, 0], [170, 0]);
  assert.deepEqual(
    hidden.map((item) => item.layerId),
    ['layer-1'],
  );
});
