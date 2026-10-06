import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import { exportCurrentProject, loadProject } from './test-helpers/product-scientific.mjs';
import {
  chooseConfirmation,
  newUiContext,
  openFunctionPanel,
  waitForAppReady,
  waitForStatus,
} from './test-helpers/ui.mjs';
await loadGeometryKernel();
const { createModel } = await import('../site/model.js');

export async function runTransactionAcceptance(
  page,
  output = 'test-results/ui-acceptance/transaction',
) {
  await mkdir(output, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__transactionAcceptance = { injected: 0, messages: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (!String(url).includes('process-worker.js')) return;
        this.addEventListener('message', ({ data }) =>
          window.__transactionAcceptance.messages.push({
            type: data.type,
            stage: data.stage,
            rejected: data.rejected,
            error: data.error,
          }),
        );
        const post = this.postMessage.bind(this);
        this.postMessage = (request, ...rest) => {
          if (window.__injectInvalidProcessCandidate) {
            window.__injectInvalidProcessCandidate = false;
            request = structuredClone(request);
            const duplicate = structuredClone(request.model.regions[0]);
            duplicate.id = 'acceptance-invalid-owner';
            duplicate.stack[0].z0 -= 1;
            request.model.regions.push(duplicate);
            window.__transactionAcceptance.injected++;
          }
          return post(request, ...rest);
        };
      }
    };
  });
  await page.goto((process.env.WAFERCAD_URL || 'http://127.0.0.1:4174') + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppReady(page);
  const project = projectForBenchmark({
    model: createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 }),
    section: { a: [-9, 0], b: [9, 0] },
  });
  await loadProject(page, project, 'transaction-acceptance');
  async function prepare(name) {
    await openFunctionPanel(page, 'process');
    await page.locator('[data-process-mode="add"]').click();
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('1');
    await page.locator('#layerName').fill(name);
  }
  for (const name of ['Safety A', 'Safety B']) {
    await prepare(name);
    await page.locator('#applyOperationBtn').click();
    await waitForStatus(page, new RegExp('Deposited ' + name));
  }
  await openFunctionPanel(page, 'snapshots');
  await page.locator('.process-history-row', { hasText: 'Safety A' }).click();
  await page.waitForFunction(() =>
    /Historical Step[\s\S]*Safety A/.test(
      document.querySelector('.snapshot-continuation-banner')?.textContent || '',
    ),
  );
  const before = await exportCurrentProject(page);
  await prepare('Rejected candidate');
  await page.evaluate(() => {
    window.__injectInvalidProcessCandidate = true;
  });
  await page.locator('#applyOperationBtn').click();
  await chooseConfirmation(page);
  await waitForStatus(page, /Process result rejected;/);
  const rejectionStatus = await page.locator('#statusText').textContent();
  assert.match(rejectionStatus, /previous structure and History were preserved/);
  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);
  assert.equal(
    await page.locator('#processTaskDialog').evaluate((element) => element.hidden),
    true,
  );
  await page.screenshot({ path: resolve(output, 'rejected.png') });
  const after = await exportCurrentProject(page);
  assert.deepEqual(after.model, before.model);
  assert.deepEqual(after.snapshotBranches, before.snapshotBranches);
  assert.deepEqual(after.snapshots, before.snapshots);
  const probe = await page.evaluate(() => window.__transactionAcceptance);
  assert.equal(probe.injected, 1);
  assert.ok(probe.messages.some((message) => message.stage === 'Validating process geometry…'));
  assert.ok(probe.messages.some((message) => message.rejected === true));
  await openFunctionPanel(page, 'snapshots');
  assert.equal(
    await page.locator('.history-variant').count(),
    before.snapshotBranches.branches.length,
  );
  await prepare('Recovery success');
  await page.locator('#applyOperationBtn').click();
  await chooseConfirmation(page);
  await waitForStatus(page, /Deposited Recovery success/);
  const recoveryStatus = await page.locator('#statusText').textContent();
  const recovered = await exportCurrentProject(page);
  assert.equal(recovered.snapshotBranches.nodes.length, before.snapshotBranches.nodes.length + 1);
  assert.equal(
    recovered.snapshotBranches.branches.length,
    before.snapshotBranches.branches.length + 1,
  );
  assert.ok(recovered.model.layers.some((layer) => layer.name === 'Recovery success'));
  const oldIds = new Set(before.snapshotBranches.nodes.map((node) => node.id));
  assert.deepEqual(
    recovered.snapshotBranches.nodes.filter((node) => oldIds.has(node.id)),
    before.snapshotBranches.nodes,
  );
  assert.deepEqual(errors, []);
  await openFunctionPanel(page, 'snapshots');
  await page.screenshot({ path: resolve(output, 'recovered.png') });
  const report = {
    rejectionStatus,
    recoveryStatus,
    injectedOnlyWorkerRequest: true,
    strictWorkerValidationObserved: true,
    modelPreserved: true,
    historyPreserved: true,
    bookmarksPreserved: true,
    noEmptyVariant: true,
    nextApplySucceeded: true,
    stepsBefore: before.snapshotBranches.nodes.length,
    stepsAfterRejection: after.snapshotBranches.nodes.length,
    stepsAfterRecovery: recovered.snapshotBranches.nodes.length,
    variantsBefore: before.snapshotBranches.branches.length,
    variantsAfterRejection: after.snapshotBranches.branches.length,
    variantsAfterRecovery: recovered.snapshotBranches.branches.length,
    pageErrors: errors,
  };
  await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2));
  console.log('TRANSACTION_UI_ACCEPTANCE', JSON.stringify(report));
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const browser = await chromium.launch({
    headless: process.env.WAFERCAD_HEADFUL !== '1',
    ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const context = await newUiContext(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    await runTransactionAcceptance(page, process.argv[2]);
  } finally {
    await browser.close();
  }
}
