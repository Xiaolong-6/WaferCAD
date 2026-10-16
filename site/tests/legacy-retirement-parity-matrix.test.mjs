import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRITICAL_LEGACY_CONTRACTS,
  auditLegacyRetirementParity,
} from '../../scripts/legacy-retirement-parity-matrix.mjs';

test('all release-critical scientific old-UI owners stay explicitly tracked', async () => {
  const result = await auditLegacyRetirementParity();
  const rows = new Map(result.rows.map((row) => [row.path, row]));
  assert.equal(result.sourceRetirementReady, false);
  assert.equal(result.totals.critical, CRITICAL_LEGACY_CONTRACTS.length);
  assert.ok(result.totals.critical >= 15);
  assert.equal(result.totals.missingCriticalSources, 0);
  assert.equal(result.totals.missingNativeCandidates, 0);
  for (const spec of CRITICAL_LEGACY_CONTRACTS) {
    const row = rows.get(spec.path);
    assert.ok(row, 'Lost required old test owner: ' + spec.path);
    assert.ok(row.legacySourcePresent, 'Old suite removed before parity: ' + spec.path);
    assert.ok(row.missingParity.length, 'Missing explicit replacement gaps: ' + spec.path);
    assert.equal(row.sourceDeletionApproved, false);
  }
});

test('matching v2 filenames do not turn partial test transfer into retirement approval', async () => {
  const { rows } = await auditLegacyRetirementParity();
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const recipe = byPath.get('scripts/process-recipe-safety-regression.mjs');
  assert.equal(recipe.status, 'partial-candidate');
  assert.ok(recipe.draftPrs.includes(268));
  assert.ok(
    recipe.nativeCandidates.some(
      (candidate) =>
        candidate.path === 'scripts/v2/check-recipe-prefix-stop-parity.mjs' &&
        candidate.existsOnBranch,
    ),
  );
  assert.ok(recipe.missingParity.some((gap) => /template/.test(gap)));
  const worker = byPath.get('scripts/process-transaction-ui-regression.mjs');
  assert.ok(worker.draftPrs.includes(265));
  assert.ok(
    worker.nativeCandidates.some(
      (candidate) =>
        candidate.path === 'scripts/v2/check-worker-fault-parity.mjs' && candidate.existsOnBranch,
    ),
  );
  assert.ok(worker.missingParity.some((gap) => /interleavings/.test(gap)));
  const klayout = byPath.get('scripts/klayout-ui-compat.mjs');
  assert.equal(klayout.nativeCandidates.length, 2);
  assert.ok(klayout.missingParity.some((gap) => /export/.test(gap)));
  assert.ok(rows.every((row) => !row.sourceDeletionApproved));
});
