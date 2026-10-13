import { resolveRendererWorkstationUrl } from './test-helpers/renderer-workstation-route.mjs';
// R7: strict fresh-context A-B-B-A renderer experiment.
// CI smoke proves the harness and visual gate only. Hardware mode accepts a
// verified discrete or integrated GPU; wall measurements are not pure GPU time.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  baseUrl,
  launchOptions,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForPaint,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
} from './test-helpers/ui.mjs';
import { classifyWebglBackend } from './test-helpers/webgl-backend-classification.mjs';
import { compareScreenshotPngPixels, decodeScreenshotPng } from './test-helpers/png-pixel-diff.mjs';
import {
  R7_ORDER,
  R7_PIXEL_PAIRS,
  classifyR7PixelSignatures,
  summarizeR7Abba,
  summarizeR7PixelParity,
  selectR7Candidate,
  classifyR7CandidateActivation,
} from './test-helpers/renderer-r7-abba.mjs';

const ciSmoke = process.argv.includes('--ci-smoke');
const hardwareRtx3060 = process.argv.includes('--hardware-rtx3060');
const hardwareGpu = process.argv.includes('--hardware-gpu') || hardwareRtx3060;
const gpuTiming = process.argv.includes('--gpu-timing');
const diagnosticNoMsaa = process.argv.includes('--diagnose-no-msaa');
assert.ok(
  !diagnosticNoMsaa || hardwareGpu || ciSmoke,
  '--diagnose-no-msaa requires --hardware-gpu or software-only --ci-smoke',
);
const candidate = selectR7Candidate(process.argv);
const { candidateName, flags: candidateFlags, artifactSuffix } = candidate;
assert.notEqual(ciSmoke, hardwareGpu, 'select exactly one: --ci-smoke or --hardware-gpu');
assert.ok(!hardwareRtx3060 || process.platform === 'win32', '--hardware-rtx3060 requires Windows');
const output = new URL(
  '../test-results/' +
    (hardwareGpu ? 'renderer-v4-r7-hardware-abba' : 'renderer-v4-r7-ci-smoke') +
    artifactSuffix +
    (diagnosticNoMsaa ? '-no-msaa' : '') +
    '/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const fixture = fileURLToPath(
  new URL(
    hardwareGpu
      ? '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad'
      : '../site/examples/previews/tio2-metalens-four-unit.wafercad',
    import.meta.url,
  ),
);
const report = {
  order: [...R7_ORDER],
  candidateName,
  candidateMode: candidate.mode,
  candidateFlags,
  fixture,
  backendClass: hardwareGpu ? 'hardware-intended, verified per trial' : 'CI probe only',
  mode: hardwareRtx3060 ? 'hardware-rtx3060' : hardwareGpu ? 'hardware-gpu' : 'ci-smoke',
  nodeVersion: process.version,
  platform: process.platform,
  comparisons: [],
  trials: [],
  parity: null,
  stats: null,
  failureReasons: [],
  stage: 'initialization',
  gpuVramBytes: null,
  pureGpuFrameTimeMs: null,
  gpuTimerRequested: gpuTiming,
  diagnosticNoMsaa,
  acceptanceEligible: !diagnosticNoMsaa,
  diagnosticComplete: false,
  captureMethod: diagnosticNoMsaa ? 'page-clip' : 'element',
  gpuTimerTrials: [],
  passed: false,
};
const rendererWorkstationUrl = await resolveRendererWorkstationUrl(baseUrl);
const browser = await chromium.launch({
  ...launchOptions,
  headless: hardwareGpu ? false : launchOptions.headless,
});
const pngs = [];
const timeout = 180000;

// Playwright locator.screenshot waits for a stable element before capture.
// A hardware context can keep repainting while its WebGL camera and scene
// remain stable; the last R9 Index A arm timed out in that UI wait. Only the
// diagnostic pathway bypasses element auto-scroll/stability by clipping the
// ready canvas from the page compositor. Ordinary product R7 is unchanged.
async function captureR7CanvasPng(page) {
  const canvas = page.locator('#threeHost canvas');
  if (!diagnosticNoMsaa) return canvas.screenshot();
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && viewport && box.width > 0 && box.height > 0, 'Missing canvas screenshot bounds');
  assert.ok(
    box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height,
    'R7 canvas is outside the viewport; refusing to capture a different region',
  );
  return page.screenshot({ clip: box, timeout });
}

async function oneArm(policy, index) {
  const context = await newUiContext(browser, {
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  if (diagnosticNoMsaa) {
    // Instrument no product source and no render materials: only force the
    // fresh WebGL2 context allocation to use zero multisample samples.
    await context.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === 'webgl2') {
          return native.call(this, kind, { ...(args[0] || {}), antialias: false });
        }
        return native.call(this, kind, ...args);
      };
    });
  }
  const label = index + '-' + policy;
  const flags = [
    'rendererV4GpuCensus=1',
    'rendererV3RoiTrace=1',
    ...(gpuTiming ? ['rendererResponsiveGpuTimer=1'] : []),
    ...(policy === 'B' ? candidateFlags : []),
  ];
  const row = { label, policy, flags, samples: [] };
  report.trials.push(row);
  report.stage = 'capture-' + label;
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    const errors = observePageErrors(page);
    await page.goto(rendererWorkstationUrl + '?' + flags.join('&'));
    await waitForAppReady(page);
    await page.locator('#openProjectInput').setInputFiles(fixture);
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, timeout);
    if (diagnosticNoMsaa) {
      row.rasterIsolation = await page.locator('#threeHost canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        if (!gl || gl.isContextLost()) throw new Error('Missing diagnostic WebGL2 context');
        return {
          contextAntialias: gl.getContextAttributes()?.antialias ?? null,
          defaultFramebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === null,
          defaultFramebufferSamples: gl.getParameter(gl.SAMPLES),
        };
      });
      assert.deepEqual(
        row.rasterIsolation,
        { contextAntialias: false, defaultFramebuffer: true, defaultFramebufferSamples: 0 },
        label + ': no-MSAA diagnostic did not disable actual default framebuffer sampling',
      );
    }
    // Ensure a common render policy and pose; never reuse a warmed context
    // across ABBA arms (that would hide GPU initialization costs).
    if ((await page.locator('#threeFastBtn').inputValue()) !== 'fast') {
      await page.locator('#threeFastBtn').selectOption('fast');
      await waitForThreeReady(page, timeout);
    }
    const display = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    if (
      (await display.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))) &&
      !(await more.evaluate((node) => node.open))
    ) {
      await more.locator(':scope > summary').click();
    }
    if (!(await display.evaluate((node) => node.open))) {
      await display.locator(':scope > summary').click();
    }
    if ((await page.locator('#threeOpacityRange').inputValue()) !== '0.5') {
      const before = Number(
        await page.locator('#threeHost').evaluate((node) => node.dataset.rendererFrameSerial || 0),
      );
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.waitForFunction(
        (serial) => {
          const host = document.getElementById('threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            host.dataset.sceneVariant === 'transparent' &&
            Number(host.dataset.rendererFrameSerial || 0) > serial
          );
        },
        before,
        { timeout },
      );
    }
    await page.locator('#fit3dBtn').click();
    await waitForThreeReady(page, timeout);
    // Measure warm, product-triggered completed frames with an in-page clock
    // and a blocking gl.finish. This is wall latency, never GPU query time.
    for (let sample = 0; sample < (ciSmoke ? 2 : 4); sample++) {
      const measurement = await page.evaluate(async (maxMs) => {
        const host = document.getElementById('threeHost');
        const fit = document.getElementById('fit3dBtn');
        const canvas = document.querySelector('#threeHost canvas');
        const previous = Number(host.dataset.rendererFrameSerial || 0);
        const started = performance.now();
        fit.click();
        await new Promise((resolve, reject) => {
          const check = () => {
            if (
              host.dataset.renderState === 'ready' &&
              Number(host.dataset.rendererFrameSerial || 0) > previous
            ) {
              resolve();
            } else if (performance.now() - started > maxMs) {
              reject(new Error('No completed new WebGL frame after real Fit control'));
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        });
        const gl = canvas.getContext('webgl2');
        if (!gl || gl.isContextLost()) throw new Error('Missing live WebGL2 context');
        gl.finish();
        return {
          driverFinishWallMs: performance.now() - started,
          rendererSubmitMs: Number(host.dataset.rendererFrameMs),
          frameSerial: Number(host.dataset.rendererFrameSerial),
          drawCalls: Number(host.dataset.rendererDrawCalls),
          triangles: Number(host.dataset.rendererDrawTriangles),
        };
      }, timeout);
      assert.ok(Number.isFinite(measurement.rendererSubmitMs) && measurement.rendererSubmitMs >= 0);
      assert.ok(measurement.drawCalls > 0 && measurement.triangles > 0);
      row.samples.push(measurement);
    }
    await waitForPaint(page);
    if (gpuTiming) {
      const available = await page
        .locator('#threeHost')
        .evaluate((node) => node.dataset.rendererGpuTimerSupported === 'true');
      if (available) {
        // Query results are polled in separate tasks without a GPU sync read.
        // Do not reject a valid hardware run when the extension is available
        // but no result arrives within this bounded observation window.
        await page
          .waitForFunction(
            () => Number(document.getElementById('threeHost')?.dataset.rendererGpuSamples || 0) > 0,
            null,
            { timeout: 5000 },
          )
          .catch(() => {});
      }
    }
    const host = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
    if (gpuTiming) {
      row.gpuTimer = {
        supported: host.rendererGpuTimerSupported === 'true',
        samples: Number(host.rendererGpuSamples || 0),
        p95Ms:
          host.rendererGpuP95Ms !== '' && host.rendererGpuP95Ms != null
            ? Number(host.rendererGpuP95Ms)
            : null,
        maxMs:
          host.rendererGpuMaxMs !== '' && host.rendererGpuMaxMs != null
            ? Number(host.rendererGpuMaxMs)
            : null,
        dropped: Number(host.rendererGpuDroppedQueries || 0),
        disjoint: Number(host.rendererGpuDisjointCount || 0),
      };
      report.gpuTimerTrials.push({ label, adapter: null, ...row.gpuTimer });
      console.log('RENDERER_R7_GPU_TIMER', JSON.stringify({ label, ...row.gpuTimer }));
    }
    assert.equal(host.renderState, 'ready');
    assert.equal(host.sceneVariant, 'transparent');
    assert.equal(host.v4GpuResourceStatus, 'measured');
    assert.equal(host.v4GpuResourceComplete, 'true');
    assert.equal(host.v4GpuResourceCrossVariantGeometries, '0');
    assert.equal(host.v4GpuResourceCrossVariantMaterials, '0');
    const png = await captureR7CanvasPng(page);
    await writeFile(new URL(label + '.png', output), png);
    pngs.push(png);
    // Two independent reads without touching Fit or the camera. Distinguish
    // screenshot/compositor instability from fresh-context reproducibility.
    const duplicate = await captureR7CanvasPng(page);
    await writeFile(new URL(label + '-duplicate.png', output), duplicate);
    row.sameContextPixels = compareScreenshotPngPixels(png, duplicate);
    const adapter = await page.locator('#threeHost canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl.getParameter(gl.RENDERER),
        unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '',
      };
    });
    row.backend = classifyWebglBackend(adapter);
    if (gpuTiming) report.gpuTimerTrials.at(-1).adapter = row.backend.adapter;
    if (hardwareGpu) {
      assert.ok(
        row.backend.hardwareVerified &&
          (!hardwareRtx3060 || /NVIDIA.*GeForce RTX 3060/i.test(row.backend.adapter || '')),
        label +
          ': expected a verified hardware GPU' +
          (hardwareRtx3060 ? ' (RTX 3060 for the legacy command)' : ''),
      );
    }
    row.state = {
      cameraWorld: host.rendererCameraWorld,
      cameraProjection: host.rendererCameraProjection,
      drawCalls: Number(host.rendererDrawCalls),
      triangles: Number(host.rendererDrawTriangles),
      geometries: Number(host.v4GpuResourceGeometries),
      materials: Number(host.v4GpuResourceMaterials),
      cpuTypedArrayBytes: Number(host.v4GpuResourceEstimatedBufferBytes),
      sharedFlatClonesAvoided:
        host.v4SharedFlatClonesAvoided === undefined
          ? null
          : Number(host.v4SharedFlatClonesAvoided),
      fastIndexedVertices:
        host.v4FastIndexedVertices === undefined ? null : Number(host.v4FastIndexedVertices),
      fastOriginalVertices:
        host.v4FastOriginalVertices === undefined ? null : Number(host.v4FastOriginalVertices),
      renderer: row.backend.adapter,
      canvasWidth: await page.locator('#threeHost canvas').evaluate((canvas) => canvas.width),
      canvasHeight: await page.locator('#threeHost canvas').evaluate((canvas) => canvas.height),
    };
    assert.ok(row.state.geometries > 0 && row.state.cpuTypedArrayBytes > 0);
    row.candidateActivation = classifyR7CandidateActivation(candidate.mode, row.state, policy);
    // Strict isolation needs both halves: A must have neither optimization,
    // B must enable ONLY those selected by its candidate mode. An unexpected
    // extra optimization invalidates causal attribution just like a no-op.
    if (hardwareGpu) {
      assert.ok(
        row.candidateActivation.countersComplete,
        label + ': R7 candidate instrumentation counters are missing or invalid',
      );
      assert.ok(
        row.candidateActivation.candidateExercised,
        label + ': actual Index/Caps activity disagrees with the requested A/B policy',
      );
    }
    assert.deepEqual(errors, [], label + ': unexpected browser exceptions');
    console.log('RENDERER_V4_R7_ABBA_ARM', JSON.stringify(row));
  } finally {
    await context.close();
  }
}
try {
  for (let i = 0; i < R7_ORDER.length; i++) await oneArm(R7_ORDER[i], i + 1);
  report.stage = 'all-pair-pixel-parity';
  // Always compare ALL six pairs: A1/A2 and B1/B2 repeatability must be
  // established before A/B disagreements can be attributed to the candidate.
  for (const { pair, kind } of R7_PIXEL_PAIRS) {
    const [left, right] = pair.split('-').map((value) => Number(value) - 1);
    const pixels = compareScreenshotPngPixels(pngs[left], pngs[right]);
    const comparison = { pair, kind, ...pixels };
    report.comparisons.push(comparison);
    console.log('RENDERER_V4_R7_ABBA_PIXEL_PAIR', JSON.stringify(comparison));
  }
  report.parity = summarizeR7PixelParity(report.comparisons);
  report.pixelSignature = classifyR7PixelSignatures(pngs.map(decodeScreenshotPng));
  report.stats = summarizeR7Abba(report.trials);
  // This optional result is GPU *execution time*, not wall time or pixels.
  // Expose a single hardware aggregate only if ALL four independent contexts
  // produced valid query samples on a verified physical GPU adapter.
  if (
    gpuTiming &&
    hardwareGpu &&
    report.trials.every(
      (row) =>
        row.backend?.hardwareVerified &&
        row.gpuTimer?.supported &&
        row.gpuTimer.samples > 0 &&
        Number.isFinite(row.gpuTimer.p95Ms),
    )
  ) {
    const sorted = report.trials.map((row) => row.gpuTimer.p95Ms).sort((a, b) => a - b);
    report.pureGpuFrameTimeMs = (sorted[1] + sorted[2]) / 2;
  }
  const failures = report.failureReasons;
  for (const row of report.trials) {
    if (!row.sameContextPixels.pixelIdentical) {
      failures.push(row.label + ': even duplicate in-context screenshots differ');
    }
  }
  if (!report.parity.baselineRepeatable) {
    failures.push('baseline A1/A2 fresh-context pixel parity failed');
  }
  if (!report.parity.candidateRepeatable) {
    failures.push('candidate B1/B2 fresh-context pixel parity failed');
  }
  if (!report.parity.crossPolicyIdentical) {
    failures.push('one or more cross-policy A/B pixel comparisons failed');
  }
  for (let i = 1; i < report.trials.length; i++) {
    if (report.trials[i].state.cameraWorld !== report.trials[0].state.cameraWorld) {
      failures.push(report.trials[i].label + ': camera world differs from A1');
    }
    if (report.trials[i].state.cameraProjection !== report.trials[0].state.cameraProjection) {
      failures.push(report.trials[i].label + ': camera projection differs from A1');
    }
    if (report.trials[i].backend.adapter !== report.trials[0].backend.adapter) {
      failures.push(report.trials[i].label + ': WebGL adapter differs from A1');
    }
  }
  for (const [a, b] of [
    [0, 3],
    [1, 2],
  ]) {
    for (const key of [
      'drawCalls',
      'triangles',
      'geometries',
      'cpuTypedArrayBytes',
      'sharedFlatClonesAvoided',
      'fastIndexedVertices',
      'fastOriginalVertices',
    ]) {
      if (report.trials[a].state[key] !== report.trials[b].state[key]) {
        failures.push(key + ': same-policy counts drift in ' + (a + 1) + '-' + (b + 1));
      }
    }
  }
  report.passed = !diagnosticNoMsaa && failures.length === 0 && report.parity.strictPixelParity;
  report.stage = 'complete';
  report.diagnosticComplete =
    diagnosticNoMsaa &&
    report.trials.length === R7_ORDER.length &&
    report.comparisons.length === R7_PIXEL_PAIRS.length &&
    report.trials.every((row) => row.rasterIsolation?.defaultFramebufferSamples === 0);
  console.log('RENDERER_V4_R7_ABBA_REPORT', JSON.stringify(report));
  // Complete diagnostic evidence is valuable even when strict pixels differ.
  // Its zero-MSAA screenshots must never approve the 4-sample product policy.
  if (!diagnosticNoMsaa) {
    assert.ok(report.passed, 'R7 strict parity blocked: ' + failures.join('; '));
  } else {
    assert.ok(report.diagnosticComplete, 'R7 no-MSAA diagnostic evidence incomplete');
  }
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
if (!diagnosticNoMsaa) {
  assert.equal(report.passed, true, 'R7 parity, backend or ABBA invariants failed');
} else {
  assert.equal(report.diagnosticComplete, true, 'R7 no-MSAA diagnostic incomplete');
}
