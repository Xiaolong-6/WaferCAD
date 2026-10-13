import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { shouldPublishSitePath, stagePagesAssets } from '../../scripts/build-pages-artifact.mjs';

test('Pages includes product assets but excludes previews and developer-only fixtures', () => {
  for (const path of [
    'index.html',
    'app.html',
    'app-legacy.html',
    'guide/index.html',
    'ui-v2/workstation-entry.js',
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
    'app-v2.html',
    'app-v2-main.html',
    'app-v2-mask.html',
    'app-v2-real.html',
    'ui-v2/app.html',
    'ui-v2/gallery.html',
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
    '../package.json',
  ]) {
    assert.equal(shouldPublishSitePath(path), false, path);
  }
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
  await writeFile(join(source, 'ui-v2', 'mock-data.js'), 'fixture');
  await writeFile(join(source, 'ui-v2', 'prototypes', 'index.html'), 'prototype');
  await writeFile(join(source, 'tests', 'example.test.mjs'), 'test');
  await writeFile(join(source, 'examples', 'live.wafercad'), 'project');

  await stagePagesAssets({ source, destination });
  assert.equal(await readFile(join(destination, 'app.html'), 'utf8'), 'production');
  assert.equal(await readFile(join(destination, 'examples', 'live.wafercad'), 'utf8'), 'project');
  await assert.rejects(access(join(destination, 'ui-v2', 'mock-data.js')));
  await assert.rejects(access(join(destination, 'ui-v2', 'prototypes', 'index.html')));
  await assert.rejects(access(join(destination, 'tests')));
  assert.equal(await readFile(join(source, 'ui-v2', 'mock-data.js'), 'utf8'), 'fixture');
  await assert.rejects(stagePagesAssets({ source, destination: join(source, 'published') }));
});
