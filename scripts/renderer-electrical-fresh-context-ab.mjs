// Scientific OFF/OFF/ON/ON acceptance: production policy selected at page boot.
// NO test-only forceSinglePass hot switching, geometry changes, or visual tolerance.
// Captures native GL buffer before compositor and CSS-sized browser screenshot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  baseUrl,
  launchOptions,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
} from './test-helpers/ui.mjs';
import { classifyWebglBackend } from './test-helpers/webgl-backend-classification.mjs';
import { installWebglFrameProbe } from './test-helpers/webgl-frame-probe.mjs';
import { compareScreenshotPngPixels, decodeScreenshotPng } from './test-helpers/png-pixel-diff.mjs';

const reportOnly = process.argv.includes('--report-only');
const hardwareRtx3060 = process.argv.includes('--hardware-rtx3060');
assert.ok(!hardwareRtx3060 || process.platform === 'win32', '--hardware-rtx3060 requires Windows');
const output = new URL(
  hardwareRtx3060
    ? '../test-results/renderer-hardware-fresh-context-ab/'
    : '../test-results/product-review/electrical-fresh-context/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...launchOptions,
  headless: hardwareRtx3060 ? false : launchOptions.headless,
});
const report = {
  experiment: 'production-boot-policy-fresh-context-off-off-on-on',
  browserVersion: browser.version(),
  nodeVersion: process.version,
  platform: process.platform,
  baseUrl,
  hardwareRtx3060,
  headed: hardwareRtx3060 ? true : !launchOptions.headless,
  reportOnly,
  strictPixelTolerance: 0,
  trials: [],
  comparisons: [],
  passed: false,
};
const fixture = fileURLToPath(
  new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
);
const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const differenceStage = (first, second, pixelIdentical) =>
  first.native.framebufferHash !== second.native.framebufferHash
    ? 'webgl-framebuffer'
    : !pixelIdentical
      ? 'browser-screenshot-or-compositor'
      : 'identical-through-screenshot';
const trialImages = new Map();
const trialByPolicy = new Map();
let stage = 'boot';

async function trial(enabled, index) {
  const label = `${index}-${enabled ? 'ON' : 'OFF'}`;
  stage = label;
  const context = await newUiContext(browser, {
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(installWebglFrameProbe);
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);
  const row = { label, enabled, stage: 'boot', errors };
  report.trials.push(row);
  const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
  const changed = async (action) => {
    const prior = Number((await snapshot()).rendererFrameSerial || 0);
    await action();
    await page.waitForFunction(
      (serial) => {
        const host = document.getElementById('threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > serial
        );
      },
      prior,
      { timeout: 180000 },
    );
  };
  try {
    await page.goto(
      baseUrl +
        '/app.html?rendererV3RoiTrace=1' +
        (enabled ? '&rendererV3ElectricalPlanarSinglePass=1' : ''),
    );
    await waitForAppReady(page);
    row.stage = 'load';
    await page.locator('#openProjectInput').setInputFiles(fixture);
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout: 180000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    row.stage = 'transparent-quality';
    await changed(() => page.locator('#threeFastBtn').selectOption('quality'));
    await changed(() =>
      page.locator('#threeOpacityRange').evaluate((input) => {
        input.value = '0.5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }),
    );
    await page.locator('#threePanel details[open]').evaluateAll((nodes) => {
      nodes.forEach((node) => {
        node.open = false;
      });
    });
    // Fit is a product control; it provides the same canonical camera pose
    // in each context without pointer replay or a hidden internal API.
    await changed(() => page.locator('#fit3dBtn').click());
    assert.equal((await snapshot()).sceneVariant, 'transparent');
    assert.equal((await snapshot()).renderQuality, 'quality');

    row.stage = 'install-read-only-GL-trace';
    await page.evaluate(async () => {
      const THREE =
        await import('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js');
      const original = THREE.Object3D.prototype.onBeforeRender;
      THREE.Object3D.prototype.onBeforeRender = function (renderer, scene, camera, ...rest) {
        const frame = renderer.info.render.frame;
        if (window.__freshContextTrace?.frame !== frame) {
          window.__freshContextTrace = {
            frame,
            cameraWorld: camera.matrixWorld.toArray(),
            cameraProjection: camera.projectionMatrix.toArray(),
            order: [],
            materials: {},
          };
        }
        const descriptor = this.userData?.waferCadPresentation;
        const material = rest[1];
        window.__freshContextTrace.order.push([
          this.name,
          descriptor?.kind || null,
          this.renderOrder,
        ]);
        if (descriptor?.kind === 'electrical-surface' && material) {
          const key = JSON.stringify([
            material.type,
            material.side,
            material.transparent,
            material.depthTest,
            material.depthWrite,
            material.blending,
            material.forceSinglePass,
            material.dithering,
          ]);
          window.__freshContextTrace.materials[key] =
            (window.__freshContextTrace.materials[key] || 0) + 1;
        }
        window.__waferCadWebglProbe.owner(this);
        return original.call(this, renderer, scene, camera, ...rest);
      };
    });
    const testCanvas = page.locator('#threeHost canvas');
    const preflight = decodeScreenshotPng(await testCanvas.screenshot());
    const samples = [299, 300, 301, 302].flatMap((x) =>
      [137, 138, 139, 140].map((y) => ({
        x,
        y,
        sourceWidth: preflight.width,
        sourceHeight: preflight.height,
      })),
    );
    row.stage = 'capture-product-frame';
    await page.evaluate(({ pixelSamples, captureDrawInputs }) => {
      window.__waferCadWebglProbe.arm({
        rasterDiscard: false,
        captureGlState: true,
        captureFramebuffer: true,
        captureDrawInputs,
        pixelSamples,
      });
      const input = document.getElementById('threeOpacityRange');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, { pixelSamples: samples, captureDrawInputs: hardwareRtx3060 });
    await page.waitForFunction(
      () => {
        const host = document.getElementById('threeHost');
        const frames = window.__waferCadWebglProbe.frames();
        return (
          host?.dataset.renderState === 'ready' &&
          frames.length > 0 &&
          frames.at(-1).frameSerial === Number(host.dataset.rendererFrameSerial)
        );
      },
      null,
      { timeout: 180000 },
    );
    const state = await snapshot();
    const screenshot = await testCanvas.screenshot({
      path: fileURLToPath(new URL(`${label}.png`, output)),
    });
    const png = decodeScreenshotPng(screenshot);
    const evidence = await page.evaluate(async () => {
      const frame = window.__waferCadWebglProbe.frames().at(-1);
      const raw = frame.framebufferRgba;
      const hex = raw
        ? Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', raw)))
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('')
        : null;
      const trace = window.__freshContextTrace;
      const canvas = document.querySelector('#threeHost canvas');
      const rect = canvas.getBoundingClientRect();
      return {
        native: {
          calls: frame.drawCalls,
          triangles: frame.triangles,
          glError: frame.glError,
          renderer: frame.unmaskedRenderer || frame.renderer,
          vendor: frame.vendor,
          glState: frame.glState,
          drawInputs: frame.drawInputs || [],
          framebuffer: frame.framebuffer,
          framebufferHash: hex,
          pixelSamples: frame.pixelSamples,
          frameSerial: frame.frameSerial,
        },
        cameraWorld: trace.cameraWorld,
        cameraProjection: trace.cameraProjection,
        order: trace.order,
        materials: trace.materials,
        layout: {
          cssWidth: rect.width,
          cssHeight: rect.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          devicePixelRatio: window.devicePixelRatio,
        },
      };
    });
    const native = evidence.native;
    native.drawInputs = native.drawInputs.map(({ shaders, ...draw }) => ({
      ...draw,
      shaderHashes: shaders.map(({ type, source }) => ({
        type,
        hash: hashJson(source),
        length: source.length,
      })),
    }));
    row.drawInputsHash = hashJson(native.drawInputs);
    row.drawInputsCount = native.drawInputs.length;
    if (hardwareRtx3060) {
      assert.equal(
        row.drawInputsCount,
        48,
        `${label}: expected bounded native draw samples`,
      );
      assert.ok(
        native.drawInputs.some((draw) =>
          draw.shaderHashes.some((shader) => shader.length > 0),
        ),
        `${label}: shader source evidence missing`,
      );
    }
    row.stage = 'captured';
    row.png = { width: png.width, height: png.height };
    row.layout = evidence.layout;
    row.backend = classifyWebglBackend({
      renderer: native.renderer,
      unmaskedRenderer: native.renderer,
    });
    row.native = native;
    row.cameraWorld = evidence.cameraWorld;
    row.cameraProjection = evidence.cameraProjection;
    row.orderHash = hashJson(evidence.order);
    row.materialHash = hashJson(evidence.materials);
    row.materials = evidence.materials;
    row.state = {
      rendererFrameSerial: state.rendererFrameSerial,
      rendererDrawCalls: state.rendererDrawCalls,
      rendererDrawTriangles: state.rendererDrawTriangles,
      sceneGeneration: state.sceneGeneration,
      modelRevision: state.modelRevision,
      processRevision: state.processRevision,
      surfacePlanBuildCount: state.surfacePlanBuildCount,
      presentationObjectCount: state.presentationObjectCount,
      rendererCameraWorld: state.rendererCameraWorld,
      rendererCameraProjection: state.rendererCameraProjection,
    };
    // Keep complete per-context evidence, including state and gate errors.
    await writeFile(new URL(`${label}-trace.json`, output), JSON.stringify(row, null, 2));
    if (hardwareRtx3060) {
      assert.ok(
        row.backend.hardwareVerified && /NVIDIA.*GeForce RTX 3060/i.test(native.renderer || ''),
        `${label}: expected a recognized NVIDIA GeForce RTX 3060 adapter, got ${native.renderer || 'unknown'}`,
      );
    }
    const expectedCalls = enabled ? 1291 : 1408;
    const expectedTriangles = enabled ? 54066262 : 57040012;
    assert.equal(native.calls, expectedCalls, `${label}: native draw calls`);
    assert.equal(native.triangles, expectedTriangles, `${label}: native triangles`);
    assert.equal(native.glError, 0);
    assert.equal(native.framebuffer.status, 'valid');
    assert.ok(native.framebufferHash, 'full GL readback hash required');
    assert.equal(Number(state.rendererFrameSerial), native.frameSerial);
    assert.equal(Number(state.rendererDrawCalls), native.calls);
    assert.equal(Number(state.rendererDrawTriangles), native.triangles);
    assert.equal(native.pixelSamples.length, 16);
    assert.ok(native.pixelSamples.every((sample) => sample.status === 'valid'));
    assert.deepEqual(errors, []);

    const previous = trialByPolicy.get(enabled);
    if (previous) {
      const diff = compareScreenshotPngPixels(previous.image, screenshot);
      const comparison = {
        first: previous.row.label,
        second: label,
        samePolicy: true,
        pngByteIdentical: previous.image.equals(screenshot),
        pixelDifference: diff,
        framebufferIdentical: previous.row.native.framebufferHash === native.framebufferHash,
        cameraIdentical:
          JSON.stringify([previous.row.cameraWorld, previous.row.cameraProjection]) ===
          JSON.stringify([row.cameraWorld, row.cameraProjection]),
        orderIdentical: previous.row.orderHash === row.orderHash,
        materialIdentical: previous.row.materialHash === row.materialHash,
        sampledDrawInputsIdentical: previous.row.drawInputsHash === row.drawInputsHash,
        layoutIdentical: JSON.stringify(previous.row.layout) === JSON.stringify(row.layout),
        differenceStage: differenceStage(previous.row, row, diff.pixelIdentical),
        ...{
          rawSampleIdentical:
            JSON.stringify(previous.row.native.pixelSamples.map((p) => p.rgba)) ===
            JSON.stringify(native.pixelSamples.map((p) => p.rgba)),
        },
      };
      report.comparisons.push(comparison);
    } else {
      trialByPolicy.set(enabled, { row, image: screenshot });
    }
    trialImages.set(label, screenshot);
    await writeFile(new URL(`${label}-trace.json`, output), JSON.stringify(row, null, 2));
    console.log(
      'ELECTRICAL_FRESH_CONTEXT_FRAME',
      JSON.stringify({
        label,
        backend: row.backend,
        png: row.png,
        gl: native.framebuffer,
        rawHash: native.framebufferHash,
        orderHash: row.orderHash,
        camera: row.cameraWorld,
        materialHash: row.materialHash,
        calls: native.calls,
        triangles: native.triangles,
      }),
    );
  } catch (error) {
    row.stage = stage;
    row.error = String(error);
    await writeFile(new URL(`${label}-trace.json`, output), JSON.stringify(row, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}

try {
  for (const [i, enabled] of [false, false, true, true].entries()) {
    await trial(enabled, i + 1);
  }
  const off = report.trials[0];
  const on = report.trials[2];
  const cross = compareScreenshotPngPixels(trialImages.get(off.label), trialImages.get(on.label));
  report.comparisons.push({
    first: off.label,
    second: on.label,
    samePolicy: false,
    pngByteIdentical: trialImages.get(off.label).equals(trialImages.get(on.label)),
    pixelDifference: cross,
    framebufferIdentical: off.native.framebufferHash === on.native.framebufferHash,
    cameraIdentical:
      JSON.stringify([off.cameraWorld, off.cameraProjection]) ===
      JSON.stringify([on.cameraWorld, on.cameraProjection]),
    orderIdentical: off.orderHash === on.orderHash,
    materialIdentical: off.materialHash === on.materialHash,
    layoutIdentical: JSON.stringify(off.layout) === JSON.stringify(on.layout),
    sampledDrawInputsIdentical: off.drawInputsHash === on.drawInputsHash,
    differenceStage: differenceStage(off, on, cross.pixelIdentical),
    rawSampleIdentical:
      JSON.stringify(off.native.pixelSamples.map((p) => p.rgba)) ===
      JSON.stringify(on.native.pixelSamples.map((p) => p.rgba)),
  });
  report.strictParity = report.comparisons.every(
    (c) =>
      c.pngByteIdentical &&
      c.pixelDifference.pixelIdentical &&
      c.framebufferIdentical &&
      c.cameraIdentical &&
      c.orderIdentical &&
      (!c.samePolicy || c.materialIdentical) &&
      c.layoutIdentical,
  );
  report.stage = 'completed';
  report.passed = report.strictParity;
} catch (error) {
  report.passed = false;
  report.error = String(error);
  report.stage = stage;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(
    'ELECTRICAL_FRESH_CONTEXT_REPORT',
    JSON.stringify({
      passed: report.passed,
      stage: report.stage,
      error: report.error,
      comparisons: report.comparisons,
      adapters: report.trials.map(({ label, backend }) => ({ label, backend })),
    }),
  );
  await browser.close();
}
if (!reportOnly) {
  assert.ok(
    report.passed,
    'real-policy fresh-context OFF/OFF, ON/ON, OFF/ON failed strict pixel or GL parity',
  );
}
