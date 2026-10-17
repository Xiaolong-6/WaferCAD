// Physical 625-site native-v2 transparent resource-stability stress. The original
// Legacy DOM harness is archived; this performs all 20 real Chromium toggles.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/pr290-renderer-625-retained');
await mkdir(output, { recursive: true });
const report = { result: 'running', stages: [], errors: [] };
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(base + '/app.html?start=example&example=three-tier-silicon-jlfets', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snap();
    assert.equal(before.model.array.instances.length, 1885, 'complete wafer instances');
    assert.equal(
      before.model.array.instances.filter((site) => site.role === 'device').length,
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
    async function waitFrame(previous, label) {
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
      report.stages.push({ label, ...status });
      return status;
    }
    if ((await snap()).threeDisplay.fast) {
      await page.locator('#threePanel [data-action="quality:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderQuality === 'quality',
        null,
        { timeout: 180000 },
      );
    }
    await page.locator('#threePanel [data-action="opacity:three"]').click();
    const opacity = page.locator('#threeOpacityRange');
    await opacity.waitFor({ state: 'visible' });
    for (const value of ['0.5', '1', '0.5']) {
      const prev = (await measure()).rendererFrameSerial;
      await opacity.fill(value);
      await waitFrame(prev, 'warm-up-opacity-' + value);
    }
    const baseline = await measure();
    const retained = [
      'sceneRetainedGroupCount',
      'sceneRetainedObjectCount',
      'sceneRetainedGeometryCount',
      'sceneRetainedMaterialCount',
    ];
    const assertRetained = async (label, previous) => {
      const now = await waitFrame(previous, label);
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
    // Ten actual Border updates, each followed by a newly completed WebGL frame.
    const border = page.locator('#threePanel [data-action="borders:three"]');
    for (let i = 0; i < 10; i++) {
      const prev = (await measure()).rendererFrameSerial;
      await border.click();
      await assertRetained('border-' + i, prev);
    }
    // The Border popover may have dismissed Opacity; reopen its real editor.
    if (!(await opacity.isVisible())) {
      await page.locator('#threePanel [data-action="opacity:three"]').click();
      await opacity.waitFor({ state: 'visible' });
    }
    // Ten alternating transparent/opaque updates, never a no-op SetValue.
    for (let i = 0; i < 10; i++) {
      const prev = (await measure()).rendererFrameSerial;
      await opacity.fill(i % 2 ? '0.5' : '1');
      await assertRetained('opacity-' + i, prev);
    }
    assert.deepEqual(
      (await snap()).model,
      before.model,
      '20 renderer toggles do not edit science',
    );
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
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
