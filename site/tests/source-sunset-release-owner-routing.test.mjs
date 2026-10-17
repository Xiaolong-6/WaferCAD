import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  RELEASE_V2_OWNERS,
  RELEASE_SCIENTIFIC_TESTS,
} from '../../scripts/v2/check-source-sunset-release-owners.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const owners = {
  'scripts/interaction-regression.mjs': 'interaction',
  'scripts/example-regression.mjs': 'examples',
  'scripts/process-geometry-regression.mjs': 'process',
  'scripts/project-io-runtime-regression.mjs': 'io',
  'scripts/array-runtime-regression.mjs': 'array',
  'scripts/array-renderer-regression.mjs': 'rendererArray',
  'scripts/array-renderer-edge-on-regression.mjs': 'rendererEdge',
  'scripts/process-recipe-safety-regression.mjs': 'recipe',
  'scripts/process-transaction-ui-regression.mjs': 'transaction',
  'scripts/klayout-ui-compat.mjs': 'klayout',
  'scripts/product-regression.mjs': 'renderer',
};

test('formal browser and science commands preserve fail-closed native owner routing', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const commands = [
    'test:ui:workstation',
    'test:ui:interaction',
    'test:ui:examples',
    'test:ui:process',
    'test:ui:io',
    'test:ui:array',
    'test:ui:product:layout',
    'test:ui:product:renderer',
  ];
  for (const command of commands) {
    assert.ok(pkg.scripts[command], command);
    assert.doesNotMatch(pkg.scripts[command], /--skip|--no-science|\|\| true/);
  }
  for (const [filename, domain] of Object.entries(owners)) {
    const code = await readFile(join(root, filename), 'utf8');
    assert.match(code, /runNativeReleaseOwner/, filename);
    assert.doesNotMatch(
      code.replace(/^\/\/.*$/gm, ''),
      /newLegacyUi|waitForAppReady|app-legacy\.html/,
      filename,
    );
    assert.ok(RELEASE_V2_OWNERS[domain]?.length >= 1, domain);
    assert.ok(RELEASE_SCIENTIFIC_TESTS[domain]?.length >= 1, domain);
  }
});

test('scientific browser owners have executable v2 checks and actual Node predicates', async () => {
  for (const [domain, sources] of Object.entries(RELEASE_V2_OWNERS)) {
    for (const filename of sources) {
      const code = await readFile(join(root, filename), 'utf8');
      assert.match(code, /assert\./, domain + ': ' + filename);
      assert.doesNotMatch(code.replace(/^\/\/.*$/gm, ''), /app-legacy\.html/, filename);
    }
    for (const filename of RELEASE_SCIENTIFIC_TESTS[domain]) {
      const code = await readFile(join(root, filename), 'utf8');
      assert.match(code, /(?:assert\.|test\()/, domain + ': ' + filename);
    }
  }
  const workflow = await readFile(join(root, '.github/workflows/browser-regression.yml'), 'utf8');
  assert.match(workflow, /release-ui-owners:/);
  assert.match(workflow, /matrix:\s*\n\s*domain: \[process, io, array\]/);
  assert.match(workflow, /fromJson\(needs\.plan\.outputs\.extended_matrix\)/);
  assert.match(workflow, /npm run test:ui:interaction/);
  assert.match(workflow, /npm run test:ui:array/);
  assert.match(workflow, /node scripts\/renderer-product-regression\.mjs/);
});

test('Example Run All retains native-v2 science and all original replay cases', async () => {
  const code = await readFile(join(root, 'scripts/example-recipe-runall-acceptance.mjs'), 'utf8');
  const workflow = await readFile(
    join(root, '.github/workflows/example-recipe-reconstruction.yml'),
    'utf8',
  );
  assert.match(workflow, /node scripts\/example-recipe-runall-acceptance\.mjs/);
  assert.match(code, /\/app\.html\?start=example/);
  assert.doesNotMatch(
    code.replace(/^\/\/.*$/gm, ''),
    /app-legacy\.html|newLegacyUiContext|waitForAppReady|waitForStatus/,
  );
  for (const required of [
    /await loadGeometryKernel\(\)/,
    /assertSameMaterialGeometry/,
    /assertSameCanonicalArrayGeometry/,
    /sourceProject\.snapshotBranches\.nodes/,
    /maxQuantizedAreaUm2: 25/,
    /assert\.equal\(replayNodes\.length, processSteps\.length\)/,
  ]) assert.match(code, required);
});
