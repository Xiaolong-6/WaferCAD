import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTryElectricalVolumeCapPass,
  electricalVolumePassIndices,
} from '../renderer-electrical-volume-pass.js';

const fullSolid = {
  caps: [
    { z: 0, normal: -1, polys: [] },
    { z: 1, normal: 1, polys: [] },
  ],
  slabs: [{ z0: 0, z1: 1, polys: [] }],
};
const eligible = {
  enabled: true,
  transparent: true,
  quality: true,
  fullArray: true,
  clipped: false,
  rough: false,
  cameraAbove: true,
  solid: fullSolid,
};

test('electrical volume pass experiment requires intact, above-wafer, full-array Quality opt-in', () => {
  assert.equal(canTryElectricalVolumeCapPass(eligible), true);
  for (const excluded of [
    { enabled: false },
    { transparent: false },
    { quality: false },
    { fullArray: false },
    { clipped: true },
    { rough: true },
    { cameraAbove: false },
    { solid: null },
    { solid: { ...fullSolid, caps: [fullSolid.caps[0]] } },
    { solid: { ...fullSolid, caps: [] } },
    { solid: { ...fullSolid, slabs: [] } },
    { solid: { ...fullSolid, caps: [{ z: 0, normal: 0.5, polys: [] }, fullSolid.caps[1]] } },
    { solid: { ...fullSolid, caps: [fullSolid.caps[0], fullSolid.caps[0]] } },
  ]) {
    assert.equal(
      canTryElectricalVolumeCapPass({ ...eligible, ...excluded }),
      false,
      JSON.stringify(excluded),
    );
  }
});

test('two indexed passes preserve cap-before-wall order without vertex merging', () => {
  const ranges = [
    { start: 0, count: 6, normal: -1 },
    { start: 6, count: 9, normal: 1 },
  ];
  assert.deepEqual(electricalVolumePassIndices(ranges, 27), {
    back: [...Array.from({ length: 6 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 15 + i)],
    front: [...Array.from({ length: 9 }, (_, i) => i + 6), ...Array.from({ length: 12 }, (_, i) => 15 + i)],
  });
  for (const invalid of [
    [ranges, 15],
    [ranges, 28],
    [[{ ...ranges[0], count: 5 }, ranges[1]], 27],
    [[ranges[0], { ...ranges[1], start: 9 }], 27],
    [[ranges[0], { ...ranges[1], normal: -1 }], 27],
    [[], 27],
  ]) {
    assert.equal(electricalVolumePassIndices(...invalid), null);
  }
});
