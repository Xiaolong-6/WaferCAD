import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditSiteReachability } from '../../scripts/audit-site-reachability.mjs';
import { shouldPublishSitePath, stagePagesAssets } from '../../scripts/build-pages-artifact.mjs';

test('style.css exclusion matches only the exact site-relative path', () => {
  assert.equal(shouldPublishSitePath('style.css'), false);
  assert.equal(shouldPublishSitePath('./style.css'), false);
  assert.equal(shouldPublishSitePath('nested/style.css'), true);
  assert.equal(shouldPublishSitePath('ui-v2/style.css'), true);
});

test('published scripts, styles, manifests, Workers and previews do not reference style.css', async () => {
  const { readdir } = await import('node:fs/promises');
  const { extname, relative } = await import('node:path');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const extensions = new Set([
    '.html',
    '.js',
    '.mjs',
    '.css',
    '.json',
    '.webmanifest',
    '.xml',
    '.txt',
  ]);
  const offenders = [];
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const full = join(folder, item.name);
      const path = relative(root, full).replaceAll('\\', '/');
      if (!shouldPublishSitePath(path)) continue;
      if (item.isDirectory()) await visit(full);
      else if (item.isFile() && extensions.has(extname(item.name))) {
        const content = await readFile(full, 'utf8');
        if (/(^|[^\w-])style\.css(?:[?#]|\b)/.test(content)) offenders.push(path);
      }
    }
  }
  await visit(root);
  assert.deepEqual(offenders, [], 'Production asset would reference removed style.css');
});

test('Pages includes product assets but excludes previews and developer-only fixtures', () => {
  for (const path of [
    'index.html',
    'app.html',
    'guide/index.html',
    'ui-v2/workstation-entry.js',
    'experimental/physical-facets/physical-facet-model.js',
    'ui-v2/workstation-preview.css',
    'ui-v2/real-three-controls.js',
    'examples/tio2-metalens-full-array.wafercad',
    'examples/previews/m3d-selfpowered-heterogeneous-ic.wafercad',
    'vendor/polygon-clipping.umd.js',
    'process-worker.js',
    'ui-v2/fonts/InterVariable.woff2',
  ]) {
    assert.equal(shouldPublishSitePath(path), true, path);
  }

  for (const path of [
    'app-legacy.html',
    'app.js',
    'workstation.css',
    'style.css',
    'isotropic-release-topology.js',
    'experimental/physical-facets/physical-facet-coating.js',
    'experimental/physical-facets/physical-facet-coating-section.js',
    'workstation-ui.js',
    'controllers/build-controller.js',
    'controllers/startup-controller.js',
    'controllers/view-popover-controller.js',
    'app-v2.html',
    'app-v2-main.html',
    'app-v2-mask.html',
    'app-v2-real.html',
    'ui-v2/app.html',
    'ui-v2/gallery.html',
    'ui-v2/history-tree.js',
    'ui-v2/mock-data.js',
    'ui-v2/mock-domain-panels.js',
    'ui-v2/mock-views.js',
    'ui-v2/mock-workspace.js',
    'ui-v2/production-workspace.js',
    'ui-v2/live-preview.js',
    'ui-v2/shell-preview.js',
    'ui-v2/real-view-bridge.js',
    'ui-v2/real-view-bridge.css',
    'ui-v2/real-section-controls.js',
    'ui-v2/prototypes/a-full/index.html',
    'ui-v2/reviews/contract-decisions.html',
    'tests/ci-workflow-architecture.test.mjs',
    'experimental/microdisk/suspended-silica-microdisks-adaptive.wafercad',
    '../package.json',
  ]) {
    assert.equal(shouldPublishSitePath(path), false, path);
  }
});

test('development-only JS and CSS must be excluded from the public Pages artifact', async () => {
  const source = fileURLToPath(new URL('..', import.meta.url));
  const audit = await auditSiteReachability(source);
  assert.ok(audit.developerOnly.includes('ui-v2/history-tree.js'));
  assert.deepEqual(
    audit.developerOnly.filter((file) => shouldPublishSitePath(file)),
    [],
    'Developer-only modules reached by test/preview roots must remain private to Git source',
  );
});

test('staging copies production files without altering source or shipping tests', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wafercad-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'site');
  const destination = join(root, 'build', 'pages');
  await mkdir(join(source, 'ui-v2', 'prototypes'), { recursive: true });
  await mkdir(join(source, 'examples'), { recursive: true });
  await mkdir(join(source, 'tests'), { recursive: true });
  await writeFile(join(source, 'app.html'), 'production');
  await writeFile(join(source, 'app-legacy.html'), 'Legacy source must never deploy');
  await writeFile(join(source, 'app.js'), 'Legacy script must never deploy');
  await writeFile(join(source, 'style.css'), 'retired editor styles');
  await writeFile(join(source, 'welcome.css'), 'live welcome styles');
  await writeFile(join(source, 'ui-v2', 'mock-data.js'), 'fixture');
  await writeFile(join(source, 'ui-v2', 'prototypes', 'index.html'), 'prototype');
  await writeFile(join(source, 'tests', 'example.test.mjs'), 'test');
  await writeFile(join(source, 'examples', 'live.wafercad'), 'project');

  await stagePagesAssets({ source, destination });
  assert.equal(await readFile(join(destination, 'app.html'), 'utf8'), 'production');
  const redirect = await readFile(join(destination, 'app-legacy.html'), 'utf8');
  assert.match(redirect, /location\.replace\('\.\/app\.html'/);
  assert.doesNotMatch(redirect, /Legacy source must never deploy/);
  await assert.rejects(access(join(destination, 'style.css')));
  await assert.rejects(access(join(destination, 'app.js')));
  for (const sourceFile of [
    'isotropic-release-topology.js',
    'experimental/physical-facets/physical-facet-coating.js',
    'experimental/physical-facets/physical-facet-coating-section.js',
  ]) {
    await assert.rejects(access(join(destination, sourceFile)));
  }
  assert.equal(await readFile(join(destination, 'examples', 'live.wafercad'), 'utf8'), 'project');
  assert.equal(await readFile(join(destination, 'welcome.css'), 'utf8'), 'live welcome styles');
  assert.equal(await readFile(join(source, 'style.css'), 'utf8'), 'retired editor styles');
  await assert.rejects(access(join(destination, 'ui-v2', 'mock-data.js')));
  await assert.rejects(access(join(destination, 'ui-v2', 'prototypes', 'index.html')));
  await assert.rejects(access(join(destination, 'tests')));
  assert.equal(await readFile(join(source, 'ui-v2', 'mock-data.js'), 'utf8'), 'fixture');
  await assert.rejects(stagePagesAssets({ source, destination: join(source, 'published') }));
});

test('real Pages staging preserves each entrypoint local stylesheet and script', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wafercad-pages-real-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = fileURLToPath(new URL('..', import.meta.url));
  const destination = join(root, 'pages');
  await stagePagesAssets({ source, destination });

  const audit = await auditSiteReachability(destination, { surface: 'pages' });
  assert.equal(audit.surface, 'pages');
  assert.deepEqual(audit.productionRoots, ['index.html', 'app.html', 'guide/index.html']);
  assert.deepEqual(audit.compatibilityRoots, ['app-legacy.html']);
  assert.ok(audit.productionReachable > 20, 'Published v2 modules stay reachable');
  assert.deepEqual(
    audit.compatibilityOnly,
    ['app-legacy.html'],
    'The Legacy bookmark shim must not introduce executable-only dependencies',
  );

  const redirect = await readFile(join(destination, 'app-legacy.html'), 'utf8');
  assert.ok(redirect.includes("location.replace('./app.html' + location.search + location.hash)"));
  assert.doesNotMatch(redirect, /app\.js|workstation\.css|workstation-boot/i);
  await assert.rejects(access(join(destination, 'app.js')));
  await assert.rejects(access(join(destination, 'workstation.css')));
  await assert.rejects(access(join(destination, 'style.css')));
  for (const page of ['index.html', 'app.html', 'app-legacy.html']) {
    const html = await readFile(join(destination, page), 'utf8');
    const resourceTags = html.match(/<(?:script|link)\b[^>]*>/g) || [];
    for (const tag of resourceTags) {
      const reference = tag.match(/(?:src|href)=["']([^"']+)["']/)?.[1] || '';
      if (!reference || /^(?:https?:|data:|\/|#)/.test(reference)) continue;
      const file = reference.split(/[?#]/)[0].replace(/^\.\//, '');
      if (!file) continue;
      await access(join(destination, file));
    }
  }
  for (const file of [
    'welcome.css',
    'welcome.js',
    'ui-v2/workstation-entry.js',
    'ui-v2/workstation-preview.css',
    'app-legacy.html',
    'vendor/polygon-clipping.umd.js',
    'examples/tio2-metalens-full-array.wafercad',
  ]) {
    await access(join(destination, file));
  }
  await assert.rejects(access(join(destination, 'ui-v2', 'prototypes')));
  await assert.rejects(access(join(destination, 'ui-v2', 'history-tree.js')));
  await assert.rejects(access(join(destination, 'tests')));
});
