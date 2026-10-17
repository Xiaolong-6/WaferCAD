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
  for (const row of result.rows.filter((entry) => entry.critical)) {
    assert.ok(row.missingParity.length);
    for (const candidate of row.nativeCandidates) {
      assert.ok(candidate.existsOnBranch, candidate.path);
    }
    const status = row.nativeCandidates.length ? 'v2-invariant-owner' : 'long-term-science-debt';
    assert.equal(row.status, status);
  }
});

test('Recipe, Worker, History, Recovery and Array v2 owners are retained', async () => {
  const result = await auditLegacyRetirementParity();
  const rows = new Map(result.rows.map((row) => [row.path, row]));
  const required = [
    {
      old: 'scripts/process-recipe-safety-regression.mjs',
      native: 'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    },
    {
      old: 'scripts/process-transaction-ui-regression.mjs',
      native: 'scripts/v2/check-worker-fault-parity.mjs',
    },
    {
      old: 'scripts/history-regression.mjs',
      native: 'scripts/v2/check-history-replay-rollback.mjs',
    },
    {
      old: 'scripts/persistence-regression.mjs',
      native: 'scripts/v2/check-recovery-two-tab-takeover.mjs',
    },
    {
      old: 'scripts/array-runtime-regression.mjs',
      native: 'scripts/v2/check-array-625-science.mjs',
    },
  ];
  for (const { old, native } of required) {
    const candidates = rows.get(old).nativeCandidates;
    const found = candidates.find((candidate) => candidate.path === native);
    assert.ok(found?.existsOnBranch, native);
  }
  assert.equal(rows.get('scripts/array-renderer-regression.mjs').status, 'long-term-science-debt');
});
