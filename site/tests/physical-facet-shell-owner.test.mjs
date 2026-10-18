import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closestPhysicalTrianglePoint,
  createPhysicalFacetShellQuery,
  makePhysicalFacetShell,
  restorePhysicalFacetShell,
} from '../experimental/physical-facets/physical-facet-shell-owner.js';
import { makePhysicalPyramidOwner } from '../experimental/physical-facets/physical-facet-owner.js';
import {
  samplePhysicalPyramidSlab,
  squarePyramidSample,
} from '../experimental/physical-facets/physical-facet-math.js';

const silicon = makePhysicalPyramidOwner({
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
});
const thicknessUm = 0.05;
const descriptor = makePhysicalFacetShell({ silicon, layerId: 'oxide', thicknessUm });
const shell = createPhysicalFacetShellQuery(descriptor);
const eq = (actual, expected, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `Actual ${actual}; expected ${expected}`);

test('closed Si surface has a unique 3D exterior material owner for every query', () => {
  assert.equal(shell.sourceTriangleCount, 80);
  const si = shell.sample([1.6, 0.2, 0]);
  assert.equal(si.materialLayerId, 'base');
  assert.equal(si.phase, 'silicon');
  const empty = shell.sample([1.6, 0.2, 140]);
  assert.equal(empty.materialLayerId, null);
  assert.equal(empty.phase, 'void');
  assert.throws(() => shell.sample([1.6, 0.2, NaN]), /finite/);
});

test('front/back sloped facets get *Euclidean-normal*, not vertical, oxide ownership', () => {
  for (const face of ['front', 'back']) {
    const [x, y] = [1.6, 0.2];
    const surface = squarePyramidSample(x, y, {
      pitch: silicon.pitch,
      height: silicon.height,
      planeZ: face === 'front' ? silicon.topPlaneZ : silicon.bottomPlaneZ,
      face,
    });
    const surfacePoint = [x, y, surface.z];
    const point = (d) => surfacePoint.map((value, i) => value + d * surface.normal[i]);
    const within = shell.sample(point(0.02));
    assert.equal(within.materialLayerId, 'oxide');
    assert.equal(within.phase, 'coating');
    eq(within.distanceToSiliconUm, 0.02, 1e-8);
    const beyond = shell.sample(point(0.08));
    assert.equal(beyond.materialLayerId, null);
    eq(beyond.distanceToSiliconUm, 0.08, 1e-8);
  }
});

test('apex, concave valleys, domain sidewalls and 3D corners are covered without gaps', () => {
  const points = [
    [0, 0, 130.02], // 3D convex apex
    [0, 0, -130.02], // back apex
    [3.2, 0, 125.52], // concave valley
    [3.2, 0, -125.52], // concave bottom valley
    [6.42, 0, 0], // exposed perimeter wall
    [6.42, 6.42, 0], // true 3D perimeter corner
  ];
  for (const point of points) {
    const outcome = shell.sample(point);
    assert.equal(outcome.phase, 'coating', `Uncoated exposed point ${point}`);
    assert.equal(outcome.materialLayerId, 'oxide');
    assert.ok(outcome.distanceToSiliconUm > 0);
    assert.ok(outcome.distanceToSiliconUm < thicknessUm);
  }
  assert.equal(shell.sample([0, 0, 130.06]).phase, 'void');
  assert.equal(shell.sample([6.46, 6.46, 0]).phase, 'void');
  assert.equal(shell.sample([6.4, 0, 0]).materialLayerId, 'base');
});

test('3D pyramid apex oxide has a genuine spherical cap rather than a flat Z offset', () => {
  for (const [x, y] of [
    [0, 0],
    [0.02, 0],
    [0.02, 0.02],
    [-0.02, 0.02],
  ]) {
    const dz = Math.sqrt(thicknessUm * thicknessUm - x * x - y * y);
    const surface = [x, y, 130 + dz];
    eq(shell.closest(surface).distanceUm, thicknessUm, 1e-9);
    assert.equal(shell.sample([x, y, 130 + dz + 0.005]).phase, 'void');
  }
});

test('source Si and coating have exclusive material ownership, including exact interfaces', () => {
  for (const x of [-5.8, -3.2, 0, 1.6, 3.2, 5.8]) {
    for (const y of [-5.8, 0, 1.6, 3.2, 5.8]) {
      const source = samplePhysicalPyramidSlab(x, y, silicon);
      for (const z of [source.z0, 0, source.z1]) {
        const result = shell.sample([x, y, z]);
        assert.equal(result.materialLayerId, 'base');
        assert.notEqual(result.phase, 'coating');
      }
    }
  }
});

test('complete 3D nearest-triangle oracle handles face, edge and vertex exactly', () => {
  const triangle = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  assert.deepEqual(closestPhysicalTrianglePoint([0.25, 0.25, 0.5], triangle), {
    point: [0.25, 0.25, 0],
    feature: 'face',
  });
  assert.deepEqual(closestPhysicalTrianglePoint([0.5, -0.25, 0], triangle), {
    point: [0.5, 0, 0],
    feature: 'edge',
  });
  assert.deepEqual(closestPhysicalTrianglePoint([-0.2, -0.2, 0], triangle), {
    point: [0, 0, 0],
    feature: 'vertex',
  });
});

test('native Si material bounds agree with both numerically resolved oxide interfaces', () => {
  const g = (2 * silicon.height) / silicon.pitch;
  const expected = thicknessUm * Math.hypot(g, 1);
  for (const [x, y] of [
    [1.6, 0.2],
    [-1.6, -0.2],
    [0.2, 1.6],
    [1.6, 1.6],
    [0, 0],
    [3.2, 0],
  ]) {
    const cut = shell.column(x, y);
    const old = samplePhysicalPyramidSlab(x, y, silicon);
    eq(cut.siliconZ0, old.z0);
    eq(cut.siliconZ1, old.z1);
    assert.ok(cut.backOuterZ < cut.siliconZ0);
    assert.ok(cut.frontOuterZ > cut.siliconZ1);
    assert.equal(shell.sample([x, y, (cut.siliconZ1 + cut.frontOuterZ) / 2]).phase, 'coating');
    assert.equal(shell.sample([x, y, (cut.siliconZ0 + cut.backOuterZ) / 2]).phase, 'coating');
    if (Math.abs(x) === 1.6 && Math.abs(y) === 0.2) {
      eq(cut.frontOuterZ - old.z1, expected, 3e-8);
      eq(old.z0 - cut.backOuterZ, expected, 3e-8);
    }
    if (x === 0 && y === 0) {
      eq(cut.frontOuterZ - old.z1, thicknessUm, 3e-8);
      eq(old.z0 - cut.backOuterZ, thicknessUm, 3e-8);
    }
  }
});

test('descriptor is JSON safe, immutable, and rejects unsupported chemistry or huge films', () => {
  const before = JSON.stringify(silicon);
  assert.deepEqual(restorePhysicalFacetShell(JSON.parse(JSON.stringify(descriptor))), descriptor);
  assert.equal(JSON.stringify(silicon), before);
  assert.throws(
    () => makePhysicalFacetShell({ silicon, layerId: 'base', thicknessUm }),
    /distinct/,
  );
  assert.throws(
    () => makePhysicalFacetShell({ silicon, layerId: 'oxide', thicknessUm: 0 }),
    /thickness/,
  );
  assert.throws(
    () => makePhysicalFacetShell({ silicon, layerId: 'oxide', thicknessUm: 100 }),
    /quarter-pitch/,
  );
  assert.throws(
    () => restorePhysicalFacetShell({ ...descriptor, kind: 'legacy-appearance-only' }),
    /Unsupported/,
  );
  assert.throws(() => shell.sample([0, 0, Infinity]), /finite/);
  assert.throws(() => shell.column(6.4, 0), /interior XY/);
});
