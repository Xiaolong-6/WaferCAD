// Production-v2 Worker rejection and Abort transaction acceptance.
// The original Legacy scientific fault scenario stays active until parity is confirmed.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__v2WorkerFault = { injected: 0, aborted: 0, rejected: 0 };
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (!String(url).includes('process-worker.js')) return;
          const post = this.postMessage.bind(this);
          this.addEventListener('message', ({ data }) => {
            if (data?.rejected) window.__v2WorkerFault.rejected++;
          });
          this.postMessage = (input, ...rest) => {
            let request = input;
            if (window.__injectRejectedV2Candidate) {
              window.__injectRejectedV2Candidate = false;
              request = structuredClone(request);
              const overlap = structuredClone(request.model.regions[0]);
              overlap.id = 'v2-acceptance-overlap';
              overlap.stack[0].z0 -= 1;
              request.model.regions.push(overlap);
              window.__v2WorkerFault.injected++;
            }
            if (window.__abortNextV2Candidate) {
              window.__abortNextV2Candidate = false;
              window.__v2WorkerFault.aborted++;
              const result = post(request, ...rest);
              queueMicrotask(() => document.getElementById('processTaskAbortBtn')?.click());
              return result;
            }
            return post(request, ...rest);
          };
        }
      };
    });
    await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const prepare = async (name) => {
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('1');
      await page.locator('#layerName').fill(name);
    };
    const awaitIdle = () =>
      page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy);
    const awaitMessage = (pattern) =>
      page.waitForFunction(
        (source) =>
          new RegExp(source).test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        pattern.source,
        { timeout: 120000 },
      );
    await page.locator('[data-action="domain:process"]').click();
    await prepare('Committed fault baseline');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Committed fault baseline',
        ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const before = await snapshot();
    assert.equal(before.workflow.steps.length, 1);

    await prepare('Rejected worker candidate');
    await page.evaluate(() => {
      window.__injectRejectedV2Candidate = true;
    });
    await page.locator('#applyOperationBtn').click();
    await awaitMessage(/Process result rejected/);
    await awaitIdle();
    const rejected = await snapshot();
    assert.deepEqual(rejected.model, before.model, 'Rejected Worker may not mutate canonical model');
    assert.deepEqual(rejected.workflow.steps, before.workflow.steps, 'Rejected Worker preserves Steps');
    assert.deepEqual(
      rejected.workflow.branches,
      before.workflow.branches,
      'Rejected Worker preserves Variants',
    );
    const afterRejectProbe = await page.evaluate(() => window.__v2WorkerFault);
    assert.equal(afterRejectProbe.injected, 1);
    assert.ok(afterRejectProbe.rejected >= 1, 'Worker reports strict geometry rejection');

    await prepare('Aborted worker candidate');
    await page.evaluate(() => {
      window.__abortNextV2Candidate = true;
    });
    await page.locator('#applyOperationBtn').click();
    await awaitMessage(/Operation aborted/);
    await awaitIdle();
    const aborted = await snapshot();
    assert.deepEqual(aborted.model, before.model, 'Abort cannot mutate geometry');
    assert.deepEqual(aborted.workflow.steps, before.workflow.steps, 'Abort preserves Steps');
    assert.deepEqual(aborted.workflow.branches, before.workflow.branches, 'Abort preserves Variants');
    assert.equal((await page.evaluate(() => window.__v2WorkerFault)).aborted, 1);

    await prepare('Recovered worker candidate');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Recovered worker candidate',
        ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const restored = await snapshot();
    assert.equal(restored.workflow.steps.length, before.workflow.steps.length + 1);
    assert.deepEqual(errors, [], 'No uncaught page errors');
    console.log('V2_WORKER_FAULT_PARITY: rejection, Abort and retry PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
