import assert from 'node:assert/strict';
import test from 'node:test';
import {
  transparentArrayPresentationLod,
  electricalDisplaySolidForLod,
} from '../transparent-array-lod.js';

const distant = () =>
  transparentArrayPresentationLod({
    transparent: true,
    fast: true,
    instanceCount: 1885,
    unitsPerPixel: 0.35,
  });

test('transparent far array chooses a bounded, quantized presentation tier', () => {
  const lod = distant();
  assert.equal(lod.tier, 'far-0.32');
  assert.equal(lod.flattenElectrical, true);
  assert.ok(lod.displayTolerance <= 0.35 * 0.85);
  assert.equal(
    transparentArrayPresentationLod({
      transparent: true,
      fast: true,
      instanceCount: 1885,
      unitsPerPixel: 0.31,
    }).tier,
    'far-0.16',
    'camera zoom crossing a tier boundary must change the scene signature',
  );
});

test('quality, opaque, ROI, small arrays and near inspection remain exact', () => {
  const base = { transparent: true, fast: true, instanceCount: 1885, unitsPerPixel: 0.35 };
  for (const override of [
    { fast: false },
    { transparent: false },
    { clipped: true },
    { instanceCount: 25 },
    { unitsPerPixel: 0.005 },
    { unitsPerPixel: NaN },
    { unitsPerPixel: Infinity },
  ]) {
    assert.deepEqual(transparentArrayPresentationLod({ ...base, ...override }), {
      tier: 'exact',
      displayTolerance: 0,
      flattenElectrical: false,
    });
  }
});

test('far Electrical annotation retains both exact depth caps without mutating the source', () => {
  const poly = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]];
  const source = {
    electricalRegionId: 'contact',
    slabs: [{ z0: 0.1, z1: 0.3, polys: poly }],
    caps: [
      { z: 0.1, normal: -1, polys: poly },
      { z: 0.3, normal: 1, polys: poly },
    ],
  };
  const result = electricalDisplaySolidForLod(source, source, distant());
  assert.deepEqual(result.slabs, []);
  assert.equal(result.caps, source.caps);
  assert.deepEqual(result.caps.map(({ z }) => z), [0.1, 0.3]);
  assert.equal(source.slabs.length, 1);
  assert.equal(result.electricalRegionId, 'contact');
  assert.equal(electricalDisplaySolidForLod(source, source, { flattenElectrical: false }), source);
});

test('Z-collapse/cut missing depth caps cannot drop a true annotation sidewall', () => {
  const source = {
    slabs: [{ z0: -1, z1: 1, polys: [] }],
    caps: [
      { z: -1, normal: -1, polys: [] },
      { z: 1, normal: 1, polys: [] },
    ],
  };
  const cut = { ...source, caps: [source.caps[0]] };
  assert.equal(electricalDisplaySolidForLod(source, cut, distant()), cut);
  assert.equal(electricalDisplaySolidForLod(source, { ...source, slabs: [] }, distant()).slabs.length, 0);
  assert.equal(electricalDisplaySolidForLod(source, source, { flattenElectrical: false }), source);
});
