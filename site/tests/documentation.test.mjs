import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditDocumentation, headingAnchors } from '../../scripts/check-documentation.mjs';

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

test('archived documents have canonical links and no obsolete originals', async () => {
  const archiveRoot = new URL('../../docs/archive/', import.meta.url);
  const archiveIndex = await readFile(new URL('README.md', archiveRoot), 'utf8');
  const archived = (await readdir(archiveRoot, { recursive: true }))
    .map((entry) => String(entry).replaceAll('\\\\', '/'))
    .filter((entry) => entry.endsWith('.md') && entry !== 'README.md');

  // The 2026-10-16 structure audit deliberately relocated exactly three dated
  // records. Their original URLs remain readable as forwarding pages.
  const relocated = new Set([
    'CI_ARCHITECTURE_AUDIT_2026-10-12.md',
    'SITE_EXPORT_API_REVIEW_2026-10-13.md',
    'SITE_SCIENTIFIC_SYMBOL_REVIEW_2026-10-13.md',
  ]);
  assert.equal(archived.length, 79 + relocated.size, 'archive inventory must be reviewed deliberately');
  const compatibility = await readFile(new URL('../../docs/COMPATIBILITY.md', import.meta.url), 'utf8');
  assert.doesNotMatch(archiveIndex, /legacy permalink|compatibility pointer/);
  for (const entry of archived) {
    assert.ok(
      archiveIndex.includes(`](${entry})`),
      `archive index must link directly to the canonical report: ${entry}`,
    );
    const obsoletePath = new URL(`../../docs/${entry}`, import.meta.url);
    if (relocated.has(entry)) {
      const pointer = await readFile(obsoletePath, 'utf8');
      assert.match(pointer, /^# Moved:/);
      assert.ok(pointer.includes(`archive/${entry}`), `archive alias must forward: ${entry}`);
      assert.ok(compatibility.includes(`](${entry})`), `archive alias must be indexed: ${entry}`);
    } else {
      await assert.rejects(
        access(obsoletePath),
        { code: 'ENOENT' },
        `obsolete historical stub must be deleted: ${entry}`,
      );
    }
  }
});

test('documentation rejects published local user paths and credential strings', async (t) => {
  const result = await fixture(t, {
    'docs/README.md': '# Map\n[Evidence](evidence.txt)\n',
    'docs/evidence.txt': 'C:/Users/ExamplePerson/private\n' + 'ghp_' + 'x'.repeat(24),
  });
  assert.ok(result.errors.some((error) => error.includes('unsanitized Windows user path')));
  assert.ok(result.errors.some((error) => error.includes('possible credential')));
});
