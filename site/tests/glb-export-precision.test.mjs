import assert from 'node:assert/strict';
import test from 'node:test';
import {
  glbCapLocalOrigin,
  glbSidewallLocalOrigin,
  glbLocalFloat32Positions,
  glbWorldAtFloat32Precision,
  glbWorldBoundaryPositions,
} from '../glb-export-precision.js';

test('GLB local Float32 positions preserve nanometre features at large wafer coordinates', () => {
  const origin = glbCapLocalOrigin({
    polys: [[[[50000, -50000], [50000.002, -50000], [50000.002, -49999.998]]]],
    z: 0.0005,
  });
  const points = [50000, -50000, 0.0005, 50000.002, -49999.998, 0.0015];
  const local = glbLocalFloat32Positions(points, origin);
  assert.ok(local[3] > 0 && local[3] < 0.003);
  assert.ok(local[4] > 0 && local[4] < 0.003);
  assert.ok(Math.abs(origin[0] + local[3] - points[3]) < 1e-9);
  assert.ok(Math.abs(origin[1] + local[4] - points[4]) < 1e-9);
  assert.ok(Math.abs(origin[2] + local[5] - points[5]) < 1e-9);
  assert.equal(Math.fround(points[0]), Math.fround(points[3]));
  assert.equal(glbWorldAtFloat32Precision(points[3], 0, origin), origin[0] + Math.fround(0.002));
  assert.deepEqual([...glbWorldBoundaryPositions(local, origin)], [
    origin[0] + local[0],
    origin[1] + local[1],
    origin[2] + local[2],
    origin[0] + local[3],
    origin[1] + local[4],
    origin[2] + local[5],
  ]);
  assert.deepEqual(glbSidewallLocalOrigin([{ p: [50000, -50000], z0: -1 }]), [50000, -50000, -1]);
});
