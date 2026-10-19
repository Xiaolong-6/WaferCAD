import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { expandProjectStorage } = await import('../project-io.js');
const {
  createContinuousMaterialOwner,
  restoreContinuousMaterialOwner,
  continuousOwnerColumnAtXY,
  continuousOwnerMaterialAt,
  sampleContinuousOwnerSection,
} = await import('../continuous-material-owner.js');

const raw = JSON.parse(
  readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url)),
);
const project = expandProjectStorage(raw);
const m07 = project.snapshots.find((item) => item.id === 'snapshot-microdisk-07')?.state?.model;

test('real Microdisk M07 continuous owner preserves pedestal, undercut, silica and round trip', () => {
  assert.ok(m07, 'Published Microdisk M07 history precursor is required');
  const unchanged = JSON.stringify(m07);
  const owner = createContinuousMaterialOwner(m07, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
  assert.equal(owner.fronts.length, 1);
  assert.equal(owner.fronts[0].seedZ, 40);
  assert.equal(continuousOwnerMaterialAt(owner, [0, 0, 39]), 'base');
  assert.equal(continuousOwnerMaterialAt(owner, [50, 0, 15]), null);
  assert.equal(continuousOwnerMaterialAt(owner, [145, 0, 40.5]), 'layer-1');
  assert.equal(continuousOwnerMaterialAt(owner, [145, 0, 2]), 'base');
  assert.equal(JSON.stringify(m07), unchanged);

  const restored = restoreContinuousMaterialOwner(JSON.parse(JSON.stringify(owner)));
  const center = continuousOwnerColumnAtXY(restored, [0, 0]);
  assert.deepEqual(center, continuousOwnerColumnAtXY(owner, [0, 0]));
  const positions = [[0, 0], [50, 0], [145, 0]];
  for (const xy of positions) {
    assert.deepEqual(continuousOwnerColumnAtXY(restored, xy), continuousOwnerColumnAtXY(owner, xy));
  }
  for (const steps of [8, 72]) {
    const section = sampleContinuousOwnerSection(restored, [-200, 0], [200, 0], steps);
    assert.equal(section.length, steps + 1);
  }
  assert.equal(JSON.stringify(restored), JSON.stringify(owner));
});
