import assert from 'node:assert/strict';
import test from 'node:test';
import { auditLegacyRetirementOwners, classifyRetirementSurface } from '../../scripts/legacy-retirement-owner-audit.mjs';

test('Legacy-specific editor and D1 bridge modules are absent from active source', async () => {
  const result = await auditLegacyRetirementOwners();
  const sources = new Set(result.owners.map(owner => owner.path));
  for (const file of [
    'site/app-legacy.html', 'site/app.js', 'site/workstation.css',
    'site/app-v2-real.html', 'site/ui-v2/real-view-bridge.js',
    'site/ui-v2/real-view-bridge.css', 'site/ui-v2/real-section-controls.js'
  ]) assert.equal(sources.has(file), false, file);
  assert.equal(result.counts.sourceOnlyEditor, 0);
  assert.equal(result.counts.experimentalD1, 0);
  assert.equal(result.counts.sharedProductionControls, 1);
  assert.ok(sources.has('site/ui-v2/real-three-controls.js'));
});

test('production real-3D controller and staged bookmark redirect remain distinct owners', async () => {
  const result = await auditLegacyRetirementOwners();
  assert.equal(classifyRetirementSurface('site/ui-v2/real-three-controls.js'), 'shared-production-controls');
  assert.ok(result.owners.some(x => x.path === 'scripts/build-pages-artifact.mjs'));
  assert.ok(result.owners.some(x => x.path === 'site/controllers/startup-controller.js'));
});