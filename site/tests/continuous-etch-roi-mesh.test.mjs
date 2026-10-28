import test from 'node:test';
import assert from 'node:assert/strict';
import { clipContinuousSurfaceToRect } from '../continuous-etch-roi-mesh.js';

const quad = {
  layerId: 'base',
  positions: Float32Array.from([-4, -4, 3, 4, -4, 3, 4, 4, 3, -4, -4, 3, 4, 4, 3, -4, 4, 3]),
  normals: Float32Array.from(Array.from({ length: 6 }, () => [0, 0, 1]).flat()),
  triangles: 2,
};

function triangleArea(positions) {
  let sum = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
}

test('ROI triangle crop stays within an off-centre physical rectangle and preserves flat area', () => {
  const before = Array.from(quad.positions);
  const bounds = { minX: -2, maxX: 3, minY: -1, maxY: 2 };
  const crop = clipContinuousSurfaceToRect(quad, bounds);
  assert.ok(crop.triangles > 0);
  assert.ok(Math.abs(triangleArea(crop.positions) - 15) < 1e-6);
  assert.equal(crop.positions.length, crop.normals.length);
  for (let i = 0; i < crop.positions.length; i += 3) {
    assert.ok(crop.positions[i] >= bounds.minX - 1e-6);
    assert.ok(crop.positions[i] <= bounds.maxX + 1e-6);
    assert.ok(crop.positions[i + 1] >= bounds.minY - 1e-6);
    assert.ok(crop.positions[i + 1] <= bounds.maxY + 1e-6);
    assert.equal(crop.positions[i + 2], 3);
    assert.equal(crop.normals[i + 2], 1);
  }
  assert.deepEqual(Array.from(quad.positions), before, 'ROI cannot mutate canonical full mesh');
  assert.strictEqual(clipContinuousSurfaceToRect(quad, null), quad);
  assert.equal(
    clipContinuousSurfaceToRect(quad, { minX: 5, maxX: 8, minY: 5, maxY: 8 }).triangles,
    0,
  );
});

test('ROI crop rejects malformed geometry and invalid crop bounds', () => {
  assert.throws(
    () => clipContinuousSurfaceToRect(quad, { minX: 2, maxX: 1, minY: 0, maxY: 5 }),
    /Invalid continuous display crop/,
  );
  assert.throws(
    () =>
      clipContinuousSurfaceToRect(
        { ...quad, normals: new Float32Array(3) },
        { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      ),
    /Invalid continuous triangle mesh/,
  );
});

test('ROI plane owns a coincident material sidewall exactly once', () => {
  // A material sidewall exactly on x=minX has zero enclosed volume in the
  // cropped mesh. Keeping its old triangles AND the derived ROI cap creates
  // overlapping faces and nonmanifold edges at the mask/ROI intersection.
  const wall = {
    layerId: 'base',
    positions: Float32Array.from([0, 0, 0, 0, 3, 0, 0, 0, 2]),
    normals: Float32Array.from([-1, 0, 0, -1, 0, 0, -1, 0, 0]),
  };
  const original = Array.from(wall.positions);
  const roi = { minX: 0, maxX: 5, minY: -1, maxY: 4 };
  assert.equal(clipContinuousSurfaceToRect(wall, roi).triangles, 0);
  assert.deepEqual(Array.from(wall.positions), original, 'Display cropping is read-only');
  assert.equal(clipContinuousSurfaceToRect(wall, null), wall);
});

test('ROI fast-path preserves interior normals and excludes outside cells without creating phantom walls', () => {
  const mesh = {
    layerId: 'base',
    positions: Float32Array.from([
      0,
      0,
      2,
      1,
      0,
      2,
      0,
      1,
      2, // wholly inside
      3,
      3,
      2,
      4,
      3,
      2,
      3,
      4,
      2, // wholly outside
      2,
      0,
      0,
      2,
      1,
      0,
      2,
      0,
      1, // coincident ROI plane: cap owns it
    ]),
    normals: Float32Array.from(Array.from({ length: 9 }, () => [0, 0, 5]).flat()),
  };
  const original = mesh.positions.slice();
  const crop = clipContinuousSurfaceToRect(mesh, { minX: -2, maxX: 2, minY: -2, maxY: 2 });
  assert.equal(crop.triangles, 1);
  assert.deepEqual(crop.positions, original.slice(0, 9));
  assert.deepEqual(crop.normals, Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  assert.deepEqual(mesh.positions, original, 'ROI speedup must not alter input geometry');
});
