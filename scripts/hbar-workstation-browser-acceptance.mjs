// Real-origin HBAR Workstation acceptance. This intentionally does not fall
// back to about:blank: a native ThreeView screenshot cannot establish Open,
// browser Worker, History or IndexedDB persistence correctness.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { readProjectFile } from '../site/project-io.js';

await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const fixturePath = resolve(
  'examples/projects/hbar-blesin-2024-candidate/hbar-blesin-2024-author-roi.wafercad',
);
const output = resolve('test-results/hbar-workstation');
const expected = await readProjectFile(new Blob([await readFile(fixturePath)]));
assert.equal(expected.processRecipe.steps.length, 11);
assert.equal(expected.snapshotBranches.nodes.length, expected.processRecipe.steps.length);
await mkdir(output, { recursive: true });

const report = {
  status: 'failed',
  source: fixturePath,
  projectName: expected.name,
  realOrigin: base,
  pageErrors: [],
  steps: [],
};
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
});
page.on('pageerror', (error) => report.pageErrors.push(error.message));
const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const panel = async (kind) => {
  await page.locator(`[data-action="domain:${kind}"]`).first().click();
  await waitForPaint(page);
};
const selectView = async (view) => {
  const dock = page.locator(`[data-action="dock:view:${view}"]:visible`).first();
  const legacy = page.locator(`[data-action="view:${view}"]:visible`).first();
  if (await dock.count()) {
    if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
  } else if (await legacy.count()) {
    await legacy.click();
  } else {
    throw new Error(`Cannot select actual ${view} view in Workstation`);
  }
  await waitForPaint(page);
  await page.locator(`#${view}Panel`).waitFor({ state: 'visible', timeout: 30000 });
};
const openFixture = async () => {
  await panel('project');
  await page.locator('#openProjectInput').setInputFiles(fixturePath);
  const confirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation?.snapshot().projectName === name,
    expected.name,
    { timeout: 120000 },
  );
  const state = await snapshot();
  assert.deepEqual(state.model, expected.model, 'File Open changed HBAR canonical model');
  assert.equal(state.layout.elements.length, expected.layout.elements.length);
  assert.equal(
    state.workflow.steps.length,
    expected.snapshotBranches.nodes.length,
    'HBAR Starting Wafer Step 0 or imported History steps were lost',
  );
  report.steps.push('file-open');
  return state;
};
const original = (owner) => {
  const copy = structuredClone(owner);
  for (const layer of copy.sourceModel.layers) delete layer.color;
  return copy;
};
// A fresh Rebuild Base/Worker replay increments bookkeeping revisions more
// often than loading the exported History. Compare every physical owner field,
// while asserting the owner revision pointers independently for each model.
const physicalOwner = (owner) => {
  const copy = original(owner);
  delete copy.modelRevision;
  delete copy.sourceModel.revision;
  return copy;
};
const ownerRevisionLag = (model) => {
  const owner = model.continuousEtchOwner;
  assert.equal(owner.sourceModel.revision, owner.modelRevision);
  assert.ok(
    model.revision >= owner.modelRevision,
    'Physical owner revision cannot be newer than the committed model',
  );
  return model.revision - owner.modelRevision;
};
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready === true, null, {
    timeout: 120000,
  });
  const opened = await openFixture();
  for (const view of ['main', 'mask', 'section', 'three']) {
    await selectView(view);
    if (view === 'three') {
      await page.waitForFunction(
        () => {
          const host = document.querySelector('#threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            host.dataset.renderPhase === 'complete' &&
            host.dataset.renderFidelity === 'exact-continuous-etch' &&
            Number(host.dataset.rendererExactFirstFrameMs) > 0 &&
            !host.dataset.rendererBuildFailure
          );
        },
        null,
        { timeout: 180000 },
      );
    } else {
      const canvas = page.locator(`#${view}Canvas`);
      await canvas.waitFor({ state: 'visible', timeout: 30000 });
      assert.ok((await canvas.evaluate((element) => element.width * element.height)) > 0);
    }
    await page.locator(`#${view}Panel`).screenshot({
      path: resolve(output, `hbar-${view}-original.png`),
      animations: 'disabled',
    });
    report.steps.push(`native-${view}`);
  }

  // Browser History, not the isolated SnapshotManager unit test: inspect a
  // historical Step, then return to real Variant HEAD without altering owner.
  await panel('history');
  const preRelease = page.locator('.history-step-wrap[data-step-id="hbar-stage-10"]');
  await preRelease.locator('.process-history-row.history-step-row').click();
  await page.waitForFunction(
    (revision) => {
      const current = window.WaferCadV2Workstation.snapshot();
      return !current.workflow.busy && current.model.processRevision === revision;
    },
    expected.snapshotBranches.nodes.find((node) => node.id === 'hbar-stage-10').state.model.processRevision,
    { timeout: 120000 },
  );
  assert.deepEqual(
    (await snapshot()).model,
    expected.snapshotBranches.nodes.find((node) => node.id === 'hbar-stage-10').state.model,
    'Browser History restoration altered pre-release physical state',
  );
  await page.locator('.snapshot-return-head').click();
  await page.waitForFunction(
    (revision) => {
      const current = window.WaferCadV2Workstation.snapshot();
      return !current.workflow.busy && current.model.processRevision === revision;
    },
    expected.model.processRevision,
    { timeout: 120000 },
  );
  assert.deepEqual((await snapshot()).model, opened.model);
  report.steps.push('browser-history-return-head');

  await panel('project');
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
    null,
    { timeout: 120000 },
  );
  const recoveryPoints = () =>
    page.evaluate(async () => {
      const storage = await import('/workspace-persistence.js');
      const entries = await storage.listWorkspaceRecoveryPoints();
      return Promise.all(
        entries.map(async (point) => ({
          ...point,
          project: await storage.loadWorkspaceRecoveryPoint(point.key),
        })),
      );
    });
  const stored = await page.evaluate(async () =>
    (await import('/workspace-persistence.js')).loadWorkspaceState(),
  );
  assert.deepEqual(stored.model, expected.model, 'IndexedDB saved physical owner differs');
  assert.equal(
    stored.snapshotBranches.nodes.length,
    expected.processRecipe.steps.length,
    'IndexedDB discarded HBAR History',
  );
  const hbarPoint = (await recoveryPoints()).find((point) => point.project?.name === expected.name);
  assert.ok(hbarPoint, 'Saving HBAR must create a restorable IndexedDB checkpoint');
  assert.deepEqual(hbarPoint.project.model, expected.model);

  // The second tab is allowed to inspect checkpoints, but not overwrite the
  // first tab's writer lease. The generic Recovery suite owns takeover/faults.
  const stale = await context.newPage();
  stale.on('pageerror', (error) => report.pageErrors.push(error.message));
  try {
    await stale.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await stale.waitForFunction(() => window.WaferCadV2Workstation?.ready === true, null, {
      timeout: 120000,
    });
    await stale.locator('[data-action="domain:project"]').first().click();
    assert.equal(
      (await stale.evaluate(() => window.WaferCadV2Workstation.snapshot())).workflow.writable,
      false,
      'Second HBAR tab must not take the active writer lease',
    );
    await stale.waitForFunction(
      (key) =>
        [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
          (option) => option.value === key,
        ),
      hbarPoint.key,
      { timeout: 30000 },
    );
    await stale.locator('#workspaceRecoverySelect').selectOption(hbarPoint.key);
    assert.equal(
      await stale.locator('#workspaceRestoreBtn').isDisabled(),
      true,
      'Read-only second tab cannot restore the HBAR checkpoint',
    );
  } finally {
    await stale.close();
  }
  report.steps.push('real-two-tab-readonly-lease');

  // Replace the in-memory model with an empty project and use the *actual*
  // Recovery UI to bring back the HBAR model, all eleven Steps and its layout.
  await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready === true, null, {
    timeout: 120000,
  });
  assert.notDeepEqual((await snapshot()).model, expected.model);
  await panel('project');
  await page.waitForFunction(
    (key) =>
      [...document.querySelectorAll('#workspaceRecoverySelect option')].some(
        (option) => option.value === key,
      ),
    hbarPoint.key,
    { timeout: 30000 },
  );
  await page.locator('#workspaceRecoverySelect').selectOption(hbarPoint.key);
  assert.equal(await page.locator('#workspaceRestoreBtn').isEnabled(), true);
  await page.locator('#workspaceRestoreBtn').click();
  await page
    .locator('.v2-confirm-dialog')
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      /Restored local recovery checkpoint|Recovery restore failed/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    null,
    { timeout: 120000 },
  );
  assert.match(
    await page.locator('[data-slot="status.message"]').innerText(),
    /Restored local recovery checkpoint/,
  );
  const recovered = await snapshot();
  assert.deepEqual(recovered.model, opened.model, 'Restored HBAR model differs from saved owner');
  assert.deepEqual(recovered.workflow.steps, opened.workflow.steps);
  assert.deepEqual(recovered.workflow.branches, opened.workflow.branches);
  assert.equal(recovered.layout.elements.length, expected.layout.elements.length);
  const recoveredStored = await page.evaluate(async () =>
    (await import('/workspace-persistence.js')).loadWorkspaceState(),
  );
  assert.deepEqual(recoveredStored.model, expected.model, 'Restored HBAR not persisted');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready === true, null, {
    timeout: 120000,
  });
  assert.deepEqual((await snapshot()).model, expected.model, 'Reload changed HBAR material owner');
  report.steps.push('browser-indexeddb-checkpoint-restore-reload');

  // Keep Replay isolated from the saved imported project: this tests the real
  // Recipe UI and Process Worker transaction path, not a Node worker adapter.
  await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready === true, null, {
    timeout: 120000,
  });
  await openFixture();
  await panel('process');
  await page.locator('[data-action="process-mode:recipe"]').click();
  assert.equal(await page.locator('.recipe-step-row').count(), 11);
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.evaluate(() => {
    window.__hbarWorkerCalls = 0;
    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (request, ...args) {
      if (request?.params && request?.model) window.__hbarWorkerCalls++;
      return Reflect.apply(originalPost, this, [request, ...args]);
    };
  });
  await page.locator('#recipeRunAllBtn').click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    const rebuild = dialog.getByRole('button', { name: /Clear history|Clear/i });
    if (await rebuild.count()) await rebuild.first().click();
    else throw new Error('Unexpected Recipe rebuild confirmation dialog');
  }
  await page.waitForFunction(
    () =>
      /^(Completed|Failed|Stopped):/.test(
        document.querySelector('#recipeRunSummary')?.textContent || '',
      ),
    null,
    { timeout: 900000 },
  );
  const summary = await page.locator('#recipeRunSummary').innerText();
  assert.match(summary, /^Completed: 11\/11/, 'Real HBAR Recipe did not complete: ' + summary);
  const replayed = await snapshot();
  assert.equal(
    ownerRevisionLag(replayed.model),
    ownerRevisionLag(expected.model),
    'Record-only History steps must not change the physical owner revision lag',
  );
  assert.deepEqual(
    physicalOwner(replayed.model.continuousEtchOwner),
    physicalOwner(expected.model.continuousEtchOwner),
    'Real browser Worker/Recipe differs from HBAR physical material owner',
  );
  assert.equal(await page.evaluate(() => window.__hbarWorkerCalls), 9);
  assert.equal(
    replayed.workflow.steps.length,
    expected.snapshotBranches.nodes.length,
    'Starting Wafer Step 0 or two Record steps were not committed to History',
  );
  assert.deepEqual(report.pageErrors, [], 'Unexpected real-origin browser page errors');
  report.steps.push('browser-recipe-11-steps-9-workers-2-records');
  report.status = 'pass';
  console.log('HBAR_WORKSTATION_BROWSER_ACCEPTANCE PASS', report.steps);
} catch (error) {
  report.error = error.stack || String(error);
  throw error;
} finally {
  await writeFile(
    resolve(output, 'hbar-workstation-acceptance.json'),
    JSON.stringify(report, null, 2),
  );
  await context.close();
  await browser.close();
}
