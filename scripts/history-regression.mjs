import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  chooseConfirmation,
  gotoWelcome,
  launchBrowser,
  openFunctionPanel,
  newUiContext,
} from './test-helpers/ui.mjs';

await loadGeometryKernel();
const { createModel } = await import('../site/model.js');

const welcomeProject = projectForBenchmark({
  model: createModel({
    shape: 'rect',
    width: 4321,
    height: 3210,
    thickness: 7,
  }),
  section: { a: [-1000, 0], b: [1000, 0] },
});

const snapshotExportFixtureBuffer = await readFile(
  new URL('../examples/projects/black-si-photodiode-acs-photonics-2023.wafercad', import.meta.url),
);
const snapshotExportFixture = JSON.parse(snapshotExportFixtureBuffer.toString('utf8'));
const snapshotExportNodeIds = new Set(
  (snapshotExportFixture.snapshotBranches?.nodes || []).map((node) => node.id),
);
const snapshotExportHistoryCount =
  (snapshotExportFixture.snapshotBranches?.nodes || []).length +
  (snapshotExportFixture.snapshots || []).filter(
    (record) => !record.historyNodeId || !snapshotExportNodeIds.has(record.historyNodeId),
  ).length;

const browser = await launchBrowser();

// Every successful process Step is a restorable History node. The restore state
// must also survive local autosave + full reload.
const historyRestoreContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
const historyRestorePage = await historyRestoreContext.newPage();
const historyRestoreErrors = [];
historyRestorePage.on('pageerror', (error) => historyRestoreErrors.push(error.message));
await gotoWelcome(historyRestorePage);
await historyRestorePage.locator('#welcomeProjectInput').setInputFiles({
  name: 'history-restore-base.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(welcomeProject)),
});
await historyRestorePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await historyRestorePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened history-restore-base.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyRestorePage, 'process');
await historyRestorePage.locator('[data-process-mode="add"]').click();
await historyRestorePage.locator('#operationArea').selectOption('full');
await historyRestorePage.locator('#growthMode').selectOption('direct');
await historyRestorePage.locator('#operationThickness').fill('0.05');
await historyRestorePage.locator('#layerName').fill('History A');
await historyRestorePage.locator('#applyOperationBtn').click();
await historyRestorePage.waitForFunction(
  () => /Deposited History A/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);
await historyRestorePage.locator('#layerName').fill('History B');
await historyRestorePage.locator('#applyOperationBtn').click();
await historyRestorePage.waitForFunction(
  () => /Deposited History B/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);
await historyRestorePage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await historyRestorePage.reload({ waitUntil: 'networkidle' });
await historyRestorePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Restored local workspace'),
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyRestorePage, 'snapshots');
assert.equal(await historyRestorePage.locator('#snapshotsTools > .tool-context').count(), 0);
assert.equal(await historyRestorePage.locator('.snapshot-branch-state').count(), 0);
assert.equal(await historyRestorePage.locator('.snapshot-branch-title strong').count(), 0);
assert.equal(await historyRestorePage.locator('#saveSnapshotBtn').count(), 0);
assert.equal(await historyRestorePage.locator('.history-tree-root').count(), 1);
assert.equal(await historyRestorePage.locator('.history-variant[data-variant-id="main"]').count(), 1);
const historySectionLabel = historyRestorePage
  .locator('#snapshotsTools > .workstation-section-label strong');
assert.equal((await historySectionLabel.textContent()).trim(), 'History');

const historyARow = historyRestorePage.locator('.process-history-row', { hasText: 'History A' });
const historyBRow = historyRestorePage.locator('.process-history-row', { hasText: 'History B' });
assert.equal(await historyARow.count(), 1);
assert.equal(await historyBRow.count(), 1);
assert.equal(await historyARow.getAttribute('role'), 'button');
assert.equal(await historyBRow.getAttribute('data-head'), 'true');

// History action popovers are exclusive: opening another Step menu closes the first.
const historyAPopoverStep = historyRestorePage.locator('.history-step-wrap', { hasText: 'History A' });
const historyBPopoverStep = historyRestorePage.locator('.history-step-wrap', { hasText: 'History B' });
await historyAPopoverStep.locator('.snapshot-more-trigger').click();
assert.equal(await historyAPopoverStep.locator('.snapshot-more-menu').getAttribute('open'), '');
// Trigger the second menu through its native summary activation without
// Playwright hit-testing. This exercises the same click/toggle path as the UI
// while avoiding geometry overlap between the two popovers in headless runs.
await historyBPopoverStep.locator('.snapshot-more-trigger').evaluate((summary) => summary.click());
await historyRestorePage.waitForFunction(() => {
  const steps = [...document.querySelectorAll('.history-step-wrap')];
  const historyA = steps.find((step) => /History A/.test(step.textContent || ''));
  const historyB = steps.find((step) => /History B/.test(step.textContent || ''));
  return !historyA?.querySelector('.snapshot-more-menu')?.open &&
    Boolean(historyB?.querySelector('.snapshot-more-menu')?.open);
});
assert.equal(await historyAPopoverStep.locator('.snapshot-more-menu').getAttribute('open'), null);
assert.equal(await historyBPopoverStep.locator('.snapshot-more-menu').getAttribute('open'), '');
await historyBPopoverStep.locator('.snapshot-more-trigger').click();

await historyARow.click();
await historyRestorePage.waitForFunction(
  () =>
    /Historical Step[\s\S]*History A/.test(
      document.querySelector('.snapshot-continuation-banner')?.textContent || '',
    ),
  null,
  { timeout: 5000 },
);
assert.equal(
  await historyRestorePage.locator('#workspaceRecoverySelect option').evaluateAll((options) =>
    options.some((option) => /pre-process-history-restore/.test(option.textContent || '')),
  ),
  false,
);
assert.equal(await historyRestorePage.locator('#undoBtn').isDisabled(), true);
assert.equal(await historyRestorePage.locator('#redoBtn').isDisabled(), true);
assert.match(
  await historyRestorePage.locator('.snapshot-continuation-banner').textContent(),
  /Historical Step[\s\S]*History A/,
);
assert.ok(
  await historyRestorePage
    .locator('#layerLegend .legend-name')
    .evaluateAll((inputs) => inputs.some((input) => input.value === 'History A')),
);
assert.equal(
  await historyRestorePage
    .locator('#layerLegend .legend-name')
    .evaluateAll((inputs) => inputs.some((input) => input.value === 'History B')),
  false,
);
await historyRestorePage.evaluate(() => {
  const input = document.getElementById('maskOpacityRange');
  input.value = '0.4';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await historyRestorePage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await historyRestorePage.reload({ waitUntil: 'networkidle' });
await historyRestorePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Restored local workspace'),
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyRestorePage, 'snapshots');
await historyRestorePage.locator('.snapshot-continuation-banner').waitFor({ state: 'visible' });
assert.equal(Number(await historyRestorePage.locator('#maskOpacityRange').inputValue()), 0.4);
assert.ok(
  await historyRestorePage
    .locator('#layerLegend .legend-name')
    .evaluateAll((inputs) => inputs.some((input) => input.value === 'History A')),
);
assert.equal(
  await historyRestorePage
    .locator('#layerLegend .legend-name')
    .evaluateAll((inputs) => inputs.some((input) => input.value === 'History B')),
  false,
);
await historyRestorePage.locator('.snapshot-return-head').click();
await historyRestorePage.waitForFunction(
  () => /Returned to "Main" HEAD/.test(document.getElementById('statusText')?.textContent || ''),
);
// Navigation-only inspection changes (camera/ROI/Section/zoom) no longer count
// as historical process edits, so returning to HEAD must not create a recovery
// checkpoint solely for those view changes.
assert.equal(
  await historyRestorePage.locator('#workspaceRecoverySelect option').evaluateAll((options) =>
    options.some((option) => /pre-snapshot-return-head/.test(option.textContent || '')),
  ),
  false,
);
assert.ok(
  await historyRestorePage
    .locator('#layerLegend .legend-name')
    .evaluateAll((inputs) => inputs.some((input) => input.value === 'History B')),
);

// Branch directly from a Step: the Variant must appear at that Step in the tree.
await openFunctionPanel(historyRestorePage, 'snapshots');
const historyAStep = historyRestorePage.locator('.history-step-wrap', { hasText: 'History A' });
await historyAStep.locator('.snapshot-more-trigger').click();
await historyAStep
  .locator('.snapshot-more-popover button', { hasText: 'Variant from here' })
  .click();
await historyRestorePage.waitForFunction(
  () => /Created Variant "Variant 1"/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.equal(await historyRestorePage.locator('.history-variant').count(), 2);
const childVariant = historyRestorePage.locator('.history-variant:not([data-variant-id="main"])').first();
assert.equal(
  await childVariant.evaluate((section) =>
    Boolean(
      section.previousElementSibling?.classList.contains('history-step-wrap') &&
        /History A/.test(section.previousElementSibling.textContent || ''),
    ),
  ),
  true,
);

// Rename through the Variant name itself so this smoke does not couple
// Welcome integration to compact History overflow-menu presentation.
const renameTrigger = childVariant.locator('.history-variant-rename-trigger'),
  variantNameButton = childVariant.locator(':scope > .history-variant-head .history-variant-name');
if (await renameTrigger.isVisible()) await renameTrigger.click();
else await variantNameButton.dblclick();
const variantEditor = childVariant.locator('.history-variant-editor:not([hidden])');
await variantEditor.locator('input').fill('Detector path');
await variantEditor.locator('button').first().click();
assert.equal(await historyRestorePage.locator('#snapshotBranchSelect').count(), 0);
assert.equal(
  (await historyRestorePage.locator('.history-variant[data-active="true"] .history-variant-name').textContent()).trim(),
  'Detector path',
);
assert.equal(
  (await historyRestorePage.locator('.history-variant[data-active="true"] .history-variant-name').textContent()).trim(),
  'Detector path',
);

// Add a process Step on the child Variant.
await openFunctionPanel(historyRestorePage, 'process');
await historyRestorePage.locator('[data-process-mode="add"]').click();
await historyRestorePage.locator('#operationArea').selectOption('full');
await historyRestorePage.locator('#growthMode').selectOption('direct');
await historyRestorePage.locator('#operationThickness').fill('0.05');
await historyRestorePage.locator('#layerName').fill('Variant C');
await historyRestorePage.locator('#applyOperationBtn').click();
await historyRestorePage.waitForFunction(
  () => /Deposited Variant C/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);

// Bookmark annotates a Step but does not create another restore lineage.
await openFunctionPanel(historyRestorePage, 'snapshots');
const variantCStep = historyRestorePage.locator('.history-step-wrap', { hasText: 'Variant C' });
await variantCStep.locator('.snapshot-more-trigger').click();
await variantCStep
  .locator('.snapshot-more-popover button', { hasText: 'Add bookmark' })
  .click();
assert.equal(await variantCStep.locator('.history-bookmarks-group').count(), 1);
assert.equal(await variantCStep.locator('.history-bookmarks-group').getAttribute('open'), null);
assert.equal(await variantCStep.locator('.history-bookmark-row').count(), 1);
assert.equal(
  Number(await historyRestorePage.locator('#snapshotCount').textContent()),
  3,
);

// Autosave/reload preserves the Step tree, Variant name, origin, and bookmark.
await historyRestorePage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await historyRestorePage.reload({ waitUntil: 'networkidle' });
await historyRestorePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Restored local workspace'),
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyRestorePage, 'snapshots');
assert.equal(await historyRestorePage.locator('#snapshotBranchSelect').count(), 0);
assert.equal(
  (await historyRestorePage.locator('.history-variant[data-active="true"] .history-variant-name').textContent()).trim(),
  'Detector path',
);
assert.equal(await historyRestorePage.locator('.history-variant').count(), 2);
const reloadedChild = historyRestorePage.locator('.history-variant:not([data-variant-id="main"])').first();
assert.equal(
  (await reloadedChild.locator('.history-variant-name').textContent()).trim(),
  'Detector path',
);
assert.match(await reloadedChild.textContent(), /Variant C/);
assert.equal(await reloadedChild.locator('.history-bookmarks-group').count(), 1);
assert.equal(await reloadedChild.locator('.history-bookmarks-group').getAttribute('open'), null);
assert.equal(await reloadedChild.locator('.history-bookmark-row').count(), 1);

const historyTreeGeometry = await historyRestorePage.evaluate(() => {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  };
  return {
    viewportWidth: innerWidth,
    compact: document.documentElement.classList.contains('workstation-compact-ui'),
    panel: box('#toolPanel.workstation-tool-flyout'),
    mainVariant: box('.history-variant[data-variant-id="main"]'),
    firstStep: box('.history-step-row'),
    childVariant: box('.history-variant:not([data-variant-id="main"])'),
    banner: box('.snapshot-continuation-banner'),
    returnButton: box('.snapshot-return-head'),
  };
});
assert.equal(historyTreeGeometry.viewportWidth, 1100);
assert.equal(historyTreeGeometry.compact, false);
assert.ok(historyTreeGeometry.panel.width >= 295, JSON.stringify(historyTreeGeometry));
assert.ok(historyTreeGeometry.panel.left >= 40, JSON.stringify(historyTreeGeometry));
if (historyTreeGeometry.banner && historyTreeGeometry.returnButton) {
  assert.ok(
    historyTreeGeometry.returnButton.width >= 90,
    JSON.stringify(historyTreeGeometry),
  );
  assert.ok(
    historyTreeGeometry.banner.width >= historyTreeGeometry.returnButton.width,
    JSON.stringify(historyTreeGeometry),
  );
}
for (const item of [
  historyTreeGeometry.mainVariant,
  historyTreeGeometry.firstStep,
  historyTreeGeometry.childVariant,
]) {
  assert.ok(item);
  assert.ok(item.left >= historyTreeGeometry.panel.left + 8, JSON.stringify(historyTreeGeometry));
  assert.ok(item.right <= historyTreeGeometry.panel.right - 6, JSON.stringify(historyTreeGeometry));
}

await mkdir(new URL('../test-results/product-review/', import.meta.url), { recursive: true });
await historyRestorePage.screenshot({
  path: new URL(
    '../test-results/product-review/history-variant-tree-populated.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});

assert.deepEqual(historyRestoreErrors, []);
await historyRestoreContext.close();

// Historical Step editing enters the Process editor immediately. The downstream
// strategy is chosen only when the edited Step is actually saved.
const historyRecomputeContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
const historyRecomputePage = await historyRecomputeContext.newPage();
const historyRecomputeErrors = [];
historyRecomputePage.on('pageerror', (error) => historyRecomputeErrors.push(error.message));
await gotoWelcome(historyRecomputePage);
await historyRecomputePage.locator('#welcomeProjectInput').setInputFiles({
  name: 'history-recompute-base.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(welcomeProject)),
});
await historyRecomputePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await historyRecomputePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened history-recompute-base.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyRecomputePage, 'process');
await historyRecomputePage.locator('[data-process-mode="add"]').click();
await historyRecomputePage.locator('#operationArea').selectOption('full');
await historyRecomputePage.locator('#growthMode').selectOption('direct');
await historyRecomputePage.locator('#operationThickness').fill('0.05');
for (const name of ['Replay A', 'Replay B', 'Replay C']) {
  await historyRecomputePage.locator('#layerName').fill(name);
  await historyRecomputePage.locator('#applyOperationBtn').click();
  await historyRecomputePage.waitForFunction(
    (expected) =>
      (document.getElementById('statusText')?.textContent || '').includes(`Deposited ${expected}`),
    name,
    { timeout: 30000 },
  );
}

await openFunctionPanel(historyRecomputePage, 'snapshots');
const replayBStep = historyRecomputePage.locator('.history-step-wrap', { hasText: 'Replay B' }).first();
await replayBStep.locator('.snapshot-more-trigger').click();
await replayBStep.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
await historyRecomputePage.waitForFunction(
  () => /Editing "Deposit Replay B/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 10000 },
);
assert.equal(await historyRecomputePage.locator('#confirmationDialogOverlay:not([hidden])').count(), 0);
await historyRecomputePage.locator('.snapshot-continuation-banner[data-editing-step="true"]').waitFor();
assert.equal(await historyRecomputePage.locator('#layerName').inputValue(), 'Replay B');
assert.equal(Number(await historyRecomputePage.locator('#operationThickness').inputValue()), 0.05);
assert.equal((await historyRecomputePage.locator('#applyOperationBtn').textContent()).trim(), 'Save edited Step');

await historyRecomputePage.locator('#layerName').fill('Replay B edited');
await historyRecomputePage.locator('#operationThickness').fill('0.08');
await historyRecomputePage.locator('#applyOperationBtn').click();
await historyRecomputePage.locator('#confirmationDialogOverlay').waitFor({ state: 'visible' });
for (const action of ['replace-discard', 'replace-replay', 'branch-edit']) {
  assert.equal(
    await historyRecomputePage
      .locator(`#confirmationDialogActions [data-dialog-action="${action}"]`)
      .count(),
    1,
  );
}
await chooseConfirmation(historyRecomputePage, 'replace-replay');
await historyRecomputePage.waitForFunction(
  () => /Replayed 1 later Step in Variant "Main"/.test(
    document.getElementById('statusText')?.textContent || '',
  ),
  null,
  { timeout: 30000 },
);

await openFunctionPanel(historyRecomputePage, 'snapshots');
assert.equal(await historyRecomputePage.locator('.history-variant').count(), 1);
const recomputeMain = historyRecomputePage.locator('.history-variant[data-variant-id="main"]');
const mainOwnSteps = recomputeMain.locator(':scope > .history-variant-body > .history-step-wrap');
assert.match(
  await mainOwnSteps.allTextContents().then((items) => items.join(' ')),
  /Replay B edited/,
);
assert.match(await mainOwnSteps.allTextContents().then((items) => items.join(' ')), /Replay C/);
assert.equal(
  await historyRecomputePage.locator('#workspaceRecoverySelect option').evaluateAll((options) =>
    options.some((option) => /pre-history-step-edit/.test(option.textContent || '')),
  ),
  true,
);
assert.deepEqual(historyRecomputeErrors, []);
await historyRecomputeContext.close();

// Replay is transactional: if a later Step fails after earlier replay Steps
// succeeded, the original Variant and geometry are restored automatically.
const historyReplayFailureContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
const historyReplayFailurePage = await historyReplayFailureContext.newPage();
const historyReplayFailureErrors = [];
historyReplayFailurePage.on('pageerror', (error) => historyReplayFailureErrors.push(error.message));
await gotoWelcome(historyReplayFailurePage);
await historyReplayFailurePage.locator('#welcomeProjectInput').setInputFiles({
  name: 'history-replay-failure-base.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(welcomeProject)),
});
await historyReplayFailurePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await historyReplayFailurePage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened history-replay-failure-base.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel(historyReplayFailurePage, 'process');
await historyReplayFailurePage.locator('[data-process-mode="add"]').click();
await historyReplayFailurePage.locator('#operationArea').selectOption('full');
await historyReplayFailurePage.locator('#growthMode').selectOption('direct');
await historyReplayFailurePage.locator('#operationThickness').fill('0.05');
for (const name of ['Fail Seed', 'Fail A', 'Fail B', 'Fail C', 'Fail D', 'Fail E']) {
  await historyReplayFailurePage.locator('#layerName').fill(name);
  await historyReplayFailurePage.locator('#applyOperationBtn').click();
  await historyReplayFailurePage.waitForFunction(
    (expected) =>
      (document.getElementById('statusText')?.textContent || '').includes(`Deposited ${expected}`),
    name,
    { timeout: 30000 },
  );
}

await openFunctionPanel(historyReplayFailurePage, 'snapshots');
const failAStep = historyReplayFailurePage.locator('.history-step-wrap', { hasText: 'Fail A' }).first();
await failAStep.locator('.snapshot-more-trigger').click();
await failAStep.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
await historyReplayFailurePage.waitForFunction(
  () => /Editing "Deposit Fail A/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 10000 },
);
await historyReplayFailurePage.locator('#layerName').fill('Fail A edited');

// The edited Step itself is the first process worker after this point. Let two
// downstream replay workers finish, then fail the third downstream worker.
await historyReplayFailurePage.evaluate(() => {
  const NativeWorker = globalThis.Worker;
  let processWorkerCount = 0;
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(Target, args) {
      const url = String(args[0] || '');
      if (url.includes('process-worker.js')) {
        processWorkerCount += 1;
        if (processWorkerCount === 4) {
          throw new Error('synthetic replay worker failure');
        }
      }
      return Reflect.construct(Target, args);
    },
  });
});

await historyReplayFailurePage.locator('#applyOperationBtn').click();
await historyReplayFailurePage.locator('#confirmationDialogOverlay').waitFor({ state: 'visible' });
await chooseConfirmation(historyReplayFailurePage, 'replace-replay');
await historyReplayFailurePage.waitForFunction(
  () => /Replay stopped after 2\/4 later Steps/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 30000 },
);
assert.match(
  await historyReplayFailurePage.locator('#statusText').textContent(),
  /Original Variant restored/,
);
await openFunctionPanel(historyReplayFailurePage, 'snapshots');
const failedReplayText = await historyReplayFailurePage
  .locator('.history-variant[data-variant-id="main"]')
  .textContent();
for (const name of ['Fail A', 'Fail B', 'Fail C', 'Fail D', 'Fail E']) {
  assert.match(failedReplayText, new RegExp(name));
}
assert.doesNotMatch(failedReplayText, /Fail A edited/);
assert.deepEqual(historyReplayFailureErrors, []);
await historyReplayFailureContext.close();

// Project delivery gate: use a fresh browser context so accumulated download state
// from the long smoke scenario cannot mask whether one user-requested export works.
const projectDownloadContext = await newUiContext(browser, {
  viewport: { width: 1100, height: 760 },
  acceptDownloads: true,
});
const projectDownloadPage = await projectDownloadContext.newPage();
const projectDownloadErrors = [];
projectDownloadPage.on('pageerror', (error) => projectDownloadErrors.push(error.message));
await gotoWelcome(projectDownloadPage);
await projectDownloadPage.locator('#welcomeProjectInput').setInputFiles({
  name: 'snapshot-export-fixture.wafercad',
  mimeType: 'application/json',
  buffer: snapshotExportFixtureBuffer,
});
await projectDownloadPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await projectDownloadPage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened snapshot-export-fixture.wafercad.',
  null,
  { timeout: 30000 },
);
assert.equal(
  Number(await projectDownloadPage.locator('#snapshotCount').textContent()),
  snapshotExportHistoryCount,
);
await openFunctionPanel(projectDownloadPage, 'snapshots');
assert.equal(
  await projectDownloadPage.locator('.history-legacy-bookmarks').count(),
  snapshotExportFixture.snapshots.length ? 1 : 0,
);
await openFunctionPanel(projectDownloadPage, 'project');
await projectDownloadPage.locator('#projectNameInput').fill('Snapshot export check');
const snapshotExportPromise = projectDownloadPage.waitForEvent('download', { timeout: 30000 });
await projectDownloadPage.locator('#exportProjectBtn').click();
const snapshotExport = await snapshotExportPromise;
assert.equal(snapshotExport.suggestedFilename(), 'Snapshot export check.wafercad');
assert.match(
  await projectDownloadPage.locator('#statusText').textContent(),
  /Download requested/,
);
const snapshotExportPath = await snapshotExport.path();
assert.ok(snapshotExportPath);
const snapshotExportedProject = JSON.parse(await readFile(snapshotExportPath, 'utf8'));
assert.equal(snapshotExportedProject.format, 'WaferCAD-vector');
assert.equal(snapshotExportedProject.snapshots.length, snapshotExportFixture.snapshots.length);
assert.deepEqual(projectDownloadErrors, []);
await projectDownloadContext.close();

await browser.close();
console.log('WaferCAD History regression: OK');
