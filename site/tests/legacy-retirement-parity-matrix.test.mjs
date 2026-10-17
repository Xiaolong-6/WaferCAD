import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRITICAL_LEGACY_CONTRACTS,
  auditLegacyRetirementParity,
} from '../../scripts/legacy-retirement-parity-matrix.mjs';

test('retirement CI asserts actual v2 invariant candidates, never old DOM files', async () => {
  const result = await auditLegacyRetirementParity();
  assert.equal(result.sourceRetirementReady, true);
  assert.equal(result.totals.critical, CRITICAL_LEGACY_CONTRACTS.length);
  assert.equal(result.totals.missingNativeCandidates, 0);
  for (const row of result.rows.filter((x) => x.critical)) {
    assert.ok(row.missingParity.length);
    for (const candidate of row.nativeCandidates) {
      assert.ok(candidate.existsOnBranch, candidate.path);
    }
    assert.equal(
      row.status,
      row.nativeCandidates.length ? 'v2-invariant-owner' : 'long-term-science-debt',
    );
  }
});

test('Recipe, Worker, History, Recovery and Array v2 owners are retained', async () => {
  const rows = new Map(
    (await auditLegacyRetirementParity()).rows.map((row) => [row.path, row]),
  );
  for (const [old, owner] of [
    [
      'scripts/process-recipe-safety-regression.mjs',
      'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    ],
    [
      'scripts/process-transaction-ui-regression.mjs',
      'scripts/v2/check-worker-fault-parity.mjs',
    ],
    ['scripts/history-regression.mjs', 'scripts/v2/check-history-replay-rollback.mjs'],
    ['scripts/persistence-regression.mjs', 'scripts/v2/check-recovery-two-tab-takeover.mjs'],
    ['scripts/array-runtime-regression.mjs', 'scripts/v2/check-array-625-science.mjs'],
  ]) {
    assert.ok(
      rows
        .get(old)
        .nativeCandidates.some((candidate) => candidate.path === owner && candidate.existsOnBranch),
    );
  }
  assert.equal(
    rows.get('scripts/array-renderer-regression.mjs').status,
    'long-term-science-debt',
  );
});
