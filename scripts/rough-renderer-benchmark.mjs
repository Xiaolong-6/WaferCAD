import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel } = await import('../site/model.js');

const browser = await launchBrowser();
const output = new URL('../test-results/rough-renderer-benchmark/', import.meta.url);
await mkdir(output, { recursive: true });

function numeric(dataset, key) {
  const value = Number(dataset?.[key]);
  return Number.isFinite(value) ? value : null;
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);

  const model = createModel({ shape: 'rect', width: 60, height: 60, thickness: 8 });
  const rough = applyOperation(model, {
    type: 'etch',
    thickness: 1.2,
    face: 'front',
    area: model.boundary,
    surface: {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 0.25,
      meanHeight: 0.55,
      etchDepth: 1.2,
      featureCv: 0.18,
      heightCv: 0.2,
      seed: 20261007,
      geometryMode: 'ideal',
    },
  });
  assert.equal(rough.changed, true);
  const project = projectForBenchmark({
    model,
    section: { a: [-28, 0], b: [28, 0] },
  });

  await page.goto(baseUrl + '/app.html');
  await waitForAppReady(page);

  const initialStarted = performance.now();
  await page.locator('#openProjectInput').setInputFiles({
    name: 'rough-renderer-benchmark.wafercad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await chooseConfirmation(page);
  await page.waitForFunction(() =>
    document.getElementById('statusText').textContent.startsWith('Opened '),
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 180000);
  const initialReadyMs = performance.now() - initialStarted;

  const snapshot = () =>
    page.locator('#threeHost').evaluate((host) => {
      const canvas = host.querySelector('canvas');
      return { host: { ...host.dataset }, canvas: { ...(canvas?.dataset || {}) } };
    });

  const fast = await snapshot();
  const qualityStarted = performance.now();
  await page.locator('#threeFastBtn').click();
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost')?.dataset?.renderQuality === 'quality' &&
      document.getElementById('threeHost')?.dataset?.renderState === 'ready',
    null,
    { timeout: 180000 },
  );
  const qualityReadyMs = performance.now() - qualityStarted;
  const quality = await snapshot();

  const report = {
    browserVersion: browser.version(),
    initialReadyMs,
    qualityReadyMs,
    fast: {
      backend: fast.canvas.roughMeshBackend || 'unknown',
      gpuTaskCount: numeric(fast.canvas, 'roughGpuTaskCount'),
      rendererRoughMs: numeric(fast.host, 'rendererRoughMs'),
      roughTriangleCount: numeric(fast.canvas, 'roughTriangleCount'),
      roughSubdivisionTriangleCount: numeric(fast.canvas, 'roughSubdivisionTriangleCount'),
      roughBaseTriangleCount: numeric(fast.canvas, 'roughBaseTriangleCount'),
      roughSceneTriangleBudget: numeric(fast.canvas, 'roughSceneTriangleBudget'),
    },
    quality: {
      backend: quality.canvas.roughMeshBackend || 'unknown',
      gpuTaskCount: numeric(quality.canvas, 'roughGpuTaskCount'),
      rendererRoughMs: numeric(quality.host, 'rendererRoughMs'),
      roughTriangleCount: numeric(quality.canvas, 'roughTriangleCount'),
      roughSubdivisionTriangleCount: numeric(quality.canvas, 'roughSubdivisionTriangleCount'),
      roughBaseTriangleCount: numeric(quality.canvas, 'roughBaseTriangleCount'),
      roughSceneTriangleBudget: numeric(quality.canvas, 'roughSceneTriangleBudget'),
    },
    errors,
  };
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('ROUGH_RENDERER_BENCHMARK_OK', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
