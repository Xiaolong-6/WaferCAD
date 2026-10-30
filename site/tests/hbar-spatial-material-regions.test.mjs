import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialMaterialRegions } from '../../scripts/build-hbar-full-chip-example.mjs';

test('spatial material splitting preserves every original ring and stack without approximation', () => {
  const outer = [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
    [0, 0],
  ];
  const hole = [
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 1],
    [1, 1],
  ];
  const separate = [
    [20, 20],
    [24, 20],
    [24, 25],
    [20, 25],
    [20, 20],
  ];
  const base = [
    [100, 100],
    [200, 100],
    [200, 200],
    [100, 200],
    [100, 100],
  ];
  const partitions = [
    {
      geom: [[outer, hole], [separate]],
      stack: [{ layerId: 'base', z0: -262.5, z1: 262.5 }],
    },
    {
      geom: [[base]],
      stack: [
        { layerId: 'base', z0: -262.5, z1: 262.5 },
        { layerId: 'layer-1', z0: 262.5, z1: 265.3 },
      ],
    },
  ];
  const snapshot = structuredClone(partitions);
  const regions = spatialMaterialRegions(partitions);
  assert.deepEqual(
    regions.map((item) => item.id),
    ['region-1', 'region-2', 'region-3'],
  );
  assert.ok(regions.every((item) => item.geom.length === 1));
  assert.deepEqual(
    regions.flatMap((region) => region.geom),
    partitions.flatMap((part) => part.geom),
  );
  assert.equal(regions[0].geom[0].length, 2, 'real hole preserved');
  assert.deepEqual(regions[1].stack, partitions[0].stack);
  assert.deepEqual(regions[2].stack, partitions[1].stack);
  assert.deepEqual(partitions, snapshot, 'canonical source data unchanged');
});
