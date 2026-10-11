// R7: strict fresh-context A-B-B-A renderer experiment.
// CI smoke proves the harness and visual gate only. Hardware mode requires a
// real Windows RTX 3060 and still cannot infer VRAM or pure GPU time from WebGL.
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
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';
import { R7_ORDER, summarizeR7Abba } from './test-helpers/renderer-r7-abba.mjs';

const ciSmoke = process.argv.includes('--ci-smoke');
const hardwareRtx3060 = process.argv.includes('--hardware-rtx3060');
assert.notEqual(ciSmoke, hardwareRtx3060, 'select exactly one: --ci-smoke or --hardware-rtx3060');
assert.ok(!hardwareRtx3060 || process.platform === 'win32', 'hardware mode requires Windows');
const output = new URL(
  hardwareRtx3060
    ? '../test-results/renderer-v4-r7-hardware-abba/'
    : '../test-results/renderer-v4-r7-ci-smoke/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const fixture = fileURLToPath(
  new URL(
    hardwareRtx3060
      ? '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad'
      : '../site/examples/previews/tio2-metalens-four-unit.wafercad',
    import.meta.url,
  ),
);
const report = {
  order: [...R7_ORDER],
  fixture,
  backendClass: hardwareRtx3060 ? 'hardware-intended, verified per trial' : 'CI probe only',
  mode: hardwareRtx3060 ? 'hardware-rtx3060' : 'ci-smoke',
  nodeVersion: process.version,
  platform: process.platform,
  comparisons: [],
  trials: [],
  gpuVramBytes: null,
  pureGpuFrameTimeMs: null,
  passed: false,
};
const browser = await chromium.launch({
  ...launchOptions,
  headless: hardwareRtx3060 ? false : launchOptions.headless,
});
const pngs = [];
const timeout = 180000;

async function oneArm(policy, index) {
  const context = await newUiContext(browser, {
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  const label = index + '-' + policy;
  const flags = [
    'rendererV4GpuCensus=1',
    'rendererV3RoiTrace=1',
    ...(policy === 'B' ? ['rendererV4FastSmoothIndex=1', 'rendererV4SharedFlatCaps=1'] : []),
  ];
  const row = { label, policy, flags, samples: [] };
  report.trials.push(row);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    const errors = observePageErrors(page);
    await page.goto(baseUrl + '/app.html?' + flags.join('&'));
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
    const host = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
    assert.equal(host.renderState, 'ready');
    assert.equal(host.sceneVariant, 'transparent');
    assert.equal(host.v4GpuResourceStatus, 'measured');
    assert.equal(host.v4GpuResourceComplete, 'true');
    assert.equal(host.v4GpuResourceCrossVariantGeometries, '0');
    assert.equal(host.v4GpuResourceCrossVariantMaterials, '0');
    const png = await page.locator('#threeHost canvas').screenshot();
    await writeFile(new URL(label + '.png', output), png);
    pngs.push(png);
    const adapter = await page.locator('#threeHost canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl.getParameter(gl.RENDERER),
        unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '',
      };
    });
    row.backend = classifyWebglBackend(adapter);
    if (hardwareRtx3060) {
      assert.ok(
        row.backend.hardwareVerified && /NVIDIA.*GeForce RTX 3060/i.test(row.backend.adapter),
        label + ': GPU is not a verified RTX 3060; cannot accept hardware experiment',
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
      sharedFlatClonesAvoided: Number(host.v4SharedFlatClonesAvoided || 0),
      renderer: row.backend.adapter,
      canvasWidth: await page.locator('#threeHost canvas').evaluate((canvas) => canvas.width),
      canvasHeight: await page.locator('#threeHost canvas').evaluate((canvas) => canvas.height),
    };
    assert.ok(row.state.geometries > 0 && row.state.cpuTypedArrayBytes > 0);
    assert.deepEqual(errors, [], label + ': unexpected browser exceptions');
    console.log('RENDERER_V4_R7_ABBA_ARM', JSON.stringify(row));
  } finally {
    await context.close();
  }
}
try {
  for (let i = 0; i < R7_ORDER.length; i++) await oneArm(R7_ORDER[i], i + 1);
  for (let i = 1; i < pngs.length; i++) {
    const pixels = compareScreenshotPngPixels(pngs[0], pngs[i]);
    report.comparisons.push({ pair: '1-' + (i + 1), ...pixels });
    assert.equal(pixels.pixelIdentical, true, 'R7 strict cross-context pixel parity');
  }
  for (let i = 1; i < report.trials.length; i++) {
    assert.equal(
      report.trials[i].state.cameraWorld,
      report.trials[0].state.cameraWorld,
      'R7 fixed camera world',
    );
    assert.equal(
      report.trials[i].state.cameraProjection,
      report.trials[0].state.cameraProjection,
      'R7 fixed projection',
    );
  }
  // Counts must remain reproducible within each policy. Cross-policy
  // reductions are reported but never fabricated as performance gains.
  for (const [a, b] of [[0, 3], [1, 2]]) {
    for (const key of ['drawCalls', 'triangles', 'geometries', 'cpuTypedArrayBytes']) {
      assert.equal(report.trials[a].state[key], report.trials[b].state[key], key + ' drift');
    }
  }
  const stats = summarizeR7Abba(report.trials);
  report.stats = stats;
  report.passed = true;
  console.log('RENDERER_V4_R7_ABBA_REPORT', JSON.stringify(report));
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
assert.equal(report.passed, true, 'R7 parity, backend or ABBA invariants failed');
