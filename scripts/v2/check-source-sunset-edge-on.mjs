// Real native-v2 625-site transparent LOD: completed exact walls and fitted
// far-tier recovery. No accepting a transitional or unrendered exact frame.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/array-renderer-edge-on');
await mkdir(output, { recursive: true });
const evidence = { result: 'running', errors: [] };
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    page.on('pageerror', (error) => evidence.errors.push(error.message));
    await page.goto(base + '/app.html?start=example&example=three-tier-silicon-jlfets', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const initial = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(initial.model.array.instances.length, 1885, 'complete wafer instances');
    assert.equal(
      initial.model.array.instances.filter((site) => site.role === 'device').length,
      625,
      '625 physical device sites',
    );
    await selectScientificView(page, 'three', 1440);
    const host = page.locator('#threeHost');
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 180000 },
    );
    const sample = () => host.evaluate((node) => ({ ...node.dataset }));
    const before = await sample();
    assert.ok(Number(before.rendererDrawTriangles) > 0, 'real initial 3D WebGL frame');
    if (
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).threeDisplay.fast ===
      false
    ) {
      await page.locator('#threePanel [data-action="quality:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderQuality === 'fast',
        null,
        { timeout: 180000 },
      );
    }
    await page.locator('#threePanel [data-action="opacity:three"]').click();
    const beforeFar = Number((await sample()).rendererFrameSerial || 0);
    await page.locator('#threeOpacityRange').fill('0.5');
    // Scene ownership can advance before WebGL presents the new tier. Use
    // the *completed* far frame, never cached diagnostics from the opaque one.
    await page.waitForFunction(
      (previous) => {
        const node = document.getElementById('threeHost');
        return (
          /^far-/.test(node?.dataset.transparentArrayLodTier || '') &&
          /^far-/.test(node?.dataset.rendererFrameArrayLodTier || '') &&
          node.dataset.rendererFrameSceneGeneration === node.dataset.sceneGeneration &&
          node.dataset.renderState === 'ready' &&
          Number(node.dataset.rendererFrameSerial || 0) > previous &&
          Number(node.dataset.rendererDrawTriangles || 0) > 0
        );
      },
      beforeFar,
      { timeout: 240000 },
    );
    const far = await sample();
    // Native v2 selects an explicit pointer gesture mode, deliberately disabling
    // inertial OrbitControls damping at both LOD tiers. Verify that policy
    // rather than assuming the frozen Legacy editor's default camera mode.
    assert.equal(far.cameraDampingEnabled, 'false');
    assert.ok(Number(far.electricalFarLodBodyCount) > 0);
    const triangles = Number(far.rendererDrawTriangles);
    const canvas = host.locator('canvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 10 && box.height > 10);
    await page.screenshot({ path: resolve(output, 'far.png') });
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY - 24, { steps: 4 });
    await page.mouse.up();
    const handle = await page.waitForFunction(
      ({ previous, farTriangles }) => {
        const node = document.getElementById('threeHost');
        if (
          node?.dataset.transparentArrayLodTier !== 'exact' ||
          node.dataset.renderState !== 'ready' ||
          node.dataset.rendererFrameArrayLodTier !== 'exact' ||
          node.dataset.rendererFrameSceneGeneration !== node.dataset.sceneGeneration ||
          Number(node.dataset.rendererFrameSerial || 0) <= previous ||
          Number(node.dataset.rendererDrawTriangles || 0) <= farTriangles
        )
          return false;
        const exact = { ...node.dataset };
        document.querySelector('#threePanel [data-action="fit:three"]')?.click();
        return JSON.stringify(exact);
      },
      { previous: Number(far.rendererFrameSerial || 0), farTriangles: triangles },
      { timeout: 240000, polling: 100 },
    );
    const exact = JSON.parse(await handle.jsonValue());
    assert.equal(exact.transparentArrayLodTier, 'exact');
    assert.equal(exact.rendererFrameArrayLodTier, 'exact');
    assert.equal(exact.rendererFrameSceneGeneration, exact.sceneGeneration);
    assert.equal(exact.cameraDampingEnabled, 'false');
    assert.equal(Number(exact.electricalFarLodBodyCount), 0);
    assert.equal(exact.processRevision, far.processRevision);
    assert.ok(Number(exact.rendererDrawTriangles) > triangles, 'exact draws all scientific walls');
    await page.waitForFunction(
      (prev) => {
        const node = document.getElementById('threeHost');
        return (
          /^far-/.test(node?.dataset.transparentArrayLodTier || '') &&
          node.dataset.renderState === 'ready' &&
          Number(node.dataset.rendererFrameSerial || 0) > prev
        );
      },
      Number(exact.rendererFrameSerial || 0),
      { timeout: 120000 },
    );
    const restored = await sample();
    assert.equal(restored.processRevision, far.processRevision);
    assert.equal(restored.cameraDampingEnabled, 'false');
    assert.ok(Number(restored.electricalFarLodBodyCount) > 0);
    assert.deepEqual(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).model,
      initial.model,
      'exact/far LOD and camera must not mutate the physical 625-site array',
    );
    assert.deepEqual(evidence.errors, []);
    evidence.far = far;
    evidence.exact = exact;
    evidence.restored = restored;
    evidence.result = 'pass';
    await page.screenshot({ path: resolve(output, 'recovered.png') });
    console.log('Native v2 completed exact edge-on frame and far recovery PASS');
  } finally {
    await context.close();
  }
} catch (error) {
  evidence.result = 'fail';
  evidence.failure = String(error.stack || error);
  throw error;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(evidence, null, 2) + '\n');
}
