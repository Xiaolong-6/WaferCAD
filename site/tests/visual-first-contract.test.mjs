import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseVisualCaptureSettings,
  resolvePinnedThree,
  sourceEvidence,
} from '../../scripts/v2/visual-first-contract.mjs';

test('real-app visual capture defaults to production views at two desktop/compact widths', () => {
  assert.deepEqual(parseVisualCaptureSettings({}).views, ['main', 'mask', 'three', 'section']);
  assert.deepEqual(
    parseVisualCaptureSettings({}).viewports.map((x) => x.width),
    [1440, 390],
  );
});
test('real-app capture permits scoped views and an empty live Workstation', () => {
  const result = parseVisualCaptureSettings({
    WAFERCAD_VISUAL_START: 'empty',
    WAFERCAD_VISUAL_VIEWS: 'main,section',
    WAFERCAD_VISUAL_VIEWPORTS: '390x844,1440x900',
    WAFERCAD_VISUAL_SWIFTSHADER: '1',
  });
  assert.deepEqual(result.views, ['main', 'section']);
  assert.equal(result.start, 'empty');
  assert.equal(result.softwareWebgl, true);
});
test('2D/UI scope selects native Main, Mask and Section without requiring WebGL', () => {
  const options = parseVisualCaptureSettings({
    WAFERCAD_VISUAL_SCOPE: '2d-ui',
    WAFERCAD_VISUAL_START: 'empty',
  });
  assert.equal(options.scope, '2d-ui');
  assert.deepEqual(options.views, ['main', 'mask', 'section']);
  assert.deepEqual(options.untestedViews, ['three']);
  assert.equal(options.requiresWebgl, false);
  assert.equal(options.start, 'empty');
});
test('3D-only scope remains an independent mandatory WebGL gate', () => {
  const options = parseVisualCaptureSettings({ WAFERCAD_VISUAL_SCOPE: '3d' });
  assert.deepEqual(options.views, ['three']);
  assert.equal(options.requiresWebgl, true);
  assert.deepEqual(options.untestedViews, ['main', 'mask', 'section']);
});
test('visual scope does not permit silently expanding to unvalidated views', () => {
  for (const env of [
    { WAFERCAD_VISUAL_SCOPE: '2d-ui', WAFERCAD_VISUAL_VIEWS: 'main,three' },
    { WAFERCAD_VISUAL_SCOPE: '3d', WAFERCAD_VISUAL_VIEWS: 'section' },
    { WAFERCAD_VISUAL_SCOPE: 'unknown' },
  ]) {
    assert.throws(() => parseVisualCaptureSettings(env));
  }
});
test('invalid view, viewport, and example fail closed', () => {
  for (const env of [
    { WAFERCAD_VISUAL_VIEWS: 'main,fake' },
    { WAFERCAD_VISUAL_VIEWS: 'main,main' },
    { WAFERCAD_VISUAL_VIEWPORTS: '2x4' },
    { WAFERCAD_VISUAL_VIEWPORTS: '300x700' },
    { WAFERCAD_VISUAL_VIEWPORTS: '390x844,390x700' },
    { WAFERCAD_VISUAL_EXAMPLE: '../secret' },
    { WAFERCAD_VISUAL_SWIFTSHADER: 'yes' },
  ]) {
    assert.throws(() => parseVisualCaptureSettings(env));
  }
});
test('manual native Photodetector capture demands a real model and completed rough mesh', () => {
  const capture = parseVisualCaptureSettings({
    WAFERCAD_VISUAL_START: 'empty',
    WAFERCAD_VISUAL_OPEN_PROJECT: 'photodetector-literature-examples.wafercad',
    WAFERCAD_VISUAL_EXPECT_PROJECT: 'photodetector-literature-examples.wafercad',
    WAFERCAD_VISUAL_EXPECT_LAYERS: '6',
    WAFERCAD_VISUAL_EXPECT_REGIONS: '5',
    WAFERCAD_VISUAL_REQUIRE_ROUGH: '1',
    WAFERCAD_VISUAL_VIEWPORTS: '1440x900',
  });
  assert.equal(capture.openProject, 'photodetector-literature-examples.wafercad');
  assert.equal(capture.expectedProject, capture.openProject);
  assert.equal(capture.expectedLayers, 6);
  assert.equal(capture.expectedRegions, 5);
  assert.equal(capture.requireRough, true);
  assert.deepEqual(capture.views, ['main', 'mask', 'three', 'section']);
});

test('rough evidence and manual Open constraints fail closed', () => {
  for (const env of [
    { WAFERCAD_VISUAL_REQUIRE_ROUGH: 'x' },
    { WAFERCAD_VISUAL_REQUIRE_ROUGH: '1', WAFERCAD_VISUAL_SCOPE: '2d-ui' },
    { WAFERCAD_VISUAL_REQUIRE_ROUGH: '1', WAFERCAD_VISUAL_START: 'empty' },
    { WAFERCAD_VISUAL_OPEN_PROJECT: '../project.wafercad', WAFERCAD_VISUAL_START: 'empty' },
    { WAFERCAD_VISUAL_OPEN_PROJECT: 'sample.wafercad' },
    { WAFERCAD_VISUAL_EXPECT_LAYERS: '0' },
    { WAFERCAD_VISUAL_EXPECT_REGIONS: 'NaN' },
    { WAFERCAD_VISUAL_EXPECT_PROJECT: '../private.wafercad' },
  ]) {
    assert.throws(() => parseVisualCaptureSettings(env));
  }
});

test('pinned Three.js discovery does not silently fall back to a different version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wc-visual-contract-'));
  try {
    assert.equal(await resolvePinnedThree(root), null);
    const three = join(root, 'node_modules/three');
    await mkdir(join(three, 'build'), { recursive: true });
    await writeFile(join(three, 'package.json'), '{"version":"0.179.2"}');
    await writeFile(join(three, 'build/three.module.js'), 'export {};');
    await assert.rejects(resolvePinnedThree(root), /0\.179\.1 required/);
    await writeFile(join(three, 'package.json'), '{"version":"0.179.1"}');
    assert.equal(await resolvePinnedThree(root), three);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('source hashes work from an uploaded archive without claiming a Git HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wc-visual-provenance-'));
  try {
    const files = [
      'app.html',
      'plan-renderers.js',
      'three-view.js',
      'renderer-geometry.js',
      'ui-v2/workstation-entry.js',
      'ui-v2/workstation-v2.js',
      'ui-v2/workstation-v2.css',
      'ui-v2/mobile-workstation.css',
      'ui-v2/desktop-shell.css',
    ];
    for (const path of files) {
      await mkdir(join(root, 'site', path, '..'), { recursive: true });
      await writeFile(join(root, 'site', path), path);
    }
    const evidence = await sourceEvidence(root);
    assert.equal(evidence.revision, null);
    assert.equal(evidence.dirty, null);
    assert.equal(evidence.provenance, 'source-files-no-git');
    assert.equal(Object.keys(evidence.sourceHashes).length, files.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
