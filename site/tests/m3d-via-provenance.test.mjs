import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectM3dViaProvenance } from '../../scripts/v2/offline-m3d-via-provenance.mjs';

test('published M3D via cuts preserve source-based power/data provenance limits', async () => {
  const result = await inspectM3dViaProvenance();
  assert.equal(result.schema, 'wafercad-m3d-source-via-provenance-v1');
  assert.equal(
    result.sourceSha256,
    '473c1ed296d417db6f9ba1e49eb56cc955efb8ad3257063c65ed81aada8bea0e',
  );
  assert.equal(result.powerCutsEquivalent, true);
  assert.equal(result.dataCutDistinct, true);
  assert.equal(result.distinctAuthorPowerViaVerified, false);
  assert.equal(result.authorMaskVerified, false);
  assert.equal(result.semComparisonVerified, false);
  assert.deepEqual(
    result.cuts.map((cut) => cut.sliceCount),
    [162, 162, 119],
  );
  assert.equal(result.cuts[0].signature, result.cuts[1].signature);
  assert.notEqual(result.cuts[0].signature, result.cuts[2].signature);
  assert.ok(result.cuts[0].probeMaterials.includes('M3D Ti power via 120nm'));
  assert.ok(result.cuts[2].probeMaterials.includes('M3D MoS2 bridge Ni 30nm'));
});
