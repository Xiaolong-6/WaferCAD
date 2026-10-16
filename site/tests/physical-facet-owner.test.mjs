import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makePhysicalPyramidOwner,
  restorePhysicalPyramidOwner,
  physicalMaterialAt,
  physicalOwnerVolume,
  rejectUnimplementedPhysicalProcess,
} from '../physical-facet-owner.js';

const config = {
  layerId: 'silicon',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
};

test('physical XY owner returns one material interval or null', () => {
  const owner = makePhysicalPyramidOwner(config);
  assert.equal(physicalMaterialAt(owner, -6.4, 0).layerId, 'silicon');
  assert.equal(physicalMaterialAt(owner, 6.4, 0), null);
  assert.equal(physicalMaterialAt(owner, 0, 6.4), null);
  const apex = physicalMaterialAt(owner, 0, 0);
  assert.equal(apex.thicknessUm, 260);
  assert.equal(physicalMaterialAt(owner, 3.2, 3.2).thicknessUm, 251);
  assert.equal(physicalMaterialAt(owner, 0, 0, 0).occupancy, 'solid');
  assert.equal(physicalMaterialAt(owner, 0, 0, apex.z1).occupancy, 'interface');
  assert.equal(physicalMaterialAt(owner, 0, 0, 300).occupancy, 'void');
});

test('versioned physical descriptor round-trips as pure JSON', () => {
  const source = makePhysicalPyramidOwner(config);
  const json = JSON.stringify(source);
  const reopened = restorePhysicalPyramidOwner(JSON.parse(json));
  assert.equal(JSON.stringify(reopened), json);
  for (const xy of [[0, 0], [1.2, 0.4], [-3, 1.2], [6.399, -2]]) {
    assert.deepEqual(physicalMaterialAt(reopened, ...xy), physicalMaterialAt(source, ...xy));
  }
});

test('full-cell physical owner volume uses physical interfaces', () => {
  const owner = makePhysicalPyramidOwner(config);
  const area = 12.8 * 12.8;
  assert.ok(Math.abs(physicalOwnerVolume(owner) - area * 254) < 1e-10);
  assert.ok(physicalOwnerVolume(owner) > area * 251);
});

test('unsupported operations and partial-cell domains fail closed', () => {
  assert.throws(
    () => makePhysicalPyramidOwner({ ...config, domain: { ...config.domain, maxX: 7 } }),
    /entire pyramid cells/,
  );
  assert.throws(() => restorePhysicalPyramidOwner({ kind: 'legacy-ideal-stack' }), /Unsupported/);
  assert.throws(() => physicalMaterialAt(makePhysicalPyramidOwner(config), NaN, 0), RangeError);
  assert.throws(
    () => rejectUnimplementedPhysicalProcess(makePhysicalPyramidOwner(config), 'conformal'),
    /does not support/,
  );
});
