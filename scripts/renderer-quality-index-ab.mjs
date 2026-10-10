// Same-run A/B experiments for Quality indexing, raster-discard profiling,
// final-frame-only assembly and smooth Electrical Region cap passes.
// All product experiments remain default-off.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URLSearchParams } from 'node:url';
import { installWebglFrameProbe } from './test-helpers/webgl-frame-probe.mjs';
import { classifyWebglBackend } from './test-helpers/webgl-backend-classification.mjs';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';
import {
  launchBrowser,
  launchOptions,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const gpuProfile = process.argv.includes('--gpu-profile');
const finalFrameOnly = process.argv.includes('--final-frame-only');
const assemblyAb = process.argv.includes('--assembly-ab');
const electricalPlanarAb = process.argv.includes('--electrical-planar-ab');
const hardwareElectricalAb = process.argv.includes('--hardware-electrical-ab');
const webglCensus = gpuProfile || hardwareElectricalAb || electricalPlanarAb;
assert.ok(
  !assemblyAb || (!gpuProfile && !finalFrameOnly && !electricalPlanarAb && !hardwareElectricalAb),
  '--assembly-ab is standalone; do not combine it with other modes',
);
assert.ok(
  !electricalPlanarAb || (!gpuProfile && !finalFrameOnly && !assemblyAb && !hardwareElectricalAb),
  '--electrical-planar-ab is standalone; do not combine it with other modes',
);
assert.ok(
  !hardwareElectricalAb || (!gpuProfile && !finalFrameOnly && !assemblyAb && !electricalPlanarAb),
  '--hardware-electrical-ab is standalone; do not combine it with other modes',
);
const out = new URL(
  assemblyAb
    ? '../test-results/renderer-assembly-ab/'
    : hardwareElectricalAb
      ? '../test-results/renderer-hardware-electrical-ab/'
      : electricalPlanarAb
        ? '../test-results/renderer-electrical-planar-ab/'
        : gpuProfile
          ? finalFrameOnly
            ? '../test-results/renderer-gpu-profile-final-only/'
            : '../test-results/renderer-gpu-profile/'
          : '../test-results/renderer-quality-index-ab/',
  import.meta.url,
);
await mkdir(out, { recursive: true });
const fixture = fileURLToPath(
  new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
);
// Manual hardware mode uses a visible browser; CI keeps its original launch.
const browser = hardwareElectricalAb
  ? await chromium.launch({ ...launchOptions, headless: false })
  : await launchBrowser();
const trials = [];
let referenceCanvas = null;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
}

async function trial(enabled, ordinal) {
  const trialFinalFrameOnly = assemblyAb ? enabled : finalFrameOnly;
  // Isolate Project storage and Three.js scene caches, but keep all trials
  // on the same physical CI runner / browser binary.
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  let page;
  let errors = [];
  let pixelDifference = null;
  let stage = 'boot';
  try {
    if (webglCensus) await context.addInitScript(installWebglFrameProbe);
    page = await context.newPage();
    page.setDefaultTimeout(180000);
    errors = observePageErrors(page);
    const label = assemblyAb
      ? `${ordinal}-${enabled ? 'final-only' : 'preview'}`
      : hardwareElectricalAb
        ? `${ordinal}-${enabled ? 'hardware-single' : 'hardware-double'}`
        : electricalPlanarAb
          ? `${ordinal}-${enabled ? 'electrical-single' : 'electrical-double'}`
          : gpuProfile
            ? `${ordinal}-${enabled ? 'raster-discard' : 'normal'}`
            : `${ordinal}-${enabled ? 'on' : 'off'}`;
    const params = new URLSearchParams();
    if (!gpuProfile && !assemblyAb && !electricalPlanarAb && !hardwareElectricalAb && enabled)
      params.set('rendererV3QualityIndex', '1');
    if (trialFinalFrameOnly) params.set('rendererV3FinalFrameOnly', '1');
    if ((electricalPlanarAb || hardwareElectricalAb) && enabled)
      params.set('rendererV3ElectricalPlanarSinglePass', '1');
    await page.goto(baseUrl + '/app.html' + (params.size ? `?${params}` : ''));
    await waitForAppReady(page);
    stage = 'open-fixture';
    const setupBegan = performance.now();
    await page.locator('#openProjectInput').setInputFiles(fixture);
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout: 180000 },
    );
    await closeFunctionPanel(page);
    stage = 'initial-three';
    if (webglCensus) console.log('RENDERER_TRIAL_SETUP', JSON.stringify({ label, stage }));
    await waitForThreeReady(page, 180000);
    const initialSceneReadyMs = performance.now() - setupBegan;
    stage = 'quality-scene';
    await page.locator('#threeFastBtn').selectOption('quality');
    await page.waitForFunction(
      () => {
        const el = document.getElementById('threeHost');
        return el?.dataset.renderState === 'ready' && el.dataset.renderQuality === 'quality';
      },
      null,
      { timeout: 180000 },
    );
    // Display menu is reparented inside More on narrow viewports.
    const display = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    const nested = await display.evaluate((el) => Boolean(el.closest('.view-overflow-secondary')));
    if (nested && !(await more.evaluate((el) => el.open))) {
      await more.locator(':scope > summary').click();
    }
    await display.locator(':scope > summary').click();
    const oldSerial = Number(
      await page.locator('#threeHost').evaluate((el) => el.dataset.rendererFrameSerial || 0),
    );
    if (webglCensus) {
      await page.evaluate(async (rasterDiscard) => {
        const THREE =
          await import('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js');
        const original = THREE.Object3D.prototype.onBeforeRender;
        THREE.Object3D.prototype.onBeforeRender = function (...args) {
          window.__waferCadWebglProbe.owner(this);
          return original.apply(this, args);
        };
        window.__waferCadWebglProbe.arm({ rasterDiscard });
      }, gpuProfile && enabled);
    }
    stage = 'measured-transparent-frame';
    console.log('RENDERER_TRIAL_START', JSON.stringify({ label, stage }));
    const began = performance.now();
    await page.locator('#threeOpacityRange').fill('0.5');
    await waitForThreeReady(page, 180000);
    await page.waitForFunction(
      (serial) => {
        const el = document.getElementById('threeHost');
        return (
          el?.dataset.renderState === 'ready' &&
          el.dataset.sceneVariant === 'transparent' &&
          el.dataset.renderQuality === 'quality' &&
          Number(el.dataset.rendererFrameSerial || 0) > serial
        );
      },
      oldSerial,
      { timeout: 180000 },
    );
    // Screenshot forces compositor presentation; elapsed includes the first
    // complete image. GPU-specific timing is reported separately when valid.
    const canvas = await page.locator('#threeHost canvas').screenshot({
      path: fileURLToPath(new URL(`${label}.png`, out)),
    });
    const completedFrameMs = performance.now() - began;
    const state = await page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
    let webgl = null;
    if (webglCensus) {
      await page.waitForFunction(() => {
        const frames = window.__waferCadWebglProbe.frames();
        return frames.length > 0 && frames.every((frame) => frame.timerStatus !== 'pending');
      });
      webgl = await page.evaluate(() => window.__waferCadWebglProbe.frames().at(-1));
      assert.equal(webgl.drawCalls, Number(state.rendererDrawCalls), `${label}: actual GL calls`);
      assert.equal(
        webgl.triangles,
        Number(state.rendererDrawTriangles),
        `${label}: actual GL triangles`,
      );
      assert.equal(
        webgl.frameSerial,
        Number(state.rendererFrameSerial),
        `${label}: same completed frame`,
      );
      assert.equal(webgl.rasterDiscard, gpuProfile && enabled);
      assert.equal(webgl.glError, 0, 'WebGL must accept every profiled draw without errors');
      assert.equal(
        webgl.priorRasterDiscard,
        false,
        'fresh context begins with normal rasterization',
      );
      assert.equal(
        webgl.owners.reduce((sum, owner) => sum + owner.triangles, 0),
        webgl.triangles,
      );
      assert.equal(
        webgl.owners.filter((owner) => owner.kind === 'untracked').length,
        0,
        'every actual draw must have attributed presentation ownership',
      );
      assert.ok(webgl.completedDrawMs > 0);
      if (webgl.timerStatus !== 'valid') assert.equal(webgl.gpuMs, null);
    }
    const backend = webglCensus ? classifyWebglBackend(webgl) : null;
    if (hardwareElectricalAb) {
      assert.ok(
        backend.hardwareVerified,
        `${label}: GPU identity unverified (${backend.reason}); hardware A/B cannot use software WebGL`,
      );
    }
    assert.deepEqual(errors, [], `${label}: no page errors`);
    assert.equal(state.transparentArrayLodTier, 'exact');
    assert.equal(state.v3SkippedTriangles, '0');
    if ((electricalPlanarAb || hardwareElectricalAb) && enabled) {
      assert.equal(
        Number(state.rendererDrawTriangles),
        54066262,
        'electrical smooth-cap trial removes exactly the accepted redundant submissions',
      );
      assert.equal(Number(state.rendererDrawCalls), 1291, 'accepted electrical smooth-cap calls');
    } else {
      assert.equal(state.rendererDrawTriangles, '57040012', '625-site exact triangle parity');
      assert.equal(state.rendererDrawCalls, '1408', '625-site draw-call parity');
    }
    assert.equal(state.sceneVariant, 'transparent');
    assert.equal(state.renderQuality, 'quality');
    assert.ok(Number(state.rendererFrameMs) > 0);
    assert.equal(
      state.rendererAssemblyFramePolicy,
      trialFinalFrameOnly ? 'final-only' : 'preview',
      `${label}: measured array build must use the requested assembly policy`,
    );
    if (!gpuProfile && !assemblyAb && !electricalPlanarAb && !hardwareElectricalAb && enabled) {
      assert.ok(Number(state.v3QualityIndexedTriangles) > 10000000);
      assert.equal(
        Number(state.v3QualityOriginalVertices) / Number(state.v3QualityIndexedVertices),
        1.5,
        'each indexed quad must represent the exact original six vertices',
      );
    } else {
      assert.equal(state.v3QualityIndexedTriangles, '0');
      assert.equal(state.v3QualityIndexedVertices, '0');
    }
    if (!gpuProfile || !enabled) {
      if (referenceCanvas === null) referenceCanvas = canvas;
      // Pixel-level diagnostics are emitted only on a strict-byte-parity
      // failure. Never turn a tolerated color difference into a PASS here.
      if (!canvas.equals(referenceCanvas)) {
        pixelDifference = compareScreenshotPngPixels(referenceCanvas, canvas);
        await writeFile(
          new URL(`${label}-pixel-diff.json`, out),
          JSON.stringify(pixelDifference, null, 2),
        );
        assert.fail(
          `${label}: canvas bytes differ from the same-pose reference; ` +
            `${pixelDifference.differentPixels ?? 'unknown'} changed pixels; ` +
            `max channel delta ${pixelDifference.maxChannelDelta ?? 'unknown'}/255; fail closed`,
        );
      }
    } else {
      assert.ok(
        referenceCanvas && !canvas.equals(referenceCanvas),
        'raster discard must change the diagnostic image; it is not a scientific render',
      );
    }
    const result = {
      label,
      enabled,
      completedFrameMs,
      renderFrameMs: Number(state.rendererFrameMs),
      sceneAssemblyMs: Number(state.rendererAssemblyMs),
      indexTriangles: Number(state.v3QualityIndexedTriangles),
      sourceVertices: Number(state.v3QualityOriginalVertices),
      indexedVertices: Number(state.v3QualityIndexedVertices),
      submittedTriangles: Number(state.rendererDrawTriangles),
      drawCalls: Number(state.rendererDrawCalls),
      imageBytes: canvas.length,
      cameraMode: state.transparentArrayLodTier,
      errors,
      initialSceneReadyMs,
      finalFrameOnly: trialFinalFrameOnly,
      assemblyFramePolicy: state.rendererAssemblyFramePolicy,
      assemblySkippedFrames: Number(state.rendererAssemblySkippedFrames || 0),
      ...(webglCensus ? { webgl, backend, diagnosticImageOnly: gpuProfile && enabled } : {}),
    };
    console.log(
      assemblyAb
        ? 'RENDERER_ASSEMBLY_AB_TRIAL'
        : hardwareElectricalAb
          ? 'RENDERER_HARDWARE_ELECTRICAL_AB_TRIAL'
          : electricalPlanarAb
            ? 'RENDERER_ELECTRICAL_PLANAR_AB_TRIAL'
            : gpuProfile
              ? 'RENDERER_GPU_PROFILE_TRIAL'
              : 'RENDERER_QUALITY_INDEX_AB_TRIAL',
      JSON.stringify(result),
    );
    return result;
  } catch (error) {
    const state = page
      ? await page
          .evaluate(() => ({
            host: { ...document.getElementById('threeHost')?.dataset },
            status: document.getElementById('statusText')?.textContent,
            probe: window.__waferCadWebglProbe?.frames(),
          }))
          .catch(() => null)
      : null;
    await writeFile(
      new URL('failure.json', out),
      JSON.stringify(
        {
          ordinal,
          enabled,
          gpuProfile,
          assemblyAb,
          electricalPlanarAb,
          hardwareElectricalAb,
          trialFinalFrameOnly,
          stage,
          error: String(error),
          errors,
          pixelDifference,
          state,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await context.close();
  }
}

try {
  // Symmetric ordering controls for first-run cache and CI thermal drift.
  for (const [i, enabled] of (gpuProfile
    ? [false, true, true, false]
    : [true, false, false, true]
  ).entries()) {
    trials.push(await trial(enabled, i + 1));
  }
  const on = trials.filter((x) => x.enabled);
  const off = trials.filter((x) => !x.enabled);
  const offMedianMs = median(off.map((x) => x.completedFrameMs));
  const onMedianMs = median(on.map((x) => x.completedFrameMs));
  const report = {
    mode: assemblyAb
      ? 'same-run-final-preview-preview-final'
      : hardwareElectricalAb
        ? 'same-run-hardware-electrical-single-double-double-single'
        : electricalPlanarAb
          ? 'same-run-electrical-single-double-double-single'
          : gpuProfile
            ? 'same-run-normal-discard-discard-normal'
            : 'same-run-abba',
    fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad',
    viewport: '1440x960',
    browserVersion: browser.version(),
    finalFrameOnly: assemblyAb ? 'paired' : finalFrameOnly,
    order: trials.map((x) => x.label),
    trials,
    exactCanvasParity: gpuProfile
      ? 'normal arms only; discard images intentionally incomplete'
      : true,
    ...(webglCensus
      ? {
          hardwareConfirmed: trials.every((x) => x.backend?.hardwareVerified),
          adapters: [...new Set(trials.map((x) => x.backend?.adapter))],
          explicitFinishBarrier: true,
        }
      : {}),
    ...(hardwareElectricalAb
      ? {
          hardwareConfirmed: trials.every((x) => x.backend?.hardwareVerified),
          adapters: [...new Set(trials.map((x) => x.backend?.adapter))],
          electricalSinglePassMedianMs: onMedianMs,
          electricalDoublePassMedianMs: offMedianMs,
          completedRatioSingleToDouble: onMedianMs / offMedianMs,
          gpuTimers: trials.map((x) => ({
            label: x.label,
            status: x.webgl.timerStatus,
            gpuMs: x.webgl.gpuMs,
          })),
          submittedTrianglesSingle: on.map((x) => x.submittedTriangles),
          submittedTrianglesDouble: off.map((x) => x.submittedTriangles),
          drawCallsSingle: on.map((x) => x.drawCalls),
          drawCallsDouble: off.map((x) => x.drawCalls),
        }
      : electricalPlanarAb
        ? {
            electricalSinglePassMedianMs: onMedianMs,
            electricalDoublePassMedianMs: offMedianMs,
            elapsedRatioSingleToDouble: onMedianMs / offMedianMs,
            submittedTrianglesSingle: on.map((x) => x.submittedTriangles),
            submittedTrianglesDouble: off.map((x) => x.submittedTriangles),
            drawCallsSingle: on.map((x) => x.drawCalls),
            drawCallsDouble: off.map((x) => x.drawCalls),
          }
        : assemblyAb
          ? {
              finalOnlyCompletedMedianMs: onMedianMs,
              previewCompletedMedianMs: offMedianMs,
              completedRatioFinalToPreview: onMedianMs / offMedianMs,
              completedDeltaMs: onMedianMs - offMedianMs,
              finalOnlyInitialReadyMedianMs: median(on.map((x) => x.initialSceneReadyMs)),
              previewInitialReadyMedianMs: median(off.map((x) => x.initialSceneReadyMs)),
              initialReadyRatioFinalToPreview:
                median(on.map((x) => x.initialSceneReadyMs)) /
                median(off.map((x) => x.initialSceneReadyMs)),
              finalOnlySkippedAssemblyFrames: on.map((x) => x.assemblySkippedFrames),
              previewSkippedAssemblyFrames: off.map((x) => x.assemblySkippedFrames),
            }
          : gpuProfile
            ? {
                normalMedianMs: offMedianMs,
                rasterDiscardMedianMs: onMedianMs,
                rasterDiscardToNormalRatio: onMedianMs / offMedianMs,
                rasterDiscardDeltaMs: onMedianMs - offMedianMs,
              }
            : {
                onMedianMs,
                offMedianMs,
                elapsedRatioOnToOff: onMedianMs / offMedianMs,
                elapsedDeltaMs: onMedianMs - offMedianMs,
              }),
    // Observational diagnostics, not automatically interpreted as a speedup.
    inferSpeedup: false,
    ...(hardwareElectricalAb
      ? {
          hardwareOnly: true,
          explicitFinishBarrier: true,
          gpuTimerScope:
            'first draw through end of animation callback; only non-disjoint results valid',
          interpretation:
            'Manually requested, headed hardware A/B. Non-software unmasked adapter is mandatory. Both arms use gl.finish. Two trials per arm are exploratory; require repeatability before default rollout. GPU timer may be null. Strict screenshot parity is required.',
        }
      : electricalPlanarAb
        ? {
            interpretation:
              'Default-off smooth electrical surface rendering experiment. Matching canvas pixels and reduced WebGL submissions are required; one ABBA round cannot establish hardware performance improvement or authorize rollout.',
          }
        : assemblyAb
          ? {
              interpretation:
                'Same-run final-image parity and equal submissions compare initial readiness and completed-image cost. Preview frames can affect responsiveness; a single ABBA round is inconclusive and cannot promote the policy.',
            }
          : gpuProfile
            ? {
                diagnosticOnly: true,
                explicitFinishBarrier: true,
                gpuTimerScope:
                  'first draw through end of animation callback; only non-disjoint results valid',
                interpretation:
                  'API primitive submissions remain identical, but discard may change driver optimization; these counts are not hardware invocation counters. Remaining cost is not pure vertex time. No product speedup or annotation omission is authorized.',
              }
            : {}),
  };
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  console.log(
    assemblyAb
      ? 'RENDERER_ASSEMBLY_AB_OK'
      : hardwareElectricalAb
        ? 'RENDERER_HARDWARE_ELECTRICAL_AB_OK'
        : electricalPlanarAb
          ? 'RENDERER_ELECTRICAL_PLANAR_AB_OK'
          : gpuProfile
            ? 'RENDERER_GPU_PROFILE_OK'
            : 'RENDERER_QUALITY_INDEX_AB_OK',
    JSON.stringify(report),
  );
} finally {
  await browser.close();
}
