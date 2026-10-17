import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditSiteSymbols } from '../../scripts/audit-site-symbols.mjs';

test('named exports recognize static import consumers but retain review candidates', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wafercad-symbol-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'site'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(
    join(root, 'site/module.js'),
    'export const used = 1; export function unusedExport() { return 2; }',
  );
  await writeFile(
    join(root, 'site/entry.js'),
    "import { used } from './module.js'; console.log(used);",
  );
  await writeFile(
    join(root, 'site/local.js'),
    'function unusedLocal() { return 1; } export const active = 2;',
  );
  await writeFile(join(root, 'scripts/consumer.mjs'), "import { active } from '../site/local.js';");

  const result = await auditSiteSymbols(root);
  assert.equal(result.scannedModules, 4);
  assert.deepEqual(result.parseErrors, []);
  assert.ok(result.namedExportCandidates.some((item) => item.symbol === 'unusedExport'));
  assert.ok(!result.namedExportCandidates.some((item) => item.symbol === 'used'));
  assert.ok(!result.namedExportCandidates.some((item) => item.symbol === 'active'));
  assert.ok(result.localUnused.some((item) => item.message.includes('unusedLocal')));
});

test('dynamic imports and namespace imports suppress speculative unused export verdicts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wafercad-symbol-dynamic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'site'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'site/module.js'), 'export const one = 1; export const two = 2;');
  await writeFile(join(root, 'site/entry.js'), "void import('./module.js');");
  const result = await auditSiteSymbols(root);
  assert.deepEqual(result.namedExportCandidates, []);
});

test('real WaferCAD code symbol audit is read-only and parseable', async () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const result = await auditSiteSymbols(repo);
  assert.ok(result.scannedModules > 100);
  assert.deepEqual(result.parseErrors, []);
  // Removed Legacy composition roots must not leave vacuous unused-symbol assertions.
  for (const retired of ['site/app.js', 'site/app-legacy.html', 'site/workstation.css']) {
    await assert.rejects(access(join(repo, retired)), { code: 'ENOENT' });
  }
  for (const [file, symbol] of [
    ['site/controllers/project-controller.js', 'migrateProjectFile'],
    ['site/controllers/project-controller.js', 'validateProjectFile'],
    ['site/controllers/section-collapse-controller.js', 'translateSectionCollapse'],
    ['site/gds.js', 'dataType'],
    ['site/tests/example-regression.test.mjs', 'migrateProjectFile'],
    ['site/ui-v2/mock-views.js', 'field'],
    ['site/ui-v2/mock-views.js', 'select'],
    ['site/ui-v2/mock-workspace.js', 'icon'],
    ['site/ui-v2/mock-workspace.js', 'stepper'],
    ['site/ui-v2/mock-workspace.js', 'emptyState'],
    ['site/ui-v2/mock-workspace.js', 'busy'],
    ['site/ui-v2/mock-workspace.js', 'panelHeader'],
    ['site/ui-v2/mock-workspace.js', 'divider'],
    ['site/ui-v2/mock-workspace.js', 'toolbar'],
    ['site/ui-v2/mock-workspace.js', 'row'],
    ['site/ui-v2/mock-workspace.js', 'originFocus'],
    ['site/model.js', 'maskBoundsCache'],
    ['site/model.js', 'uncoveredGeometry'],
    ['site/plan-renderers.js', 'x0'],
    ['site/plan-renderers.js', 'x1'],
    ['site/renderer-line-reduction.js', 'compatibleWall'],
    ['site/surface-rendering.js', 'roughNoise2D'],
  ]) {
    const matches = result.localUnused.filter(
      (entry) => entry.file === file && entry.message.includes(symbol),
    );
    assert.deepEqual(matches, [], file + ': unused import ' + symbol);
  }
  console.log(
    'SITE_SYMBOL_AUDIT ' +
      JSON.stringify({
        scannedModules: result.scannedModules,
        skippedLarge: result.skippedLarge,
        localUnusedCount: result.localUnused.length,
        localUnusedExamples: result.localUnused.slice(0, 12),
        namedExportCandidateCount: result.namedExportCandidates.length,
        namedExportExamples: result.namedExportCandidates.slice(0, 20),
      }),
  );
});
