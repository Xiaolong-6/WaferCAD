import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditLegacyRetirementOwners,
  classifyLegacyOwner,
  classifyRetirementSurface,
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
    'site/app-legacy.html',
    'site/app.js',
    'site/workstation.css',
    'site/controllers/startup-controller.js',
    'scripts/build-pages-artifact.mjs',
  ]) {
    assert.ok(paths.has(path), `Unaccounted Legacy owner: ${path}`);
  }
  assert.ok(audit.counts.helpers > 0);
  assert.ok(audit.counts.bridge > 0);
  assert.equal(audit.counts.sourceOnlyEditor, 3, 'Legacy sources tracked but not auto-deleted');
  assert.ok(audit.counts.experimentalD1 >= 2, 'Experimental D1 route and bridge tracked');
  assert.ok(
    audit.owners.some(
      (owner) =>
        owner.path === 'scripts/build-pages-artifact.mjs' &&
        owner.surface === 'published-redirect-owner',
    ),
    'Published bookmark redirect requires an independent preservation owner',
  );
  assert.ok(
    audit.owners.some(
      (owner) =>
        owner.path === 'site/controllers/startup-controller.js' &&
        owner.surface === 'site-runtime',
    ),
    'Startup Legacy compatibility must be audited before removal',
  );
  assert.ok(audit.warnings.some((warning) => /equivalence/.test(warning)));
});

test('source-only editor, experimental D1 and public redirect are distinct owners', () => {
  assert.equal(classifyRetirementSurface('site/app-legacy.html'), 'source-only-legacy-editor');
  assert.equal(classifyRetirementSurface('site/workstation.css'), 'source-only-legacy-editor');
  assert.equal(classifyRetirementSurface('site/app-v2-real.html'), 'experimental-d1');
  assert.equal(classifyRetirementSurface('site/ui-v2/real-view-bridge.js'), 'experimental-d1');
  assert.equal(
    classifyRetirementSurface('scripts/build-pages-artifact.mjs'),
    'published-redirect-owner',
  );
  assert.equal(classifyRetirementSurface('site/controllers/startup-controller.js'), 'site-runtime');
});
