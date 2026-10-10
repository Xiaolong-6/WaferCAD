import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTryElectricalVolumeCapPass,
  electricalVolumeGeometryGroups,
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
  solid: fullSolid,
};

test('electrical volume plane-only pilot requires exact full-array Quality opt-in', () => {
  assert.equal(canTryElectricalVolumeCapPass(eligible), true);
  for (const excluded of [
    { enabled: false },
    { transparent: false },
    { quality: false },
    { fullArray: false },
    { clipped: true },
    { rough: true },
    { solid: null },
    { solid: { ...fullSolid, caps: [fullSolid.caps[0]] } },
    { solid: { ...fullSolid, caps: [] } },
    { solid: { ...fullSolid, slabs: [] } },
    { solid: { ...fullSolid, caps: [{ z: 0, normal: 0.5, polys: [] }, fullSolid.caps[1]] } },
  ]) {
    assert.equal(
      canTryElectricalVolumeCapPass({ ...eligible, ...excluded }),
      false,
      JSON.stringify(excluded),
    );
  }
});

test('electrical cap geometry groups cover only full triangles in exact source order', () => {
  assert.deepEqual(electricalVolumeGeometryGroups(300, 720), [
    { start: 0, count: 300, materialIndex: 0 },
    { start: 300, count: 420, materialIndex: 1 },
  ]);
  for (const invalid of [[0, 720], [300, 300], [301, 720], [300, 721], [-3, 720]]) {
    assert.equal(electricalVolumeGeometryGroups(...invalid), null);
  }
});
