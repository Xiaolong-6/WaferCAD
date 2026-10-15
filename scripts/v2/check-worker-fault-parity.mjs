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
              window.queueMicrotask(() => {
                document.getElementById('processTaskAbortBtn')?.click();
              });
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
    // Match the historical Legacy scenario: two committed Steps, then restore
    // the first before injecting failures. Failure must not fork History.
    for (const name of ['Committed fault baseline', 'Second fault baseline']) {
      await prepare(name);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (layerName) =>
          window.WaferCadV2Workstation.snapshot().model.layers.some(
            (layer) => layer.name === layerName,
          ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
        name,
        { timeout: 120000 },
      );
    }
    assert.equal((await snapshot()).workflow.steps.length, 2);
    await page.locator('[data-action="domain:history"]').click();
    await page
      .locator('.process-history-row.history-step-row', { hasText: 'Committed fault baseline' })
      .first()
      .click();
    // Scientific state, not an optional/history-only banner, is the gate.
    await page.waitForFunction(
      () => {
        const model = window.WaferCadV2Workstation.snapshot().model;
        return (
          model.layers.some((layer) => layer.name === 'Committed fault baseline') &&
          !model.layers.some((layer) => layer.name === 'Second fault baseline')
        );
      },
      null,
      { timeout: 30000 },
    );
    await page.locator('[data-action="domain:process"]').click();
    const before = await snapshot();
    assert.ok(before.model.layers.some((layer) => layer.name === 'Committed fault baseline'));
    assert.equal(
      before.model.layers.some((layer) => layer.name === 'Second fault baseline'),
      false,
      'Restoring historical Step must remove downstream physical layer from working state',
    );
    const applyFromHistory = async () => {
      await page.locator('#applyOperationBtn').click();
      await page.getByRole('button', { name: 'Create Variant & apply', exact: true }).click();
    };

    await prepare('Rejected worker candidate');
    await page.evaluate(() => {
      window.__injectRejectedV2Candidate = true;
    });
    await applyFromHistory();
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
    await applyFromHistory();
    await awaitMessage(/Operation aborted/);
    await awaitIdle();
    const aborted = await snapshot();
    assert.deepEqual(aborted.model, before.model, 'Abort cannot mutate geometry');
    assert.deepEqual(aborted.workflow.steps, before.workflow.steps, 'Abort preserves Steps');
    assert.deepEqual(aborted.workflow.branches, before.workflow.branches, 'Abort preserves Variants');
    assert.equal((await page.evaluate(() => window.__v2WorkerFault)).aborted, 1);

    await prepare('Recovered worker candidate');
    await applyFromHistory();
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
    assert.equal(
      restored.workflow.branches.length,
      before.workflow.branches.length + 1,
      'Only a successful Worker result creates the copy-on-write Variant',
    );
    assert.ok(
      restored.model.layers.some((layer) => layer.name === 'Recovered worker candidate'),
      'New Variant contains the successful deposition',
    );
    assert.deepEqual(errors, [], 'No uncaught page errors');
    console.log('V2_WORKER_FAULT_PARITY: rejection, Abort and retry PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
