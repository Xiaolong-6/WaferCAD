import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditLegacyRetirementOwners,
  classifyLegacyOwner,
} from '../../scripts/legacy-retirement-owner-audit.mjs';

test('Legacy owner audit distinguishes exact source references from unrelated prose', () => {
  assert.deepEqual(classifyLegacyOwner('scripts/owner.mjs', 'newLegacyUiPage(browser)'), {
    path: 'scripts/owner.mjs',
    testOwner: true,
    helpers: true,
    editor: false,
    bridge: false,
    requiresReview: true,
  });
  assert.equal(
    classifyLegacyOwner('site/controllers/model.js', 'createModel()').requiresReview,
    false,
  );
  assert.equal(
    classifyLegacyOwner('site/app-v2-real.html', 'real-view-bridge.js').bridge,
    true,
  );
});

test('Legacy retirement inventory retains live scientific owners until verified parity', async () => {
  const audit = await auditLegacyRetirementOwners();
  const paths = new Set(audit.owners.map((owner) => owner.path));
  for (const path of [
    'scripts/process-recipe-safety-regression.mjs',
    'scripts/process-transaction-ui-regression.mjs',
    'scripts/array-renderer-regression.mjs',
    'scripts/fig3-full-replay-acceptance.mjs',
    'site/ui-v2/real-view-bridge.js',
    'site/app-v2-real.html',
  ]) {
    assert.ok(paths.has(path), `Unaccounted Legacy owner: ${path}`);
  }
  assert.ok(audit.counts.helpers > 0);
  assert.ok(audit.counts.bridge > 0);
  assert.ok(audit.warnings.some((warning) => /equivalence/.test(warning)));
});
