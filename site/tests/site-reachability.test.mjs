import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  auditSiteReachability,
  extractLiteralReferences,
  resolveReference,
} from '../../scripts/audit-site-reachability.mjs';

test('site reachability resolver honors versioned URLs without traversing outside site', () => {
  const files = new Set(['app.html', 'js/app.js', 'js/worker.js']);
  assert.equal(resolveReference('app.html', './js/app.js?v=1234', files), 'js/app.js');
  assert.equal(resolveReference('js/app.js', './worker.js', files), 'js/worker.js');
  assert.equal(resolveReference('app.html', '../private.js', files), null);
  assert.equal(resolveReference('app.html', 'https://example.com/a.js', files), null);
  assert.equal(resolveReference('app.html', './js/' + '$' + '{name}.js', files), null);
});

test('site reachability extracts HTML, CSS and module literal paths', () => {
  const htmlReferences = extractLiteralReferences('<script src="./js/app.js"></script>', '.html');
  assert.deepEqual(htmlReferences, ['./js/app.js']);
  assert.ok(extractLiteralReferences("import './worker.js';", '.js').includes('./worker.js'));
  assert.ok(extractLiteralReferences("background: url('./x.svg');", '.css').includes('./x.svg'));
});

test('site reachability separates runtime, developer and unproven modules', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wafercad-reachability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'js'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });
  await writeFile(join(root, 'app.html'), '<script type="module" src="./js/live.js"></script>');
  await writeFile(join(root, 'js', 'live.js'), "import './worker.js';");
  await writeFile(join(root, 'js', 'worker.js'), 'export const live = true;');
  await writeFile(join(root, 'js', 'dev.js'), 'export const dev = true;');
  await writeFile(join(root, 'js', 'orphan.js'), 'export const orphan = true;');
  await writeFile(join(root, 'tests', 'dev.test.mjs'), "import '../js/dev.js';");
  const report = await auditSiteReachability(root);
  assert.equal(report.productionReachable, 3);
  assert.deepEqual(report.developerOnly, ['js/dev.js']);
  assert.deepEqual(report.unproven, ['js/orphan.js']);
});

test('audit real site entrypoint reachability without deleting uncertain modules', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const report = await auditSiteReachability(root);
  assert.ok(report.productionRoots.includes('app.html'));
  assert.ok(report.productionRoots.includes('app-legacy.html'));
  assert.ok(report.productionReachable > 20);
  const summary = {
    scannedFiles: report.scannedFiles,
    productionReachable: report.productionReachable,
    developerOnly: report.developerOnly,
    unproven: report.unproven,
  };
  console.log('SITE_REACHABILITY_AUDIT ' + JSON.stringify(summary));
});
