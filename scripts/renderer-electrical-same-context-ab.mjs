// Exact scientific A/B inside ONE WebGL context: preserves geometry, camera,
// projection, shaders, adapter and presentation objects across policy arms.
// This is diagnostic only; it does not turn on the default renderer candidate.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, newUiContext, observePageErrors, waitForAppReady, waitForThreeReady, chooseConfirmation, closeFunctionPanel, baseUrl } from './test-helpers/ui.mjs';
import { installWebglFrameProbe } from './test-helpers/webgl-frame-probe.mjs';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';

const output = new URL('../test-results/product-review/electrical-same-context/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
await context.addInitScript(installWebglFrameProbe);
const page = await context.newPage();
page.setDefaultTimeout(180000);
const errors = observePageErrors(page);
const report = { mode: 'one-context-electrical-on-off-off-on', browserVersion: browser.version(), trials: [], errors };
const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
let stage = 'boot';
try {
  // Build the *accepted* candidate scene once. The only test-time variable
  // is material.forceSinglePass on its explicitly tagged smooth planar caps.
  await page.goto(baseUrl + '/app.html?rendererV3ElectricalPlanarSinglePass=1');
  await waitForAppReady(page);
  stage = 'load-project';
  await page.locator('#openProjectInput').setInputFiles(
    fileURLToPath(new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url)),
  );
  await chooseConfirmation(page);
  await page.waitForFunction(
    () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
    null,
    { timeout: 180000 },
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 180000);
  stage = 'quality-transparent';
  await page.locator('#threeFastBtn').selectOption('quality');
  await waitForThreeReady(page, 180000);
  const before = Number((await snapshot()).rendererFrameSerial || 0);
  await page.locator('#threeOpacityRange').evaluate((node) => {
    node.value = '0.5';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(
    (serial) => {
      const host = document.getElementById('threeHost');
      return host?.dataset.renderState === 'ready' &&
        host.dataset.renderQuality === 'quality' &&
        host.dataset.sceneVariant === 'transparent' &&
        Number(host.dataset.rendererFrameSerial || 0) > serial;
    },
    before,
    { timeout: 180000 },
  );
  await page.locator('#threePanel details[open]').evaluateAll((nodes) => {
    for (const node of nodes) node.open = false;
  });
  const baseline = await snapshot();
  assert.equal(baseline.v3SkippedTriangles, '0');
  assert.equal(baseline.rendererDrawTriangles, '54066262');
  assert.equal(baseline.rendererDrawCalls, '1291');

  stage = 'install-test-only-per-mesh-hook';
  await page.evaluate(async () => {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js');
    const original = THREE.Object3D.prototype.onBeforeRender;
    window.__waferCadSameContextPolicy = true;
    window.__waferCadSameContextEligible = 0;
    THREE.Object3D.prototype.onBeforeRender = function (...args) {
      const material = args[4];
      const descriptor = this.userData?.waferCadPresentation;
      if (descriptor?.kind === 'electrical-surface' &&
          descriptor.planarCap === true &&
          descriptor.experimentalElectricalPlanarSinglePass === true &&
          material?.userData?.waferCadSinglePassPlanarCap === true) {
        material.forceSinglePass = window.__waferCadSameContextPolicy;
        window.__waferCadSameContextEligible++;
      }
      window.__waferCadWebglProbe.owner(this);
      return original.apply(this, args);
    };
  });
  let reference = null;
  for (const [index, singlePass] of [true, false, false, true].entries()) {
    const label = `${index + 1}-${singlePass ? 'single' : 'double'}`;
    stage = label;
    const serial = Number((await snapshot()).rendererFrameSerial || 0);
    await page.evaluate((enabled) => {
      window.__waferCadSameContextPolicy = enabled;
      window.__waferCadSameContextEligible = 0;
      // The native draw probe is one-shot. Arm it independently for every
      // policy arm; otherwise later trials would reuse the first frame.
      window.__waferCadWebglProbe.arm({ rasterDiscard: false });
      // Even with the same value, the input event routes through the existing
      // presentation-only invalidation, scheduling a fresh complete frame.
      const input = document.getElementById('threeOpacityRange');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, singlePass);
    await page.waitForFunction(
      (previous) => {
        const host = document.getElementById('threeHost');
        return host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > previous;
      },
      serial,
      { timeout: 180000 },
    );
    const canvas = await page.locator('#threeHost canvas').screenshot({
      path: fileURLToPath(new URL(`${label}.png`, output)),
    });
    const state = await snapshot();
    const probe = await page.evaluate(() => ({
      eligibleDraws: window.__waferCadSameContextEligible,
      last: window.__waferCadWebglProbe.frames().at(-1),
    }));
    assert.ok(probe.eligibleDraws > 0, 'eligible smooth Electrical caps must be intercepted');
    const expectedTriangles = singlePass ? 54066262 : 57040012;
    const expectedCalls = singlePass ? 1291 : 1408;
    assert.equal(Number(state.rendererDrawTriangles), expectedTriangles);
    assert.equal(Number(state.rendererDrawCalls), expectedCalls);
    assert.equal(
      probe.last.frameSerial,
      Number(state.rendererFrameSerial),
      'native census must be from this exact completed WebGL frame',
    );
    assert.equal(probe.last.triangles, expectedTriangles, 'native GL triangle census');
    assert.equal(probe.last.drawCalls, expectedCalls, 'native GL draw census');
    assert.equal(probe.last.glError, 0);
    assert.equal(probe.last.frameSerial, Number(state.rendererFrameSerial));
    for (const key of ['sceneGeneration', 'modelRevision', 'processRevision', 'surfacePlanBuildCount', 'presentationObjectCount']) {
      assert.equal(state[key], baseline[key], `${label}: scene contract ${key}`);
    }
    const comparison = reference ? compareScreenshotPngPixels(reference, canvas) : null;
    const trial = {
      label,
      singlePass,
      eligibleDraws: probe.eligibleDraws,
      frameSerial: Number(state.rendererFrameSerial),
      nativeDrawCalls: probe.last.drawCalls,
      nativeTriangles: probe.last.triangles,
      byteIdentical: reference ? reference.equals(canvas) : true,
      pixelDifference: comparison,
    };
    report.trials.push(trial);
    if (!reference) reference = canvas;
    else if (!trial.byteIdentical) {
      await writeFile(new URL(`${label}-pixel-diff.json`, output), JSON.stringify(comparison, null, 2));
      assert.fail(`${label}: same-context Electrical AB pixel parity failed (${comparison.differentPixels} pixels)`);
    }
    assert.deepEqual(errors, []);
    console.log('ELECTRICAL_SAME_CONTEXT_FRAME', JSON.stringify(trial));
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.stage = stage;
  report.error = String(error);
  report.host = await snapshot().catch(() => null);
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
