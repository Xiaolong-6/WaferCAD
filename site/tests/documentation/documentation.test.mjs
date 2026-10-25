import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditDocumentation, headingAnchors } from '../../../scripts/check-documentation.mjs';
import { qualityPlan } from '../../../scripts/local-verification.mjs';

test('archived M0 DOM inventory preserves the exact original machine-readable evidence', async () => {
  const bytes = await readFile(
    new URL('../../../docs/archive/ui-v2/contract.json', import.meta.url),
  );
  assert.ok(
    bytes.byteLength > 1_000_000,
    'archived M0 DOM inventory must not be empty or replaced by a stub',
  );
  assert.doesNotThrow(() => JSON.parse(bytes.toString('utf8')));
  const gitBlobSha = createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest('hex');
  assert.equal(
    gitBlobSha,
    '128a709cdf1c1b4f610f32813b3df2f81fb1c1f7',
    'archival DOM inventory must retain the byte-exact original main blob',
  );
});

async function fixture(t, entries) {
  const rootDir = await mkdtemp(join(tmpdir(), 'wafercad-docs-'));
  t.after(async () => {
    assert.ok(rootDir.startsWith(join(tmpdir(), 'wafercad-docs-')));
    await rm(rootDir, { recursive: true, force: true });
  });
  for (const [path, text] of Object.entries(entries)) {
    await mkdir(join(rootDir, path, '..'), { recursive: true });
    await writeFile(join(rootDir, path), text);
  }
  return auditDocumentation({ rootDir, files: Object.keys(entries) });
}

test('source-only documentation audit uses the full source manifest when Git is unavailable', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'wafercad-docs-portable-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, 'docs'), { recursive: true });
  await writeFile(join(rootDir, 'README.md'), '# Root\n[Manual](docs/Manual.md)\n');
  await writeFile(join(rootDir, 'docs/README.md'), '# Docs\n[Manual](Manual.md)\n');
  await writeFile(join(rootDir, 'docs/Manual.md'), '# Manual\n');
  await writeFile(
    join(rootDir, 'wafercad-source-manifest.json'),
    JSON.stringify({
      schema: 'wafercad-source-only-v1',
      files: {
        'README.md': '0'.repeat(64),
        'docs/README.md': '2'.repeat(64),
        'docs/Manual.md': '1'.repeat(64),
      },
    }),
  );
  const result = await auditDocumentation({ rootDir });
  assert.deepEqual(result.errors, []);
  await rm(join(rootDir, 'wafercad-source-manifest.json'));
  await assert.rejects(
    () => auditDocumentation({ rootDir }),
    /Documentation audit needs Git or wafercad-source-manifest.json/,
  );
});

test('all documentation PRs retain automatic local Quality ownership and manual diagnostics', async () => {
  const quality = await readFile(
    new URL('../../../.github/workflows/quality.yml', import.meta.url),
    'utf8',
  );
  const docsDiagnostic = await readFile(
    new URL('../../../.github/workflows/documentation-wiki-targeted.yml', import.meta.url),
    'utf8',
  );
  assert.match(quality, /pull_request:\n    branches: \[main\]/);
  assert.doesNotMatch(
    quality,
    /^\s+paths(?:-ignore)?:/m,
    'Quality must include every PR source path',
  );
  assert.match(quality, /QUALITY_SCOPE: .*'draft'.*'full'/);
  assert.ok(quality.includes('node scripts/local-verification.mjs verify "$QUALITY_SCOPE"'));
  assert.match(quality, /name: Reject missing or stale PR proof before remote tests/);
  assert.doesNotMatch(quality, /name: Execute Draft Quality fallback/);
  assert.match(quality, /name: Final lint, formatting, generated documentation and Node tests/);
  assert.match(quality, /run: npm run check/);
  assert.match(quality, /node scripts\/local-verification\.mjs verify full/);
  assert.ok(
    qualityPlan('draft').at(-1).args.includes('site/tests/documentation-suite.test.mjs'),
    'Draft Quality must retain documentation tests',
  );
  assert.deepEqual(qualityPlan('full').at(-1).args, ['test']);
  assert.match(docsDiagnostic, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(docsDiagnostic, /^\s+pull_request:/m);
  assert.match(docsDiagnostic, /node scripts\/local-verification\.mjs verify full/);
});

test('current documentation does not advertise retired Legacy editor sources', async () => {
  const repo = new URL('../../../', import.meta.url);
  for (const retired of ['app-legacy.html', 'app.js', 'workstation.css']) {
    await assert.rejects(
      access(new URL('site/' + retired, repo)),
      { code: 'ENOENT' },
      `retired ${retired} must not be treated as a current source`,
    );
  }
  for (const path of [
    'README.md',
    'docs/DEVELOPMENT.md',
    'docs/CI.md',
    'docs/testing.md',
    'docs/science/PROCESS_BOTH_FACE_2026-10-11.md',
    'docs/wiki/Process-and-Recipes.md',
  ]) {
    const source = await readFile(new URL(path, repo), 'utf8');
    assert.match(source, /legacy-frozen/, `${path}: point readers to the frozen source`);
  }
});

test('all repository documentation is reachable with valid internal destinations', async () => {
  const result = await auditDocumentation();
  assert.deepEqual(result.errors, []);
  assert.ok(result.internalLinks > 100);
  assert.ok(result.moduleReferences > 20);
});

test('Wiki aliases, repository links and fenced examples resolve in their correct context', async (t) => {
  const result = await fixture(t, {
    'docs/README.md': '# Map\n[Manual](wiki/Home.md)\n',
    'docs/wiki/Home.md':
      '# Home\n[Start](Getting-Started#units)\n```md\n[example](missing.md)\n````\n   ~~~md\n![Ignored](missing.png)\n   ~~~\n',
    'docs/wiki/Getting-Started.md':
      '# Started\n## Units\n[Home](https://github.com/Xiaolong-6/WaferCAD/wiki)\n',
  });
  assert.deepEqual(result.errors, []);
});

test('missing assets, invalid anchors, wrong filename case and orphan pages fail', async (t) => {
  const result = await fixture(t, {
    'docs/README.md': '# Map\n[Page](Page.md#missing)\n[Case](page.md)\n![Missing](missing.png)\n',
    'docs/Page.md': '# Page\n',
    'docs/Orphan.md': '# Orphan\n',
  });
  assert.ok(result.errors.some((error) => error.includes('missing heading')));
  assert.ok(result.errors.some((error) => /filename case|missing target.*page\.md/.test(error)));
  assert.ok(result.errors.some((error) => error.includes('missing.png')));
  assert.ok(result.errors.some((error) => error.includes('Orphan.md: unreachable')));
});

test('documentation cannot invent public operations, examples or Architecture modules', async (t) => {
  const result = await fixture(t, {
    'docs/README.md':
      '# Map\n[Architecture](ARCHITECTURE.md)\n[Atlas](https://xiaolong-6.github.io/WaferCAD/guide/#unknown)\n[Example](https://xiaolong-6.github.io/WaferCAD/app.html?example=unknown)\n',
    'docs/ARCHITECTURE.md': '# Architecture\n`site/missing.js`\n',
    'site/guide/index.html': '<title>Guide</title>',
    'site/app.html': '<title>App</title>',
  });
  assert.ok(result.errors.some((error) => error.includes('unknown Process atlas operation')));
  assert.ok(result.errors.some((error) => error.includes('unknown Welcome example')));
  assert.ok(result.errors.some((error) => error.includes('missing module')));
});

test('heading links retain Unicode, duplicate suffixes and explicit generated anchors', () => {
  const anchors = headingAnchors(
    '# 中文教程\n## `Units` and **scale**\n## Units and scale\n<a id="deposit-transfer-follow"></a>\n',
  );
  assert.ok(anchors.has('中文教程'));
  assert.ok(anchors.has('units-and-scale'));
  assert.ok(anchors.has('units-and-scale-1'));
  assert.ok(anchors.has('deposit-transfer-follow'));
});

test('categorized documents have no forwarding files or obsolete root aliases', async () => {
  const docsRoot = new URL('../../../docs/', import.meta.url);
  const rootFiles = await readdir(docsRoot, { withFileTypes: true });
  assert.ok(rootFiles.length > 0);
  for (const entry of rootFiles.filter((item) => item.isFile() && item.name.endsWith('.md'))) {
    const source = await readFile(new URL(entry.name, docsRoot), 'utf8');
    assert.doesNotMatch(source, /^# Moved:/, `${entry.name}: remove obsolete forwarding file`);
  }
  await assert.rejects(access(new URL('COMPATIBILITY.md', docsRoot)), { code: 'ENOENT' });

  const archiveRoot = new URL('archive/', docsRoot);
  const archiveIndex = await readFile(new URL('README.md', archiveRoot), 'utf8');
  const archived = (await readdir(archiveRoot, { recursive: true }))
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('.md') && entry !== 'README.md');
  assert.equal(archived.length, 87, 'archive inventory must be reviewed deliberately');
  for (const entry of archived) {
    assert.ok(archiveIndex.includes(`](${entry})`), `archive index must link to ${entry}`);
    await assert.rejects(
      access(new URL(entry, docsRoot)),
      { code: 'ENOENT' },
      `archive content must have no duplicate root file: ${entry}`,
    );
  }
});

test('historical review captures have one canonical archival location', async () => {
  const docs = new URL('../../../docs/', import.meta.url);
  const review = await readFile(new URL('archive/PRODUCT_REVIEW.md', docs), 'utf8');
  const evidence = await readFile(new URL('archive/review/README.md', docs), 'utf8');
  for (const image of [
    'ab-wide.png',
    'ab-phone.png',
    'roi-phone.png',
    'trench-front.png',
    'island-back.png',
  ]) {
    await access(new URL('archive/review/' + image, docs));
    await assert.rejects(access(new URL('review/' + image, docs)), { code: 'ENOENT' });
    assert.ok(review.includes('(review/' + image + ')'));
    assert.ok(evidence.includes('(' + image + ')'));
  }
  await assert.rejects(access(new URL('review/README.md', docs)), { code: 'ENOENT' });
});

test('documentation rejects published local user paths and credential strings', async (t) => {
  const result = await fixture(t, {
    'docs/README.md': '# Map\n[Evidence](evidence.txt)\n',
    'docs/evidence.txt': 'C:/Users/ExamplePerson/private\n' + 'ghp_' + 'x'.repeat(24),
  });
  assert.ok(result.errors.some((error) => error.includes('unsanitized Windows user path')));
  assert.ok(result.errors.some((error) => error.includes('possible credential')));
});
