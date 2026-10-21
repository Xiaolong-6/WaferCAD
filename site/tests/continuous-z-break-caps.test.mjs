import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildContinuousZBreakCaps,
  buildContinuousPlanarZBreakCaps,
} from '../continuous-z-break-caps.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
const cube = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
const part = { positions: cube.getAttribute('position').array };
test('continuous Z Break reconstructs watertight horizontal cube sections', () => {
  const caps = buildContinuousZBreakCaps(THREE, [part], { enabled: true, top: 2, bottom: -2 });
  assert.equal(caps.length, 2);
  assert.ok(caps[0].triangles >= 2);
  assert.ok(caps[1].triangles >= 2);
  for (const cap of caps) {
    const z = cap.z;
    assert.ok([...cap.positions].filter((_, i) => i % 3 === 2).every((v) => v === z));
    assert.ok(cap.normals.every(Number.isFinite));
    let projectedArea = 0;
    for (let i = 0; i < cap.positions.length; i += 9) {
      const p = cap.positions;
      const dx1 = p[i + 3] - p[i],
        dy1 = p[i + 4] - p[i + 1];
      const dx2 = p[i + 6] - p[i],
        dy2 = p[i + 7] - p[i + 1];
      projectedArea += (dx1 * dy2 - dy1 * dx2) / 2;
    }
    assert.ok(Math.abs(projectedArea - 100 * (z > 0 ? -1 : 1)) < 1e-4);
  }
});
test('continuous Z Break does not create artificial caps for no intersection', () => {
  const caps = buildContinuousZBreakCaps(THREE, [part], { enabled: true, top: 12, bottom: 11 });
  assert.deepEqual(caps, []);
});
test('Z Break caps fail closed on open triangle contours', () => {
  const tri = { positions: Float32Array.from([0, 0, -5, 10, 0, 5, 0, 10, 5]) };
  assert.throws(
    () => buildContinuousZBreakCaps(THREE, [tri], { enabled: true, top: 1, bottom: -1 }),
    /Open or branched/,
  );
});
test('continuous Z Break preserves hollow cross-section without filling interior hole', () => {
  const shape = new THREE.Shape();
  shape.moveTo(-6, -6);
  shape.lineTo(6, -6);
  shape.lineTo(6, 6);
  shape.lineTo(-6, 6);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 3, 0, 2 * Math.PI, true);
  shape.holes.push(hole);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 10,
    bevelEnabled: false,
    curveSegments: 32,
  }).toNonIndexed();
  const ret = buildContinuousZBreakCaps(
    THREE,
    [{ positions: geom.getAttribute('position').array }],
    { enabled: true, top: 6, bottom: 4 },
  );
  assert.equal(ret.length, 2);
  for (const cap of ret) {
    let area = 0;
    for (let i = 0; i < cap.positions.length; i += 9) {
      const p = cap.positions;
      const a =
        (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i]);
      area += Math.abs(a) / 2;
    }
    const expected = 144 - 3 * 3 * Math.PI;
    assert.ok(
      Math.abs(area - expected) < 0.25,
      `ring cap cross-section area ${area} vs ${expected}`,
    );
  }
  geom.dispose();
});
test('planar source-owner Z caps preserve an unreleased ring with a hole', async () => {
  await loadGeometryKernel();
  const { rectMulti, difference, circleMulti } = await import('../vector-geometry.js');
  const ring = difference(rectMulti(20, 20), circleMulti(10, 10, 64));
  const owner = {
    fronts: [],
    sourceModel: { regions: [{ geom: ring, stack: [{ layerId: 'SiN', z0: 1, z1: 3 }] }] },
  };
  const caps = buildContinuousPlanarZBreakCaps(THREE, owner, 'SiN', {
    enabled: true,
    top: 2,
    bottom: 0,
  });
  assert.equal(caps.length, 1);
  let sum = 0;
  for (let i = 0; i < caps[0].positions.length; i += 9) {
    const p = caps[0].positions;
    sum +=
      Math.abs(
        (p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i]),
      ) / 2;
  }
  assert.ok(Math.abs(sum - (400 - Math.PI * 25)) < 1, 'ring exact owner area');
});
test('planar Z cap honors physical ROI and no phantom cap inside release opening', async () => {
  await loadGeometryKernel();
  const { rectMulti, difference, circleMulti } = await import('../vector-geometry.js');
  const ring = difference(rectMulti(20, 20), circleMulti(10, 10, 64));
  const owner = {
    fronts: [],
    sourceModel: { regions: [{ geom: ring, stack: [{ layerId: 'SiN', z0: 1, z1: 3 }] }] },
  };
  const state = { enabled: true, top: 2, bottom: 0 };
  const hole = buildContinuousPlanarZBreakCaps(THREE, owner, 'SiN', state, {
    minX: -2,
    maxX: 2,
    minY: -2,
    maxY: 2,
  });
  assert.equal(hole.length, 0);
  const corner = buildContinuousPlanarZBreakCaps(THREE, owner, 'SiN', state, {
    minX: 5,
    maxX: 10,
    minY: 5,
    maxY: 10,
  });
  assert.equal(corner.length, 1);
  let signed = 0;
  const p = corner[0].positions;
  for (let i = 0; i < p.length; i += 9)
    signed +=
      ((p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i])) / 2;
  assert.ok(Math.abs(signed + 25) < 1e-4);
});
