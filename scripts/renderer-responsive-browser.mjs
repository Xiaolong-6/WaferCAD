import { resolveRendererWorkstationUrl } from './test-helpers/renderer-workstation-route.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  baseUrl,
  chooseConfirmation,
  closeFunctionPanel,
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
} from './test-helpers/ui.mjs';

const output = new URL('../test-results/renderer-responsive/', import.meta.url);
await mkdir(output, { recursive: true });
const fixture = fileURLToPath(
  new URL('../site/examples/previews/tio2-metalens-four-unit.wafercad', import.meta.url),
);
const workstationUrl = await resolveRendererWorkstationUrl(baseUrl);
const browser = await launchBrowser();
const report = { passed: false, stage: 'initialization' };
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const errors = observePageErrors(page);
    const host = page.locator('#threeHost');
    const snapshot = () => host.evaluate((node) => ({ ...node.dataset }));
    const load = async () => {
      const input = page.locator('#openProjectInput');
      await input.setInputFiles([]);
      await input.setInputFiles(fixture);
      await chooseConfirmation(page);
      await page.waitForFunction(
        () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
        undefined,
        { timeout: 90000 },
      );
    };
    await page.goto(
      workstationUrl +
        '?rendererResponsiveModelStage=1&rendererResponsiveSmoothWorker=1&rendererResponsiveRoughBudget=1&rendererResponsiveMetrics=1&rendererResponsiveGpuTimer=1&rendererV4GpuCensus=1',
    );
    await waitForAppReady(page);
    await load();
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 90000);
    const first = await snapshot();
    assert.equal(first.renderState, 'ready');
    assert.ok(Number(first.rendererFrameSerial || 0) > 0);
    report.first = {
      serial: Number(first.rendererFrameSerial),
      generation: Number(first.sceneGeneration),
    };
    report.stage = 'reimport-staged-model';
    await load();
    await page.waitForFunction(
      (priorFrame) => {
        const node = document.getElementById('threeHost');
        return (
          node?.dataset.renderState === 'ready' &&
          Number(node.dataset.rendererStagedModelBuilds || 0) >= 1 &&
          Number(node.dataset.rendererCommittedModelSwaps || 0) >= 1 &&
          Number(node.dataset.rendererFrameSerial || 0) > priorFrame
        );
      },
      report.first.serial,
      { timeout: 90000 },
    );
    const after = await snapshot();
    assert.equal(after.rendererDisplayedState, undefined, 'outdated label must clear after commit');
    assert.equal(
      after.rendererStagedModelBuilds,
      after.rendererCommittedModelSwaps,
      'every completed model staging operation must commit exactly once',
    );
    assert.ok(Number(after.sceneGeneration) > report.first.generation);
    assert.equal(after.v4GpuResourceStatus, 'measured');
    assert.equal(after.v4GpuResourceComplete, 'true');
    assert.ok(Number(after.v4GpuResourceSceneGroups) <= 2, 'old scene resources retired');
    // Directly exercise the real CPU Worker in Chromium, even when this
    // small fixture has no eligible large smooth-sidewall groups.
    const smoothWorkerSmoke = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL('renderer-v4-smooth-sidewall-worker.js', document.baseURI),
          );
          const id = 'responsive-worker-smoke';
          const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error('Smooth-sidewall Worker timed out'));
          }, 10000);
          const finish = (result, error = null) => {
            clearTimeout(timeout);
            worker.terminate();
            if (error) reject(error);
            else resolve(result);
          };
          worker.onerror = (event) => finish(null, new Error(event.message));
          worker.onmessage = ({ data }) => {
            if (data?.id !== id) return;
            if (data.type === 'error') finish(null, new Error(data.message));
            else
              finish({
                positions: data.positions instanceof Float32Array ? data.positions.length : -1,
                normals: data.normals instanceof Float32Array ? data.normals.length : -1,
              });
          };
          worker.postMessage({ id, parts: [{ p: [0, 0], q: [1, 0], z0: 0, z1: 1 }] });
        }),
    );
    assert.deepEqual(smoothWorkerSmoke, { positions: 18, normals: 18 });
    const jank = await host.evaluate((node) => ({
      supported: node.dataset.rendererLongTaskSupported,
      count: Number(node.dataset.rendererLongTaskCount || 0),
      p95Ms: Number(node.dataset.rendererLongTaskP95Ms || 0),
      blockingMs: Number(node.dataset.rendererMainThreadBlockingMs || 0),
    }));
    assert.match(jank.supported, /^(true|false)$/, 'long-task capability is explicit');
    assert.ok(Number.isFinite(jank.count) && jank.count >= 0);
    assert.ok(Number.isFinite(jank.p95Ms) && jank.p95Ms >= 0);
    assert.ok(Number.isFinite(jank.blockingMs) && jank.blockingMs >= 0);
    report.mainThreadJank = jank;

    report.smoothSidewallWorker = {
      ...smoothWorkerSmoke,
      sceneJobs: Number(after.rendererSmoothWorkerJobs || 0),
      fallbackCount: Number(after.rendererSmoothWorkerFallbacks || 0),
    };
    // Input-to-WebGL-submit telemetry; this is not a compositor-presented
    // latency or a physical GPU timing measurement.
    const canvas = host.locator('canvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds && bounds.width > 80 && bounds.height > 80);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const previousSerial = Number((await snapshot()).rendererFrameSerial || 0);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 18, cy + 14, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(
      (serial) => {
        const d = document.getElementById('threeHost')?.dataset;
        return (
          Number(d?.rendererInputSamples || 0) >= 1 && Number(d?.rendererFrameSerial || 0) > serial
        );
      },
      previousSerial,
      { timeout: 90000 },
    );
    const gpu = await host.evaluate((node) => ({
      supported: node.dataset.rendererGpuTimerSupported,
      samples: Number(node.dataset.rendererGpuSamples || 0),
      pending: Number(node.dataset.rendererGpuPendingQueries || 0),
      p95Ms: Number(node.dataset.rendererGpuP95Ms || 0),
      maxMs: Number(node.dataset.rendererGpuMaxMs || 0),
      dropped: Number(node.dataset.rendererGpuDroppedQueries || 0),
      disjoint: Number(node.dataset.rendererGpuDisjointCount || 0),
    }));
    assert.match(gpu.supported, /^(true|false)$/, 'GPU timer capability is explicit');
    for (const value of Object.values(gpu).slice(1))
      assert.ok(Number.isFinite(value) && value >= 0, 'GPU timer values must be finite');
    if (gpu.samples) {
      assert.equal(gpu.supported, 'true', 'GPU timer samples require extension support');
      assert.ok(gpu.maxMs >= gpu.p95Ms);
    }
    report.gpuTimer = gpu;
    console.log('RENDERER_GPU_TIMER', JSON.stringify(gpu));
    const latency = await snapshot();
    report.inputToSubmit = {
      samples: Number(latency.rendererInputSamples),
      p95Ms: Number(latency.rendererInputToSubmitP95Ms),
      maxMs: Number(latency.rendererInputToSubmitMaxMs),
      frameSubmitP95Ms: Number(latency.rendererFrameSubmitP95Ms),
    };
    for (const value of Object.values(report.inputToSubmit))
      assert.ok(Number.isFinite(value) && value >= 0, 'finite JS submission metrics');
    console.log('RENDERER_INPUT_TO_SUBMIT', JSON.stringify(report.inputToSubmit));
    await host.screenshot({ path: fileURLToPath(new URL('committed.png', output)) });
    assert.deepEqual(errors, [], 'no browser errors');
    report.after = {
      serial: Number(after.rendererFrameSerial),
      staged: Number(after.rendererStagedModelBuilds),
      committed: Number(after.rendererCommittedModelSwaps),
      retainedGroups: Number(after.v4GpuResourceSceneGroups),
    };
    report.passed = true;
    report.stage = 'passed';
  } finally {
    await context.close();
  }
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  console.log('RENDERER_RESPONSIVE_ACCEPTANCE', JSON.stringify(report));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
