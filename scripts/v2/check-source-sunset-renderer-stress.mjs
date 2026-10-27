// Physical 625-site native-v2 transparent resource-stability stress. The original
// Legacy DOM harness is archived; this performs all 20 real Chromium toggles.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/array-renderer');
await mkdir(output, { recursive: true });
const startedAt = performance.now();
// Retention and topology are independent of pixel raster size. This remains a
// desktop view with the complete 625-site Quality scene and real WebGL frames,
// but avoids the excess SwiftShader fill cost of a 1440x960 framebuffer.
const viewport = { width: 1024, height: 768 };
const report = { result: 'running', viewport, stages: [], errors: [] };
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport });
  try {
    // Software WebGL exact transparency can keep the main thread busy for full frames.
    page.setDefaultTimeout(180000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    const appLoadStartedAt = performance.now();
    await page.goto(base + '/app.html?start=example&example=three-tier-silicon-jlfets', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    report.appReadyMs = Math.round(performance.now() - appLoadStartedAt);
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snap();
    assert.equal(before.model.array.instances.length, 1885, 'complete wafer instances');
    assert.equal(
      before.model.array.instances.filter((site) => site.role === 'device').length,
      625,
      '625 physical device sites',
    );
    const sceneStartedAt = performance.now();
    await selectScientificView(page, 'three', viewport.width);
    const host = page.locator('#threeHost');
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 180000 },
    );
    report.sceneReadyMs = Math.round(performance.now() - sceneStartedAt);
    const measure = () =>
      host.evaluate((node) => {
        const keys = [
          'sceneGeneration',
          'surfacePlanBuildCount',
          'sceneRetainedGroupCount',
          'sceneRetainedObjectCount',
          'sceneRetainedGeometryCount',
          'sceneRetainedMaterialCount',
          'rendererFrameSerial',
          'rendererDrawCalls',
          'rendererDrawTriangles',
          'rendererUpdateKind',
        ];
        return Object.fromEntries(keys.map((key) => [key, node.dataset[key]]));
      });
    async function waitFrame(previous, label, interactionStartedAt = performance.now()) {
      const frameStartedAt = performance.now();
      await page.waitForFunction(
        (prev) => {
          const node = document.getElementById('threeHost');
          return (
            node?.dataset.renderState === 'ready' &&
            Number(node.dataset.rendererFrameSerial || 0) > prev
          );
        },
        Number(previous || 0),
        { timeout: 120000 },
      );
      await waitForPaint(page);
      const status = await measure();
      assert.ok(Number(status.rendererDrawCalls) > 0, label + ': real draw calls');
      assert.ok(Number(status.rendererDrawTriangles) > 0, label + ': real triangles');
      const completedAt = performance.now();
      const frameWaitMs = Math.round(completedAt - frameStartedAt);
      const interactionMs = Math.round(frameStartedAt - interactionStartedAt);
      const totalMs = Math.round(completedAt - interactionStartedAt);
      report.stages.push({ label, interactionMs, frameWaitMs, totalMs, ...status });
      console.log(
        `625-site ${label}: interaction ${interactionMs} ms, frame/paint ${frameWaitMs} ms, total ${totalMs} ms`,
      );
      return status;
    }
    const qualityStartedAt = performance.now();
    if ((await snap()).threeDisplay.fast) {
      await page.locator('#threePanel [data-action="quality:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderQuality === 'quality',
        null,
        { timeout: 180000 },
      );
    }
    report.qualityReadyMs = Math.round(performance.now() - qualityStartedAt);
    const warmupStartedAt = performance.now();
    await page.locator('#threePanel [data-action="display:three"]').click();
    const opacity = page.locator('#threeOpacityRange');
    await opacity.waitFor({ state: 'visible' });
    for (const value of ['0.5', '1', '0.5']) {
      const prev = (await measure()).rendererFrameSerial;
      const interactionStartedAt = performance.now();
      await opacity.fill(value);
      await waitFrame(prev, 'warm-up-opacity-' + value, interactionStartedAt);
    }
    // Cache the optional internal outlines once before measuring steady-state
    // retention. Their first allocation is legitimate view geometry, not a
    // leak; every subsequent toggle must retain *exactly* the same resources.
    const border = page.locator('#threePanel [data-action="borders:three"]');
    const inspector = page.locator('[data-border-inspector]');
    await border.click();
    await inspector.waitFor({ state: 'visible' });
    const master = inspector.getByRole('button', { name: 'Show 3D borders' });
    const initialBorders = (await snap()).threeDisplay.borders;
    assert.equal(await master.getAttribute('aria-pressed'), String(initialBorders));
    for (const enabled of [!initialBorders, initialBorders]) {
      const previous = (await measure()).rendererFrameSerial;
      const interactionStartedAt = performance.now();
      await master.click();
      assert.equal((await snap()).threeDisplay.borders, enabled, 'Border warm-up state');
      await waitFrame(previous, 'warm-up-border-' + String(enabled), interactionStartedAt);
    }
    report.warmupMs = Math.round(performance.now() - warmupStartedAt);
    const cyclesStartedAt = performance.now();
    const baseline = await measure();
    const retained = [
      'sceneRetainedGroupCount',
      'sceneRetainedObjectCount',
      'sceneRetainedGeometryCount',
      'sceneRetainedMaterialCount',
    ];
    const assertRetained = async (label, previous, interactionStartedAt) => {
      const now = await waitFrame(previous, label, interactionStartedAt);
      for (const key of retained) {
        assert.ok(now[key] !== undefined, label + ': expected ' + key);
        assert.equal(now[key], baseline[key], label + ': retained resources must not leak');
      }
      assert.equal(now.sceneGeneration, baseline.sceneGeneration, label + ': scene identity');
      assert.equal(
        now.surfacePlanBuildCount,
        baseline.surfacePlanBuildCount,
        label + ': surface plan reuse',
      );
      return now;
    };
    // Ten real Border visibility changes, each with a completed WebGL frame.
    // The toolbar button now opens an Inspector; clicking that trigger alone
    // never changes the 3D display or schedules a new frame.
    for (let i = 0; i < 10; i++) {
      // Inspector may close when an independent tool popover takes focus.
      if (!(await master.isVisible())) {
        await border.click();
        await inspector.waitFor({ state: 'visible' });
      }
      const prev = (await measure()).rendererFrameSerial;
      const interactionStartedAt = performance.now();
      await master.click();
      const expected = i % 2 === 0 ? !initialBorders : initialBorders;
      assert.equal((await snap()).threeDisplay.borders, expected, 'real Border toggle');
      await assertRetained('border-' + i, prev, interactionStartedAt);
    }
    // The Border popover may have dismissed Opacity; reopen its real editor.
    if (!(await opacity.isVisible())) {
      await page.locator('#threePanel [data-action="display:three"]').click();
      await opacity.waitFor({ state: 'visible' });
    }
    // Ten alternating transparent/opaque updates, never a no-op SetValue.
    for (let i = 0; i < 10; i++) {
      const prev = (await measure()).rendererFrameSerial;
      const interactionStartedAt = performance.now();
      await opacity.fill(i % 2 ? '0.5' : '1');
      await assertRetained('opacity-' + i, prev, interactionStartedAt);
    }
    report.cyclesMs = Math.round(performance.now() - cyclesStartedAt);
    assert.deepEqual((await snap()).model, before.model, '20 renderer toggles do not edit science');
    assert.deepEqual((await snap()).workflow.steps, before.workflow.steps);
    assert.deepEqual(report.errors, []);
    await page.screenshot({ path: resolve(output, 'final-625-renderer.png') });
    report.result = 'pass';
    console.log(
      'Native 625-site Renderer: 20 retained-resource toggles and science isolation PASS',
    );
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await browser.close();
  report.durationMs = Math.round(performance.now() - startedAt);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
