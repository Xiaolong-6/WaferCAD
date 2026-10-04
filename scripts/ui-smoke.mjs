import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation, createModel, modelBoundsZ } = await import('../site/model.js');
const { circleMulti, pointInMulti } = await import('../site/vector-geometry.js');

const welcomeLayoutBuffer = await readFile(
  new URL('../site/samples/klayout/oas-rectangles.oas', import.meta.url),
);
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
const welcomeProject = projectForBenchmark({
  model: createModel({
    shape: 'rect',
    width: 4321,
    height: 3210,
    thickness: 7,
  }),
  section: { a: [-1000, 0], b: [1000, 0] },
});

const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';

async function processDiagnostics(page) {
  return Promise.race([
    page
      .evaluate(() => ({
        status: document.getElementById('statusText')?.textContent || '',
        stage: document.getElementById('processTaskStage')?.textContent || '',
        taskHidden: Boolean(document.getElementById('processTaskDialog')?.hidden),
        applyDisabled: Boolean(document.getElementById('applyOperationBtn')?.disabled),
        roughRebuilds: document.querySelector('#threeHost canvas')?.dataset?.roughRebuildCount || '',
        roughZones: document.querySelector('#threeHost canvas')?.dataset?.roughLodZones || '',
        operationType: document.getElementById('operationType')?.value || '',
        growthMode: document.getElementById('growthMode')?.value || '',
        workerGrowth: globalThis.__lastProcessWorkerPayload?.params?.growth || '',
        workerType: globalThis.__lastProcessWorkerPayload?.params?.type || '',
      }))
      .catch((error) => ({ evaluateError: error.message })),
    new Promise((resolve) => setTimeout(() => resolve({ pageUnresponsive: true }), 2000)),
  ]);
}

async function chooseConfirmation(page, action = 'confirm') {
  const overlay = page.locator('#confirmationDialogOverlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  await overlay.locator(`[data-dialog-action="${action}"]`).click();
}

const FUNCTION_SECTION_IDS = {
  project: 'settingsTools',
  base: 'baseTools',
  mask: 'maskTools',
  process: 'operationTools',
  snapshots: 'snapshotsTools',
};

async function openFunctionPanel(page, name, clickOptions = {}) {
  const button = page.locator(`.workstation-rail-button[data-tool="${name}"]`);
  await button.waitFor({ state: 'visible', timeout: clickOptions.timeout || 5000 });
  const panel = page.locator('#toolPanel.workstation-tool-flyout');
  const isOpen = await panel.evaluate((element) => element.classList.contains('open'));
  const isActive = await button.evaluate((element) => element.classList.contains('active'));
  if (!isOpen || !isActive) await button.click(clickOptions);
  await page.locator(`#${FUNCTION_SECTION_IDS[name]}:not([hidden])`).waitFor();
  await page.waitForFunction(
    () => {
      const panel = document.getElementById('toolPanel');
      if (!panel?.classList.contains('open')) return false;
      const rect = panel.getBoundingClientRect();
      return rect.left >= 40 && rect.right > rect.left;
    },
    null,
    { timeout: clickOptions.timeout || 5000 },
  );
  await page.evaluate((sectionName) => {
    const scroller = document.querySelector('#toolPanel .tool-tab-content');
    const section = document.querySelector(`[data-workstation-section="${sectionName}"]`);
    if (scroller && section) scroller.scrollTop = Math.max(0, section.offsetTop - 6);
  }, name);
}

async function closeFunctionPanel(page) {
  const panel = page.locator('#toolPanel.workstation-tool-flyout');
  if (await panel.evaluate((element) => element.classList.contains('open'))) {
    await page.locator('.workstation-tool-close').click();
    await page.waitForFunction(
      () => !document.getElementById('toolPanel')?.classList.contains('open'),
    );
  }
}

async function canvasInkFraction(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const ctx = canvas.getContext('2d'),
      { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0,
      samples = 0;
    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3],
        r = data[index],
        g = data[index + 1],
        b = data[index + 2];
      samples += 1;
      if (alpha > 12 && (r < 245 || g < 245 || b < 245)) ink += 1;
    }
    return samples ? ink / samples : 0;
  });
}
const launchOptions = {
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
};
const browser = await chromium.launch(launchOptions);

// Startup must never expose the legacy/raw workspace while the workstation
// stylesheet or DOM transformation is still pending.
const bootPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const bootErrors = [];
let releaseWorkstationCss;
let workstationCssSeen;
let appRequestedBeforeCss = false;
const workstationCssGate = new Promise((resolve) => {
  releaseWorkstationCss = resolve;
});
const workstationCssRequest = new Promise((resolve) => {
  workstationCssSeen = resolve;
});
bootPage.on('pageerror', (error) => bootErrors.push(error.message));
await bootPage.route('**/workstation.css*', async (route) => {
  workstationCssSeen();
  await workstationCssGate;
  await route.continue();
});
await bootPage.route('**/app.js*', async (route) => {
  appRequestedBeforeCss = true;
  await route.continue();
});
const bootNavigation = bootPage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await workstationCssRequest;
assert.equal(
  await bootPage.evaluate(() => document.documentElement.classList.contains('workstation-boot')),
  true,
);
assert.equal(
  await bootPage.locator('.app-shell').evaluate((element) => getComputedStyle(element).visibility),
  'hidden',
);
assert.equal(await bootPage.locator('#workstationBootScreen').isVisible(), true);
assert.equal(await bootPage.locator('.workstation-rail').count(), 0);
assert.equal(appRequestedBeforeCss, false);

releaseWorkstationCss();
await bootNavigation;
await bootPage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 30000 },
);
assert.equal(
  await bootPage.evaluate(() => document.documentElement.classList.contains('workstation-boot')),
  false,
);
assert.equal(
  await bootPage.locator('.app-shell').evaluate((element) => getComputedStyle(element).visibility),
  'visible',
);
assert.equal(await bootPage.locator('.workstation-rail').isVisible(), true);
assert.equal(await bootPage.locator('#workstationBootScreen').isVisible(), false);
assert.deepEqual(bootErrors, []);
await bootPage.close();

const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => { errors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
assert.equal(await page.locator('#welcomeScreen').isVisible(), true);
assert.equal(await page.locator('.app-shell').count(), 0);
assert.match(
  await page.locator('#welcomeScreen').textContent(),
  /Mask[\s\S]*Process[\s\S]*Inspect/,
);

const photodetectorCard = page.locator(
  '.welcome-example-card[data-example-id="photodetector-literature"]',
);
assert.equal((await photodetectorCard.locator('h3').textContent()).trim(), 'Photodetectors with nanopatterns');
assert.equal(await photodetectorCard.locator('.welcome-example-sources a').count(), 2);
assert.deepEqual(
  await photodetectorCard.locator('.welcome-example-view-tab').allTextContents(),
  ['Main', 'Mask', '3D', 'Section'],
);
const previewFrame = photodetectorCard.locator('.welcome-example-project-frame');
await previewFrame.waitFor({ state: 'visible', timeout: 30000 });
const preview = page.frameLocator(
  '.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-project-frame',
);
await preview.locator('html.welcome-project-preview[data-preview-view="main"]').waitFor({
  state: 'attached',
  timeout: 30000,
});
await photodetectorCard
  .locator('.welcome-example-view-tab[data-preview-view="section"]')
  .click();
await preview.locator('html.welcome-project-preview[data-preview-view="section"]').waitFor({
  state: 'attached',
  timeout: 10000,
});
assert.equal(await preview.locator('#sectionPanel').isVisible(), true);

await page.locator('#welcomeEmptyBtn').click();
await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await page.waitForLoadState('networkidle');
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);
assert.equal(await page.locator('#welcomeScreen').count(), 0);
assert.equal(await page.locator('.app-shell').count(), 1);

// Wide workspaces default to Overview so the three primary views are visible
// immediately. Narrow/compact workspaces still start in focused Main.
assert.equal(await page.locator('#mainPanel').isVisible(), true);
assert.equal(await page.locator('#maskPanel').isVisible(), true);
assert.equal(await page.locator('#threePanel').isVisible(), true);
assert.equal(
  await page.locator('.workstation-view-stage').getAttribute('data-view-mode'),
  'overview',
);
await page.locator('#threePanel').waitFor({ state: 'visible' });

// Navigation semantics are checked in isolated pages so Back/Reload cannot
// perturb the long-lived editor page used by the rest of this smoke suite.
const navigationPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const navigationErrors = [];
navigationPage.on('pageerror', (error) => navigationErrors.push(error.message));
await navigationPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await navigationPage.locator('#welcomeEmptyBtn').click();
await navigationPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await navigationPage.waitForLoadState('networkidle');
await navigationPage.goBack({ waitUntil: 'networkidle' });
assert.equal(await navigationPage.locator('#welcomeScreen').isVisible(), true);
assert.equal(await navigationPage.locator('.app-shell').count(), 0);
assert.deepEqual(navigationErrors, []);
await navigationPage.close();

// Bundled example families must load through the same validated project path as
// user-selected .wafercad files, including their restorable Variant tree.
const familyExamplePage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const familyExampleErrors = [];
familyExamplePage.on('pageerror', (error) => familyExampleErrors.push(error.message));
await familyExamplePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await familyExamplePage
  .locator('.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-open')
  .click();
await familyExamplePage.waitForURL(/start=example.*example=photodetector-literature/, {
  timeout: 30000,
});
await familyExamplePage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened photodetector-literature-examples.wafercad.',
  null,
  { timeout: 30000 },
);
await openFunctionPanel(familyExamplePage, 'snapshots');
assert.equal(await familyExamplePage.locator('.history-variant').count(), 7);
assert.equal(
  await familyExamplePage
    .locator('.history-variant[data-variant-id="black-si-fig1a-final"]')
    .getAttribute('data-active'),
  'true',
);
assert.equal(
  await familyExamplePage
    .locator('.history-variant[data-variant-id="ge-fig15-a"]')
    .count(),
  1,
);
assert.deepEqual(familyExampleErrors, []);
await familyExamplePage.close();

// Legacy autosaves must migrate before validation blocks the recovery checkpoint.
const legacyContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const legacyPage = await legacyContext.newPage();
const legacyErrors = [];
legacyPage.on('pageerror', (error) => legacyErrors.push(error.message));
const legacyWorkspace = structuredClone(welcomeProject);
legacyWorkspace.version = 1;
legacyWorkspace.name = 'Legacy v1 workspace';
legacyWorkspace.model.units.z = 'relative';
delete legacyWorkspace.roiAnchor;
delete legacyWorkspace.display.threeOpacity;
delete legacyWorkspace.display.threeShowBorders;
await legacyPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await legacyPage.evaluate(
  (project) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('wafercad-workspace-v1', 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('workspace')) {
          database.createObjectStore('workspace', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('workspace-metadata')) {
          database.createObjectStore('workspace-metadata', { keyPath: 'key' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result,
          transaction = database.transaction(['workspace', 'workspace-metadata'], 'readwrite');
        transaction.objectStore('workspace').put({ key: 'current', project });
        transaction.objectStore('workspace-metadata').put({
          key: 'current',
          updatedAt: new Date().toISOString(),
          appCommit: 'legacy-fixture',
          projectVersion: 1,
          revision: Number(project.model?.revision) || 0,
          reason: '',
        });
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    }),
  legacyWorkspace,
);
await legacyPage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await legacyPage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Restored local workspace'),
  null,
  { timeout: 30000 },
);
assert.equal(Number(await legacyPage.locator('#baseWidth').inputValue()), 4321);
await legacyPage.waitForFunction(
  () =>
    [...(document.getElementById('workspaceRecoverySelect')?.options || [])].some((option) =>
      /pre-migration-v1/.test(option.textContent || ''),
    ),
  null,
  { timeout: 10000 },
);
assert.deepEqual(legacyErrors, []);
await legacyContext.close();

// A stalled Three.js CDN must never block the editor shell. The old top-level
// await implementation left Main/Mask blank and all tool tabs unbound here.
const blockedThreePage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const blockedThreeErrors = [];
blockedThreePage.on('pageerror', (error) => blockedThreeErrors.push(error.message));
await blockedThreePage.route('https://cdn.jsdelivr.net/**', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 12000));
  await route.abort();
});
await blockedThreePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await blockedThreePage.locator('#welcomeEmptyBtn').click();
await blockedThreePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await blockedThreePage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 4000 },
);
await openFunctionPanel(blockedThreePage, 'process', { timeout: 2000 });
await blockedThreePage.locator('#operationTools:not([hidden])').waitFor({ timeout: 2000 });
assert.ok((await canvasInkFraction(blockedThreePage, '#mainCanvas')) > 0.01);
assert.deepEqual(blockedThreeErrors, []);
await blockedThreePage.close();

// Every successful process Step is a restorable History node. The restore state
// must also survive local autosave + full reload.
const historyRestoreContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const historyRestorePage = await historyRestoreContext.newPage();
const historyRestoreErrors = [];
historyRestorePage.on('pageerror', (error) => historyRestoreErrors.push(error.message));
await historyRestorePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
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
await historyARow.click();
await historyRestorePage.waitForFunction(
  () =>
    /Viewing Step .*History A/.test(
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
  /Viewing Step .*History A/,
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

// Variant rename is a first-class inline action, not hidden in the overflow menu.
await childVariant.locator('.history-variant-rename-trigger').click();
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
  };
});
assert.equal(historyTreeGeometry.viewportWidth, 1100);
assert.equal(historyTreeGeometry.compact, false);
assert.ok(historyTreeGeometry.panel.width >= 295, JSON.stringify(historyTreeGeometry));
assert.ok(historyTreeGeometry.panel.left >= 40, JSON.stringify(historyTreeGeometry));
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

const refreshPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const refreshErrors = [];
refreshPage.on('pageerror', (error) => refreshErrors.push(error.message));
await refreshPage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await refreshPage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 30000 },
);
await refreshPage.reload({ waitUntil: 'networkidle' });
await refreshPage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 30000 },
);
assert.equal(await refreshPage.locator('#welcomeScreen').count(), 0);
assert.equal(await refreshPage.locator('.app-shell').count(), 1);
assert.deepEqual(refreshErrors, []);
await refreshPage.close();

// Welcome-page layout import must survive the IndexedDB handoff and open in the workspace.
const layoutHandoffPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const layoutHandoffErrors = [];
layoutHandoffPage.on('pageerror', (error) => layoutHandoffErrors.push(error.message));
await layoutHandoffPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await layoutHandoffPage.locator('#welcomeLayoutInput').setInputFiles({
  name: 'welcome-layout.oas',
  mimeType: 'application/octet-stream',
  buffer: welcomeLayoutBuffer,
});
await layoutHandoffPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await layoutHandoffPage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened welcome-layout.oas.',
  null,
  { timeout: 30000 },
);
assert.ok(await layoutHandoffPage.locator('#maskLayerList .layer-row').count());
assert.deepEqual(layoutHandoffErrors, []);
await layoutHandoffPage.close();

// Welcome-page project opening uses the same staged-file path and restores physical geometry.
const projectHandoffPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const projectHandoffErrors = [];
projectHandoffPage.on('pageerror', (error) => projectHandoffErrors.push(error.message));
await projectHandoffPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await projectHandoffPage.locator('#welcomeProjectInput').setInputFiles({
  name: 'welcome-project.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(welcomeProject)),
});
await projectHandoffPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await projectHandoffPage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened welcome-project.wafercad.',
  null,
  { timeout: 30000 },
);
assert.equal(Number(await projectHandoffPage.locator('#baseWidth').inputValue()), 4321);
assert.equal(Number(await projectHandoffPage.locator('#baseHeight').inputValue()), 3210);
assert.equal(Number(await projectHandoffPage.locator('#baseThickness').inputValue()), 7);
assert.deepEqual(projectHandoffErrors, []);
await projectHandoffPage.close();

// A Welcome explicit start must checkpoint an existing autosaved workspace before
// replacing it, and that checkpoint must be actually restorable.
const welcomeCheckpointContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const welcomeCheckpointPage = await welcomeCheckpointContext.newPage();
const welcomeCheckpointErrors = [];
welcomeCheckpointPage.on('pageerror', (error) => welcomeCheckpointErrors.push(error.message));
welcomeCheckpointPage.on('dialog', (dialog) => { welcomeCheckpointErrors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });
await welcomeCheckpointPage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await welcomeCheckpointPage.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'true',
  null,
  { timeout: 30000 },
);
await welcomeCheckpointPage.locator('#projectNameInput').fill('Before welcome replacement');
await welcomeCheckpointPage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await welcomeCheckpointPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await welcomeCheckpointPage
  .locator('.welcome-example-card[data-example-id="visualization"] .welcome-example-open')
  .click();
await welcomeCheckpointPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await welcomeCheckpointPage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened Visualization example.',
  null,
  { timeout: 30000 },
);
await welcomeCheckpointPage.waitForFunction(() => {
  const canvas = document.getElementById('sectionCanvas');
  const meta = document.getElementById('sectionMeta')?.textContent || '';
  return (
    canvas?.checkVisibility() &&
    Number(canvas.dataset.xPxPerUm) > 0 &&
    Number(canvas.dataset.zPxPerUm) > 0 &&
    !/Z ×-/.test(meta)
  );
});
assert.ok(
  (await canvasInkFraction(welcomeCheckpointPage, '#sectionCanvas')) > 0.005,
  'Visualization example Section A–B rendered blank',
);
await welcomeCheckpointPage.waitForFunction(
  () =>
    [...(document.getElementById('workspaceRecoverySelect')?.options || [])].some((option) =>
      /pre-welcome-start/.test(option.textContent || ''),
    ),
  null,
  { timeout: 5000 },
);
const welcomeRecoveryValue = await welcomeCheckpointPage
  .locator('#workspaceRecoverySelect option')
  .filter({ hasText: /pre-welcome-start/ })
  .getAttribute('value');
assert.ok(welcomeRecoveryValue);
await openFunctionPanel(welcomeCheckpointPage, 'project');
await welcomeCheckpointPage.locator('#workspaceRecoverySelect').selectOption(welcomeRecoveryValue);
await welcomeCheckpointPage.locator('#workspaceRestoreBtn').click();
await chooseConfirmation(welcomeCheckpointPage);
await welcomeCheckpointPage.waitForFunction(
  () => /Restored local recovery checkpoint/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 10000 },
);
assert.equal(
  await welcomeCheckpointPage.locator('#projectNameInput').inputValue(),
  'Before welcome replacement',
);
assert.deepEqual(welcomeCheckpointErrors, []);
await welcomeCheckpointContext.close();

// A failed staged project from Welcome must restore the previous current workspace
// instead of autosaving the default empty editor over it.
const failedWelcomeContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const failedWelcomePage = await failedWelcomeContext.newPage();
const failedWelcomeErrors = [];
failedWelcomePage.on('pageerror', (error) => failedWelcomeErrors.push(error.message));
failedWelcomePage.on('dialog', (dialog) => { failedWelcomeErrors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });
await failedWelcomePage.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await failedWelcomePage.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'true',
  null,
  { timeout: 30000 },
);
await failedWelcomePage.locator('#projectNameInput').fill('Before failed welcome open');
await failedWelcomePage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await failedWelcomePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await failedWelcomePage.locator('#welcomeProjectInput').setInputFiles({
  name: 'broken.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from('{not valid json'),
});
await failedWelcomePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await failedWelcomePage.waitForFunction(
  () =>
    /Welcome action failed; restored local workspace/.test(
      document.getElementById('statusText')?.textContent || '',
    ),
  null,
  { timeout: 30000 },
);
assert.equal(
  await failedWelcomePage.locator('#projectNameInput').inputValue(),
  'Before failed welcome open',
);
assert.deepEqual(failedWelcomeErrors, []);
await failedWelcomeContext.close();

// Open Example must work even while another tab owns autosave, and the resulting
// workspace must remain interactive enough to replace the bundled mask.
const examplePage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const exampleErrors = [];
examplePage.on('pageerror', (error) => exampleErrors.push(error.message));
examplePage.on('dialog', (dialog) => { exampleErrors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });
await examplePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await examplePage
  .locator('.welcome-example-card[data-example-id="visualization"] .welcome-example-open')
  .click();
await examplePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await examplePage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened Visualization example.',
  null,
  { timeout: 30000 },
);
assert.equal(
  await examplePage.locator('.workspace').evaluate((element) => element.inert),
  false,
);
assert.equal(await examplePage.locator('#xyUnitSelect').inputValue(), 'mm');
assert.equal(Number(await examplePage.locator('#baseWidth').inputValue()), 100);
assert.ok(await examplePage.locator('#maskLayerList .layer-row input:checked').count());
assert.ok(await examplePage.locator('#layerLegend .legend-row').count());
const exampleMainInk = await canvasInkFraction(examplePage, '#mainCanvas'),
  exampleMaskInk = await canvasInkFraction(examplePage, '#maskCanvas');
assert.ok(exampleMainInk > 0.01, `Open Example Main canvas is blank: ${exampleMainInk}`);
assert.ok(exampleMaskInk > 0.005, `Open Example Mask canvas is blank: ${exampleMaskInk}`);
await examplePage.locator('#gdsInput').setInputFiles({
  name: 'example-reimport.oas',
  mimeType: 'application/octet-stream',
  buffer: welcomeLayoutBuffer,
});
await examplePage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened example-reimport.oas.',
  null,
  { timeout: 30000 },
);
assert.ok(await examplePage.locator('#maskLayerList .layer-row').count());
assert.deepEqual(exampleErrors, []);
await examplePage.close();

// Project is the first/default tool tab and owns local Save, file Export, recovery, and XYZ units.
assert.equal(await page.locator('#settingsTab').getAttribute('aria-selected'), 'true');
await page.locator('#settingsTools:not([hidden])').waitFor();
await openFunctionPanel(page, 'project');

// XYZ unit switching converts physical Z drafts as well as X/Y drafts.
await page.locator('#xyUnitSelect').selectOption('nm');
assert.equal(await page.locator('#baseThicknessUnit').textContent(), 'nm');
assert.equal(await page.locator('#operationThicknessUnit').textContent(), 'nm');
assert.equal(await page.locator('#roughFeatureUnit').textContent(), 'nm');
assert.equal(await page.locator('#roughHeightUnit').textContent(), 'nm');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12000);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3000);
assert.equal(Number(await page.locator('#roughFeatureSize').inputValue()), 500);
assert.equal(Number(await page.locator('#roughAmplitude').inputValue()), 1000);
await page.locator('#xyUnitSelect').selectOption('um');
assert.equal(Number(await page.locator('#baseThickness').inputValue()), 12);
assert.equal(Number(await page.locator('#operationThickness').inputValue()), 3);
assert.equal(Number(await page.locator('#roughFeatureSize').inputValue()), 0.5);
assert.equal(Number(await page.locator('#roughAmplitude').inputValue()), 1);
for (const id of [
  'projectNameInput',
  'newProjectBtn',
  'openProjectInput',
  'saveProjectBtn',
  'exportProjectBtn',
  'workspaceRecoveryClearBtn',
  'xyUnitSelect',
]) {
  assert.equal(await page.locator(`#settingsTools #${id}`).count(), 1);
}

await page.locator('#projectNameInput').fill('UI local checkpoint');
await page.locator('#saveProjectBtn').click();
await page.waitForFunction(() =>
  /Saved "UI local checkpoint" locally/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.ok(await page.locator('#workspaceRecoverySelect option').count() > 0);
assert.match(await page.locator('#workspaceRecoverySelect option').first().textContent(), /manual-save/);
assert.equal(await page.locator('#workspaceRecoveryClearBtn').isDisabled(), false);
const persistenceStores = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('wafercad-workspace-v1', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const stores = [...database.objectStoreNames];
        const transaction = database.transaction(['workspace', 'workspace-metadata'], 'readonly');
        const payloadRequest = transaction.objectStore('workspace').getAll();
        const metadataRequest = transaction.objectStore('workspace-metadata').getAll();
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          const metadataRecovery = metadataRequest.result.find((record) =>
            String(record?.key || '').startsWith('recovery:'),
          );
          const payloadRecovery = payloadRequest.result.find((record) =>
            String(record?.key || '').startsWith('recovery:'),
          );
          database.close();
          resolve({
            stores,
            metadataHasProject: Object.hasOwn(metadataRecovery || {}, 'project'),
            payloadHasProject: Boolean(payloadRecovery?.project),
          });
        };
      };
    }),
);
assert.ok(persistenceStores.stores.includes('workspace-metadata'));
assert.equal(persistenceStores.metadataHasProject, false);
assert.equal(persistenceStores.payloadHasProject, true);
await page.locator('#workspaceRecoveryClearBtn').click();
await chooseConfirmation(page);
await page.waitForFunction(
  () =>
    ![...(document.getElementById('workspaceRecoverySelect')?.options || [])].some((option) =>
      /manual-save/.test(option.textContent || ''),
    ),
);
assert.equal(
  await page.locator('#workspaceRecoverySelect option').filter({ hasText: /manual-save/ }).count(),
  0,
);

// Operation controls remain usable after the toolbar reorganization.
await openFunctionPanel(page, 'process');
await page.locator('#operationTools:not([hidden])').waitFor();
for (const id of ['applyOperationBtn', 'undoBtn', 'redoBtn', 'faceToggleBtn']) {
  assert.equal(await page.locator(`#operationTools #${id}`).count(), 1);
}
const face = page.locator('#faceToggleBtn');
assert.equal((await face.textContent()).trim(), 'Front');
await face.click();
assert.equal((await face.textContent()).trim(), 'Back');
await face.click();

// Etch defaults to the legacy directional path. Isotropic release is an explicit
// opt-in profile with material selection and no Rough/Pyramid appearance mode.
await page.locator('[data-process-mode="etch"]').click();
assert.equal(await page.locator('#etchProfileRow').isVisible(), true);
assert.equal(await page.locator('#etchProfile').inputValue(), 'directional');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), true);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Depth');

await page.locator('#etchProfile').selectOption('isotropic');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), false);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Radius');
assert.match(await page.locator('#operationNote').textContent(), /Choose one exposed material/);
assert.match(
  await page.locator('#etchTargetLayer option').first().textContent(),
  /Select material/,
);

await page.locator('#etchProfile').selectOption('directional');
assert.equal(await page.locator('#etchSurfaceRow').isVisible(), true);
assert.equal((await page.locator('#processThicknessLabel').textContent()).trim(), 'Depth');

// Rough etch remains render-only metadata; the ideal process geometry stays canonical.
assert.equal(await page.locator('#roughFeatureRow').isVisible(), false);
await page.locator('#etchSurfaceMode').selectOption('rough');
assert.equal(await page.locator('#roughPolarityRow').isVisible(), true);
assert.equal(await page.locator('#roughPolarity').inputValue(), 'inverted');
await page.locator('#roughPolarity').selectOption('normal');
assert.match(await page.locator('#operationNote').textContent(), /Normal points features outward/);
assert.equal(await page.locator('#roughFeatureRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightRow').isVisible(), true);
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);
assert.match(await page.locator('#operationNote').textContent(), /maximum etch depth/);

await page.locator('#etchSurfaceMode').selectOption('pyramid');
assert.equal((await page.locator('#roughFeatureLabel').textContent()).trim(), 'Pyramid XY');
assert.equal((await page.locator('#roughHeightLabel').textContent()).trim(), 'Height');
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);
assert.equal(await page.locator('#roughSeedRow').isVisible(), true);
await page.locator('#roughFeatureCv').fill('30');
await page.locator('#roughHeightCv').fill('20');
await page.locator('#roughSeed').fill('2018');
assert.match(await page.locator('#operationNote').textContent(), /Seed makes the random field reproducible/);
await page.locator('#etchSurfaceMode').selectOption('rough');
assert.equal((await page.locator('#roughFeatureLabel').textContent()).trim(), 'Feature XY');
assert.equal((await page.locator('#roughHeightLabel').textContent()).trim(), 'Height mean');
assert.equal(await page.locator('#roughFeatureCvRow').isVisible(), true);
assert.equal(await page.locator('#roughHeightCvRow').isVisible(), true);

await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.5');
assert.equal(await page.locator('#roughAmplitude').getAttribute('max'), '0.5');
await page.locator('#roughFeatureSize').fill('0.4');
await page.locator('#roughFeatureCv').fill('35');
await page.locator('#roughAmplitude').fill('0.8');
await page.locator('#roughHeightCv').fill('40');
await page.locator('#roughSeed').fill('4242');
await page.locator('#applyOperationBtn').click();
assert.match(await page.locator('#statusText').textContent(), /Height cannot exceed Etch Depth/);
await page.locator('#operationThickness').fill('1');
assert.equal(await page.locator('#roughAmplitude').getAttribute('max'), '1');
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
try {
  await page.waitForFunction(
    () => {
      const text = document.getElementById('statusText')?.textContent || '';
      return /Etched|Operation failed|Conformal geometry failed/.test(text);
    },
    null,
    { timeout: 30000 },
  );
} catch (error) {
  console.error('Rough Etch timeout diagnostics:', await processDiagnostics(page));
  throw error;
}
assert.match(await page.locator('#statusText').textContent(), /Etched/);

assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');
await page.locator('#undoBtn').click();
assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');
await page.locator('#redoBtn').click();
assert.equal(await page.locator('#roughFeatureSize').inputValue(), '0.4');
assert.equal(await page.locator('#roughAmplitude').inputValue(), '0.8');
assert.equal(await page.locator('#roughFeatureCv').inputValue(), '35');
assert.equal(await page.locator('#roughHeightCv').inputValue(), '40');
assert.equal(await page.locator('#roughSeed').inputValue(), '4242');

await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI rough project');
const roughDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const roughDownload = await roughDownloadPromise;
const roughSavedPath = await roughDownload.path();
assert.ok(roughSavedPath);
const roughSaved = JSON.parse(await readFile(roughSavedPath, 'utf8'));
const roughSegments = roughSaved.model.regions.flatMap((region) => region.stack);
assert.ok(
  roughSegments.some(
    (segment) =>
      segment.frontSurface?.kind === 'rough' &&
      segment.frontSurface.morphology === 'stochastic' &&
      segment.frontSurface.polarity === 'normal' &&
      segment.frontSurface.geometryMode === 'ideal' &&
      Math.abs(segment.frontSurface.featureSize - 0.4) < 1e-12 &&
      Math.abs(segment.frontSurface.meanHeight - 0.8) < 1e-12 &&
      Math.abs(segment.frontSurface.featureCv - 0.35) < 1e-12 &&
      Math.abs(segment.frontSurface.heightCv - 0.4) < 1e-12 &&
      segment.frontSurface.seed === 4242 &&
      typeof segment.frontSurface.profileId === 'string' &&
      Math.abs(segment.frontSurface.etchDepth - 1) < 1e-12,
  ),
);
await openFunctionPanel(page, 'process');

// Implant uses the same process area but records a structural annotation only.
await page.locator('[data-process-mode="implant"]').click();
assert.equal(await page.locator('#implantNameRow').isVisible(), true);
assert.equal(await page.locator('#implantTiltRow').isVisible(), true);
assert.equal(await page.locator('#implantColor').count(), 0);
assert.match(await page.locator('#operationNote').textContent(), /Structural implant annotation/);
await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.6');
await page.locator('#implantName').fill('UI implant');
await page.locator('#implantTilt').fill('7');
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Marked implant UI implant/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);

const implantLegendRow = page.locator('#layerLegend .implant-row-wrap').first();
assert.equal(await implantLegendRow.count(), 1);
assert.equal(await implantLegendRow.locator('.legend-visibility').isChecked(), true);
assert.doesNotMatch(await implantLegendRow.textContent(), /EXP/);
const implantOrder = await implantLegendRow.locator('.implant-legend-row').evaluate((row) =>
  [...row.children].map((child) => child.className),
);
assert.match(String(implantOrder.at(-1)), /legend-visibility/);
assert.equal(await implantLegendRow.locator('.legend-profile-trigger').textContent(), '∿');
await implantLegendRow.locator('.legend-profile-trigger').click();
assert.equal(await implantLegendRow.locator('.legend-profile-editor').isVisible(), true);
assert.equal(
  await implantLegendRow.locator('.legend-profile-option.active').textContent(),
  'Follow offset',
);
await mkdir(new URL('../test-results/product-review/', import.meta.url), { recursive: true });
await page.waitForFunction(
  () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.screenshot({
  path: new URL(
    '../test-results/product-review/annotation-depth-profile-follow.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});
await page.locator('#threePanel .three-opacity-control > summary').click();
await page.locator('#threeOpacityRange').fill('0.5');
await page.locator('#threeOpacityRange').dispatchEvent('input');
await page.locator('#threePanel .three-opacity-control > summary').click();
await page.waitForFunction(
  () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.locator('#threeMaxBtn').click();
await page.waitForTimeout(250);
await page.waitForFunction(
  () =>
    document.body.classList.contains('view-maximized') &&
    document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.screenshot({
  path: new URL(
    '../test-results/product-review/annotation-depth-profile-follow-3d-transparent.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});
await page.locator('#threeMaxBtn').click();
await implantLegendRow.getByRole('button', { name: 'Smooth', exact: true }).click();
assert.equal(await implantLegendRow.locator('.legend-profile-trigger').textContent(), '—');
await implantLegendRow.locator('.legend-profile-trigger').click();
assert.equal(
  await implantLegendRow.locator('.legend-profile-option.active').textContent(),
  'Smooth',
);
await page.waitForFunction(
  () => document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.screenshot({
  path: new URL(
    '../test-results/product-review/annotation-depth-profile-smooth.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});
await page.locator('#threeMaxBtn').click();
await page.waitForTimeout(250);
await page.waitForFunction(
  () =>
    document.body.classList.contains('view-maximized') &&
    document.getElementById('threeHost')?.dataset?.renderState === 'ready',
  null,
  { timeout: 30000 },
);
await page.screenshot({
  path: new URL(
    '../test-results/product-review/annotation-depth-profile-smooth-3d-transparent.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});
await page.locator('#threeMaxBtn').click();
await page.locator('#threePanel .three-opacity-control > summary').click();
await page.locator('#threeOpacityRange').fill('1');
await page.locator('#threeOpacityRange').dispatchEvent('input');
await page.locator('#threePanel .three-opacity-control > summary').click();
await implantLegendRow.getByRole('button', { name: 'Follow offset', exact: true }).click();
await implantLegendRow.locator('.implant-gradient-chip').click();
assert.equal(await implantLegendRow.locator('.legend-palette-chip').count(), 20);
await implantLegendRow.locator('.legend-palette-chip').nth(3).click();
await page.locator('#layerLegend .legend-random').click();
await implantLegendRow.locator('.legend-name').fill('UI implant renamed');
await implantLegendRow.locator('.legend-name').press('Tab');
await page.locator('#sectionBordersBtn').click();
assert.equal(await page.locator('#sectionBordersBtn').getAttribute('aria-pressed'), 'true');
await implantLegendRow.locator('.legend-visibility').uncheck();
assert.equal(await implantLegendRow.locator('.legend-visibility').isChecked(), false);
await implantLegendRow.locator('.legend-visibility').check();

// Orbiting the 3D view is inspection state and must persist with the project.
const threeCanvasBox = await page.locator('#threeHost canvas').boundingBox();
assert.ok(threeCanvasBox);
await page.mouse.move(
  threeCanvasBox.x + threeCanvasBox.width * 0.62,
  threeCanvasBox.y + threeCanvasBox.height * 0.48,
);
await page.mouse.down();
await page.mouse.move(
  threeCanvasBox.x + threeCanvasBox.width * 0.52,
  threeCanvasBox.y + threeCanvasBox.height * 0.39,
  { steps: 5 },
);
await page.mouse.up();
await page.waitForTimeout(120);

await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI implant project');
const implantDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const implantDownload = await implantDownloadPromise;
const implantSavedPath = await implantDownload.path();
assert.ok(implantSavedPath);
const implantSaved = JSON.parse(await readFile(implantSavedPath, 'utf8'));
assert.equal(implantSaved.model.implants.length, 1);
assert.equal(implantSaved.model.implants[0].name, 'UI implant renamed');
assert.equal(implantSaved.model.implants[0].thickness, 0.6);
assert.equal(implantSaved.model.implants[0].tilt, 7);
assert.equal(implantSaved.model.implants[0].depthProfile, 'follow');
assert.equal(implantSaved.model.implants[0].visible, true);
assert.equal('border' in implantSaved.model.implants[0], false);
assert.equal(implantSaved.display.sectionShowBorders, true);
assert.equal(implantSaved.display.threeCamera.position.length, 3);
assert.equal(implantSaved.display.threeCamera.target.length, 3);
assert.ok(implantSaved.display.threeCamera.position.every(Number.isFinite));
assert.ok(implantSaved.display.threeCamera.target.every(Number.isFinite));
assert.ok(implantSaved.display.threeCamera.fov > 1);
assert.equal(implantSaved.display.customStructurePalette.length, 20);
assert.ok(implantSaved.display.customStructurePalette.includes(implantSaved.model.implants[0].color));
assert.ok(implantSaved.model.implants[0].patches.length > 0);
await openFunctionPanel(page, 'process');

// Electrical Region is a separate annotation semantic: no Implant tilt/gradient
// controls, typed metadata, independent legend row, and persisted v14 state.
await page.locator('[data-process-mode="electrical"]').click();
assert.equal(await page.locator('#electricalNameRow').isVisible(), true);
assert.equal(await page.locator('#electricalRegionParams').isVisible(), true);
assert.equal(await page.locator('#implantTiltRow').isHidden(), true);
assert.match(await page.locator('#operationNote').textContent(), /Non-material electrical annotation/);
await page.locator('#operationArea').selectOption('full');
await page.locator('#operationThickness').fill('0.2');
await page.locator('#electricalName').fill('UI induced inversion');
await page.locator('#electricalRegionType').selectOption('p-inversion');
await page.locator('#electricalRegionSource').selectOption('induced');
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Marked electrical region UI induced inversion/.test(
    document.getElementById('statusText')?.textContent || '',
  ),
);

const electricalLegendRow = page.locator('#layerLegend .electrical-row-wrap').first();
assert.equal(await electricalLegendRow.count(), 1);
assert.equal(await electricalLegendRow.locator('.legend-visibility').isChecked(), true);
assert.equal(await electricalLegendRow.locator('.legend-profile-trigger').textContent(), '∿');
await electricalLegendRow.locator('.legend-profile-trigger').click();
await electricalLegendRow.getByRole('button', { name: 'Smooth', exact: true }).click();
assert.equal(await electricalLegendRow.locator('.legend-profile-trigger').textContent(), '—');
await electricalLegendRow.locator('.legend-profile-trigger').click();
await page.screenshot({
  path: new URL(
    '../test-results/product-review/electrical-depth-profile-smooth.png',
    import.meta.url,
  ).pathname,
  fullPage: true,
});
await electricalLegendRow.locator('.legend-name').fill('UI electrical renamed');
await electricalLegendRow.locator('.legend-name').press('Tab');
await page
  .locator('#threePanel .three-opacity-control > summary')
  .click();
await page.locator('#threeOpacityRange').fill('0.5');
await page.locator('#threeOpacityRange').dispatchEvent('input');
await page.waitForFunction(
  () => Number(document.getElementById('threeHost')?.dataset?.electricalRegionInternalCount || 0) > 0,
  null,
  { timeout: 30000 },
);
await page.locator('#threePanel .three-opacity-control > summary').click();

await openFunctionPanel(page, 'project');
const electricalDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const electricalDownload = await electricalDownloadPromise;
const electricalSavedPath = await electricalDownload.path();
assert.ok(electricalSavedPath);
const electricalSaved = JSON.parse(await readFile(electricalSavedPath, 'utf8'));
assert.equal(electricalSaved.version, 14);
assert.equal(electricalSaved.model.electricalRegions.length, 1);
assert.equal(electricalSaved.model.electricalRegions[0].name, 'UI electrical renamed');
assert.equal(electricalSaved.model.electricalRegions[0].regionType, 'p-inversion');
assert.equal(electricalSaved.model.electricalRegions[0].source, 'induced');
assert.equal(electricalSaved.model.electricalRegions[0].thickness, 0.2);
assert.equal(electricalSaved.model.electricalRegions[0].depthProfile, 'smooth');
assert.equal(electricalSaved.model.implants.length, 1);
await openFunctionPanel(page, 'process');

// Extend targets follow the exposed surface and include Base when it is exposed.
await page.locator('[data-process-mode="grow"]').click();
await page.locator('#operationArea').selectOption('full');
assert.ok(await page.locator('#targetLayer option[value="base"]').count());
await page.locator('[data-process-mode="add"]').click();

// Exercise Conformal through the real UI path, then save and inspect the canonical model.
const conformalFixture = createModel({
  shape: 'circle',
  width: 100000,
  height: 100000,
  thickness: 12,
});
applyOperation(conformalFixture, {
  type: 'etch',
  thickness: 2,
  area: circleMulti(10000),
});
const conformalProject = projectForBenchmark({
  model: conformalFixture,
  section: { a: [-7000, 0], b: [7000, 0] },
});
await openFunctionPanel(page, 'project');
await page.locator('#openProjectInput').setInputFiles({
  name: 'ui-conformal-round-trench.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(conformalProject)),
});
await chooseConfirmation(page);
await page.waitForFunction(() =>
  (document.getElementById('statusText')?.textContent || '').startsWith('Opened'),
);
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="add"]').click();
await page.locator('#operationArea').selectOption('full');
await page.locator('#growthMode').selectOption('conformal');
await page.locator('#operationThickness').fill('1');
await page.locator('#layerName').fill('UI conformal');
assert.equal(await page.locator('#growthMode').inputValue(), 'conformal');
assert.match(await page.locator('#operationNote').textContent(), /Conformal/);
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), false);
await page.waitForFunction(() =>
  /Deposited UI conformal/.test(document.getElementById('statusText')?.textContent || ''),
);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), true);
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);

await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI conformal project');
const downloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), 'UI conformal project.wafercad');
assert.match(await page.locator('#statusText').textContent(), /Download requested/);
const savedPath = await download.path();
assert.ok(savedPath);
const saved = JSON.parse(await readFile(savedPath, 'utf8'));
const coatId = saved.model.layers.find((layer) => layer.name === 'UI conformal')?.id;
assert.ok(coatId);
const stackAtSaved = (x) =>
  saved.model.regions.find((region) => pointInMulti([x, 0], region.geom))?.stack || [];
const sideX = 4999.5;
assert.deepEqual(
  stackAtSaved(sideX).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 7, role: 'conformal-sidewall' },
);
assert.deepEqual(
  stackAtSaved(0).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 5 },
);
assert.deepEqual(
  stackAtSaved(5001).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 6, z1: 7 },
);
const coatColor = saved.model.layers.find((layer) => layer.id === coatId).color;
const [savedLo, savedHi] = modelBoundsZ(saved.model);
const savedPad = Math.max(1e-9, (savedHi - savedLo) * 0.08);
const sectionZ0 = savedLo - savedPad;
const sectionZ1 = savedHi + savedPad;
const sidewallPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, sideX }) => {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(globalThis.devicePixelRatio || 1, 2),
      left = 27,
      right = 10,
      iw = rect.width - left - right,
      t = (sideX + 7000) / 14000,
      x = Math.round((left + t * iw) * dpr),
      z = 6,
      z0 = Number(canvas.dataset.sectionZ0Um),
      z1 = Number(canvas.dataset.sectionZ1Um),
      top = Number(canvas.dataset.sectionCollapseTopUm),
      bottom = Number(canvas.dataset.sectionCollapseBottomUm),
      frameTop = Number(canvas.dataset.sectionFrameTop),
      frameBottom = Number(canvas.dataset.sectionFrameBottom),
      upperY = Number(canvas.dataset.sectionCollapseUpperY),
      lowerY = Number(canvas.dataset.sectionCollapseLowerY);
    const mapZ = (value) => {
      if (value >= top) {
        return frameTop + ((z1 - value) / Math.max(z1 - top, 1e-12)) * (upperY - frameTop);
      }
      if (value <= bottom) {
        return lowerY + ((bottom - value) / Math.max(bottom - z0, 1e-12)) * (frameBottom - lowerY);
      }
      return (upperY + lowerY) / 2;
    };
    const y = Math.round(mapZ(z) * dpr),
      actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)],
      expected = [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ];
    return { actual, expected, z, top, bottom };
  },
  { color: coatColor, sideX },
);
assert.ok(
  sidewallPixel.actual.every(
    (value, index) => Math.abs(value - sidewallPixel.expected[index]) <= 8,
  ),
);

// Region partitions inside one material must never show up as Section seams.
// Probe the trench wall x-position deep inside the continuous Base material,
// where the process model is partitioned but the visible material is identical.
const baseColor = saved.model.layers.find((layer) => layer.id === 'base').color;
const baseCommonLo = Math.max(
  ...saved.model.regions
    .map((region) => region.stack.find((segment) => segment.layerId === 'base')?.z0)
    .filter(Number.isFinite),
);
const baseSeamPixel = await page.locator('#sectionCanvas').evaluate(
  (canvas, { color, baseCommonLo }) => {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(globalThis.devicePixelRatio || 1, 2),
      left = 27,
      right = 10,
      iw = rect.width - left - right,
      t = (5000 + 7000) / 14000,
      x = Math.round((left + t * iw) * dpr),
      z0 = Number(canvas.dataset.sectionZ0Um),
      z1 = Number(canvas.dataset.sectionZ1Um),
      top = Number(canvas.dataset.sectionCollapseTopUm),
      bottom = Number(canvas.dataset.sectionCollapseBottomUm),
      frameTop = Number(canvas.dataset.sectionFrameTop),
      frameBottom = Number(canvas.dataset.sectionFrameBottom),
      upperY = Number(canvas.dataset.sectionCollapseUpperY),
      lowerY = Number(canvas.dataset.sectionCollapseLowerY),
      z = (baseCommonLo + bottom) / 2;
    const mapZ = (value) => {
      if (value >= top) {
        return frameTop + ((z1 - value) / Math.max(z1 - top, 1e-12)) * (upperY - frameTop);
      }
      return lowerY + ((bottom - value) / Math.max(bottom - z0, 1e-12)) * (frameBottom - lowerY);
    };
    const y = Math.round(mapZ(z) * dpr),
      actual = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)],
      expected = [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ];
    return { actual, expected, z };
  },
  { color: baseColor, baseCommonLo },
);
assert.ok(
  baseSeamPixel.actual.every(
    (value, index) => Math.abs(value - baseSeamPixel.expected[index]) <= 8,
  ),
);

// Section defaults to readable Auto fit but offers a true physical 1:1 check.
const sectionScaleButton = page.locator('#sectionScaleModeBtn');
assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');
assert.match(await page.locator('#sectionMeta').textContent(), /Z ×/);
const autoScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
  x: Number(canvas.dataset.xPxPerUm),
  z: Number(canvas.dataset.zPxPerUm),
}));
assert.ok(autoScales.x > 0 && autoScales.z > 0);
await sectionScaleButton.click();
assert.equal((await sectionScaleButton.textContent()).trim(), '1:1');
assert.match(await page.locator('#sectionMeta').textContent(), /1:1/);
const physicalScales = await page.locator('#sectionCanvas').evaluate((canvas) => ({
  mode: canvas.dataset.scaleMode,
  x: Number(canvas.dataset.xPxPerUm),
  z: Number(canvas.dataset.zPxPerUm),
}));
assert.equal(physicalScales.mode, 'physical');
assert.ok(Math.abs(physicalScales.x - physicalScales.z) < 1e-9);
await sectionScaleButton.click();
assert.equal((await sectionScaleButton.textContent()).trim(), 'Auto');

// Section Detail ROI keeps the global section visible while re-rendering a local
// region at higher effective resolution. The inset can be moved out of the way.
await page.locator('#sectionDetailRoiBtn').click();
const sectionBox = await page.locator('#sectionCanvas').boundingBox();
assert.ok(sectionBox);
await page.mouse.move(
  sectionBox.x + sectionBox.width * 0.34,
  sectionBox.y + sectionBox.height * 0.18,
);
await page.mouse.down();
await page.mouse.move(
  sectionBox.x + sectionBox.width * 0.54,
  sectionBox.y + sectionBox.height * 0.42,
  { steps: 5 },
);
await page.mouse.up();
await page.locator('#sectionDetailRoiOverlay').waitFor({ state: 'visible' });
await page.locator('#sectionDetailInset').waitFor({ state: 'visible' });
assert.ok(
  (await canvasInkFraction(page, '#sectionDetailInsetCanvas')) > 0.01,
  'Section Detail inset rendered blank',
);
const insetBefore = await page.locator('#sectionDetailInset').boundingBox();
const insetHeadBox = await page.locator('#sectionDetailInsetHead').boundingBox();
assert.ok(insetBefore && insetHeadBox);
await page.mouse.move(insetHeadBox.x + 20, insetHeadBox.y + insetHeadBox.height / 2);
await page.mouse.down();
await page.mouse.move(insetHeadBox.x - 45, insetHeadBox.y + 42, { steps: 4 });
await page.mouse.up();
const insetAfter = await page.locator('#sectionDetailInset').boundingBox();
assert.ok(insetAfter);
assert.ok(
  Math.abs(insetAfter.x - insetBefore.x) > 4 || Math.abs(insetAfter.y - insetBefore.y) > 4,
  'Section Detail inset did not move',
);
await page.locator('#sectionDetailShapeBtn').click();
assert.equal(
  await page.locator('#sectionDetailRoiOverlay').evaluate((el) => el.classList.contains('circle')),
  true,
);

// Conformal Extend reuses the Deposit coating kernel with the existing layer id.
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="grow"]').click();
await page.locator('#operationArea').selectOption('full');
await page.locator('#growthMode').selectOption('conformal');
await page.locator('#targetLayer').selectOption(coatId);
await page.locator('#operationThickness').fill('1');
assert.match(await page.locator('#operationNote').textContent(), /every exposed surface/);
await page.locator('#applyOperationBtn').click();
await page.waitForFunction(() =>
  /Extended UI conformal · Conformal/.test(document.getElementById('statusText')?.textContent || ''),
);
await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('UI conformal extend project');
const extendDownloadPromise = page.waitForEvent('download');
await page.locator('#exportProjectBtn').click();
const extendDownload = await extendDownloadPromise;
const extendSavedPath = await extendDownload.path();
assert.ok(extendSavedPath);
const extendSaved = JSON.parse(await readFile(extendSavedPath, 'utf8'));
assert.equal(extendSaved.display.sectionDetailRoi?.shape, 'circle');
assert.ok(extendSaved.display.sectionDetailRoi?.width > 0);
assert.ok(extendSaved.display.sectionDetailRoi?.height > 0);
const extendStackAt = (x) =>
  extendSaved.model.regions.find((region) => pointInMulti([x, 0], region.geom))?.stack || [];
assert.deepEqual(
  extendStackAt(0).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 6 },
);
assert.deepEqual(
  extendStackAt(7000).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 6, z1: 8 },
);
assert.deepEqual(
  extendStackAt(sideX).find((segment) => segment.layerId === coatId),
  { layerId: coatId, z0: 4, z1: 8, role: 'conformal-sidewall' },
);

await closeFunctionPanel(page);

// Slice geometry is editable by default; Slice starts one-shot creation.
const abPanel = page.locator('#sectionCoordsPanel');
const main = page.locator('#mainCanvas');
const mainBox = await main.boundingBox();
assert.ok(mainBox);
assert.equal(await abPanel.isHidden(), true);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);
assert.ok((await page.locator('[data-endpoint=a]').boundingBox()).width <= 24);

await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
assert.equal(await page.locator('[data-endpoint=a]').isHidden(), true);
await page.mouse.move(mainBox.x + mainBox.width * 0.25, mainBox.y + mainBox.height * 0.35);
await page.mouse.down();
await page.mouse.move(mainBox.x + mainBox.width * 0.72, mainBox.y + mainBox.height * 0.62, {
  steps: 5,
});
await page.mouse.up();
await page.waitForTimeout(30);
assert.match(await page.locator('#statusText').textContent(), /^Slice created\./);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

// Existing A–B line can be translated directly while the coordinate panel is open.
const aBefore = Number(await page.locator('#sectionAx').inputValue());
const bBefore = Number(await page.locator('#sectionBx').inputValue());
const aHandle = await page.locator('[data-endpoint=a]').boundingBox();
const bHandle = await page.locator('[data-endpoint=b]').boundingBox();
const lineX = (aHandle.x + aHandle.width / 2 + bHandle.x + bHandle.width / 2) / 2;
const lineY = (aHandle.y + aHandle.height / 2 + bHandle.y + bHandle.height / 2) / 2;
await page.mouse.move(lineX, lineY);
await page.mouse.down();
await page.mouse.move(lineX + 12, lineY, { steps: 4 });
await page.mouse.up();
assert.notEqual(Number(await page.locator('#sectionAx').inputValue()), aBefore);
assert.notEqual(Number(await page.locator('#sectionBx').inputValue()), bBefore);

await page.locator('#sectionAx').fill('1.23456');
await page.locator('#sectionAx').press('Tab');
assert.equal(await page.locator('#sectionAx').inputValue(), '1.235');
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isHidden(), true);
assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);

// ROI lives in Main. Opening ROI closes the Slice popover, and creation is one-shot.
await page.locator('#sectionControlsBtn').click();
assert.equal(await abPanel.isVisible(), true);
await page.locator('#focusEditor > summary').click();
assert.equal(await abPanel.isHidden(), true);
assert.equal((await page.locator('#focusEditor > summary').textContent()).trim(), 'ROI');
await page.locator('.roi-tool[data-tool="rect"]').click();
await page.mouse.move(mainBox.x + mainBox.width * 0.4, mainBox.y + mainBox.height * 0.4);
await page.mouse.down();
await page.mouse.move(mainBox.x + mainBox.width * 0.6, mainBox.y + mainBox.height * 0.6, {
  steps: 4,
});
await page.mouse.up();
await page.waitForTimeout(50);
assert.deepEqual(errors, [], 'Rectangle ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Number(await page.locator('#roiWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#roiHeight').inputValue()) > 0);

// Main permits only one floating control: Export replaces ROI.
const mainExportControl = page.locator('#mainPanel .export-control');
await mainExportControl.locator(':scope > summary').click();
assert.equal(await page.locator('#focusEditor').evaluate((details) => details.open), false);
assert.equal(await mainExportControl.evaluate((details) => details.open), true);
await mainExportControl.locator(':scope > summary').click();

// Sector ROI starts as a circle-derived 0°→90° wedge and supports wrapped ranges.
await page.locator('#focusEditor > summary').click();
await page.locator('#clearRoiBtn').click();
await page.locator('.roi-tool[data-tool="sector"]').click();
const sectorBox = await main.boundingBox();
assert.ok(sectorBox);
await page.mouse.move(sectorBox.x + sectorBox.width * 0.5, sectorBox.y + sectorBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.62, sectorBox.y + sectorBox.height * 0.5, {
  steps: 4,
});
await page.mouse.up();
await page.waitForTimeout(50);
assert.deepEqual(errors, [], 'Sector ROI creation must not raise a browser error.');
assert.match(await page.locator('#statusText').textContent(), /^ROI created\./);
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#roiShapeLabel').textContent()).trim(), 'Sector');
assert.equal(await page.locator('#roiStartAngle').inputValue(), '0');
assert.equal(await page.locator('#roiEndAngle').inputValue(), '90');

// Drag the yellow Start-angle handle from 0° to 270° and verify the numeric editor follows.
await page.locator('#focusEditor > summary').click();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.62, sectorBox.y + sectorBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(sectorBox.x + sectorBox.width * 0.5, sectorBox.y + sectorBox.height * 0.62, {
  steps: 5,
});
await page.mouse.up();
await page.locator('#focusEditor').evaluate((details) => {
  details.open = true;
});
await page.locator('#roiEditor:not([hidden])').waitFor();
assert.ok(Math.abs(Number(await page.locator('#roiStartAngle').inputValue()) - 270) < 1);
assert.equal(await page.locator('#roiEndAngle').inputValue(), '90');

await page.locator('#roiStartAngle').fill('300');
await page.locator('#roiStartAngle').press('Tab');
await page.locator('#roiEndAngle').fill('60');
await page.locator('#roiEndAngle').press('Tab');
await page.locator('#focusEditor > summary').click();

// Mask now mirrors Main's double-click-to-Fit behavior.
await page.locator('#maskCanvas').dblclick();
assert.deepEqual(errors, [], 'Mask double-click Fit must not raise a browser error.');

// File / Draw keeps imported and temporary mask sources separate.
// Load a real File Mask on this long-lived editor page before validating filtered File export.
await page.locator('#gdsInput').setInputFiles({
  name: 'ui-mask-export.oas',
  mimeType: 'application/octet-stream',
  buffer: welcomeLayoutBuffer,
});
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened ui-mask-export.oas.',
  null,
  { timeout: 30000 },
);
assert.ok(await page.locator('#maskLayerList .layer-row').count());

// Mask ROI / Opacity / Export share one exclusive popover slot.
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiEditor').evaluate((details) => details.open), true);
await page.locator('#maskPanel .mask-opacity-control > summary').click();
assert.equal(await page.locator('#maskRoiEditor').evaluate((details) => details.open), false);
assert.equal(
  await page.locator('#maskPanel .mask-opacity-control').evaluate((details) => details.open),
  true,
);
await page.locator('#maskExportControl > summary').click();
assert.equal(
  await page.locator('#maskPanel .mask-opacity-control').evaluate((details) => details.open),
  false,
);
assert.equal(await page.locator('#maskExportControl').evaluate((details) => details.open), true);
await page.locator('#maskExportControl > summary').click();

const sourceToggle = page.locator('#maskSourceToggleBtn');
assert.equal((await sourceToggle.textContent()).trim(), 'File');
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'Draw');
assert.equal(await page.locator('#drawMaskToolbar').isVisible(), true);
assert.equal(await page.locator('#maskFileControls').isHidden(), true);
assert.equal(
  await page.locator('#maskDrawInfo').evaluate((element) => element.hidden),
  false,
);

const drawBox = await page.locator('#maskCanvas').boundingBox();
assert.ok(drawBox);
await page.locator('.draw-mask-tool[data-draw-tool="rect"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.43, drawBox.y + drawBox.height * 0.43);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.57, drawBox.y + drawBox.height * 0.57, {
  steps: 4,
});
await page.mouse.up();
await page.waitForTimeout(30);
assert.match(await page.locator('#drawMaskHint').textContent(), /^1 shape/);

// Rectangle/Circle-style shapes open their exact parameter editor on a normal click.
await page.mouse.click(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Rectangle');
assert.ok(Number(await page.locator('#drawShapeWidth').inputValue()) > 0);
assert.ok(Number(await page.locator('#drawShapeHeight').inputValue()) > 0);

// A header popover replaces the canvas shape editor in the same Mask window.
await page.locator('#maskPanel .mask-opacity-control > summary').click();
assert.equal(await page.locator('#drawShapeEditor').isHidden(), true);
await page.locator('#maskPanel .mask-opacity-control > summary').click();
await page.waitForTimeout(350);
await page.mouse.click(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();

// Dragging a selected shape keeps the editor open and live-syncs its numeric fields.
const rectCxBeforeDrag = Number(await page.locator('#drawShapeCx').inputValue());
// Avoid the preceding selection click being interpreted as the first click of a double-click.
await page.waitForTimeout(600);
await page.mouse.move(drawBox.x + drawBox.width * 0.47, drawBox.y + drawBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.5, drawBox.y + drawBox.height * 0.5, {
  steps: 4,
});
const rectCxDuringDrag = Number(await page.locator('#drawShapeCx').inputValue());
assert.notEqual(rectCxDuringDrag, rectCxBeforeDrag);
await page.mouse.up();
assert.equal(await page.locator('#drawShapeEditor').isVisible(), true);

await page.locator('#drawShapeCx').fill('250');
await page.locator('#drawShapeCy').fill('-125');
await page.locator('#drawShapeWidth').fill('800');
await page.locator('#drawShapeHeight').fill('600');
await page.locator('#drawShapeEditorApply').click();
assert.match(await page.locator('#statusText').textContent(), /Rectangle parameters updated/);
await page.locator('#drawShapeEditorClose').click();

// Polygon can finish by clicking its first point; double-click and Enter remain supported.
const polygonStart = {
  x: drawBox.x + drawBox.width * 0.3,
  y: drawBox.y + drawBox.height * 0.3,
};
await page.locator('.draw-mask-tool[data-draw-tool="polygon"]').click();
await page.mouse.click(polygonStart.x, polygonStart.y);
await page.mouse.click(drawBox.x + drawBox.width * 0.38, drawBox.y + drawBox.height * 0.3);
await page.mouse.click(drawBox.x + drawBox.width * 0.38, drawBox.y + drawBox.height * 0.38);
await page.mouse.click(polygonStart.x, polygonStart.y);
await page.waitForTimeout(30);
assert.match(await page.locator('#drawMaskHint').textContent(), /^2 shapes/);

// Existing Polygon opens the same parameter editor on a normal click.
await page.mouse.click(drawBox.x + drawBox.width * 0.36, drawBox.y + drawBox.height * 0.33);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Polygon');
const polygonRows = (await page.locator('#drawShapePoints').inputValue())
  .split(/\r?\n/)
  .filter(Boolean);
assert.equal(polygonRows.length, 3);
assert.ok(polygonRows.every((row) => row.includes(',')));
await page.locator('#drawShapeEditorClose').click();

// Ring is center + inner/outer radius and remains directly editable afterwards.
await page.locator('.draw-mask-tool[data-draw-tool="ring"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.65, drawBox.y + drawBox.height * 0.42);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.73, drawBox.y + drawBox.height * 0.42, {
  steps: 4,
});
await page.mouse.up();
await page.mouse.click(drawBox.x + drawBox.width * 0.71, drawBox.y + drawBox.height * 0.42);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Ring');
assert.ok(Number(await page.locator('#drawShapeOuterRadius').inputValue()) > 0);
assert.ok(
  Number(await page.locator('#drawShapeOuterRadius').inputValue()) >
    Number(await page.locator('#drawShapeInnerRadius').inputValue()),
);
await page.locator('#drawShapeEditorClose').click();

// Ring Sector adds start/end angles on top of the annular parameters.
await page.locator('.draw-mask-tool[data-draw-tool="ring-sector"]').click();
await page.mouse.move(drawBox.x + drawBox.width * 0.66, drawBox.y + drawBox.height * 0.68);
await page.mouse.down();
await page.mouse.move(drawBox.x + drawBox.width * 0.75, drawBox.y + drawBox.height * 0.68, {
  steps: 4,
});
await page.mouse.up();
await page.mouse.click(drawBox.x + drawBox.width * 0.71, drawBox.y + drawBox.height * 0.64);
await page.locator('#drawShapeEditor:not([hidden])').waitFor();
assert.equal((await page.locator('#drawShapeEditorTitle').textContent()).trim(), 'Ring Sector');
assert.equal(await page.locator('#drawShapeStartDeg').inputValue(), '0');
assert.equal(await page.locator('#drawShapeEndDeg').inputValue(), '90');
await page.locator('#drawShapeStartDeg').fill('300');
await page.locator('#drawShapeEndDeg').fill('60');
await page.locator('#drawShapeEditorApply').click();
assert.match(await page.locator('#statusText').textContent(), /Ring Sector parameters updated/);
await page.locator('#drawShapeEditorClose').click();
assert.match(await page.locator('#drawMaskHint').textContent(), /^4 shapes/);

// The active Draw source feeds Process Selected mask.
await openFunctionPanel(page, 'process');
await page.locator('[data-process-mode="add"]').click();
await page.locator('#growthMode').selectOption('direct');
await page.locator('#operationArea').selectOption('mask');
await page.locator('#operationThickness').fill('0.2');
await page.locator('#layerName').fill('Draw probe');
assert.equal(await page.locator('#operationType').inputValue(), 'add');
assert.equal(await page.locator('#growthMode').inputValue(), 'direct');
await page.evaluate(() => {
  if (Worker.prototype.__wafercadProcessProbeInstalled) return;
  const originalPostMessage = Worker.prototype.postMessage;
  Object.defineProperty(Worker.prototype, '__wafercadProcessProbeInstalled', {
    value: true,
    configurable: true,
  });
  Worker.prototype.postMessage = function patchedPostMessage(message, ...rest) {
    if (message?.params) globalThis.__lastProcessWorkerPayload = structuredClone(message);
    return originalPostMessage.call(this, message, ...rest);
  };
});
await page.locator('#applyOperationBtn').click();
assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), false);
try {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#layerLegend .legend-name')].some(
        (input) => input.value === 'Draw probe',
      ),
    null,
    { timeout: 30000 },
  );
} catch (error) {
  console.error('Draw probe diagnostics:', JSON.stringify(await processDiagnostics(page)));
  throw error;
}
assert.equal(await page.locator('#processTaskDialog').evaluate((element) => element.hidden), true);
assert.match(await page.locator('#statusText').textContent(), /Deposited Draw probe|Saved locally/);

// Switching sources never destroys either source.
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'File');
assert.equal(
  await page.locator('#maskFileControls').evaluate((element) => element.hidden),
  false,
);
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'Draw');
assert.match(await page.locator('#drawMaskHint').textContent(), /^4 shapes/);
await sourceToggle.click();
assert.equal((await sourceToggle.textContent()).trim(), 'File');

// Mask owns a separate Square/Circle ROI used by Process and Mask export.
await page.locator('#maskRoiEditor > summary').click();
await page.locator('.mask-roi-tool[data-tool="rect"]').click();
const maskRoiCanvas = await page.locator('#maskCanvas').boundingBox();
assert.ok(maskRoiCanvas);
await page.mouse.move(
  maskRoiCanvas.x + maskRoiCanvas.width * 0.38,
  maskRoiCanvas.y + maskRoiCanvas.height * 0.38,
);
await page.mouse.down();
await page.mouse.move(
  maskRoiCanvas.x + maskRoiCanvas.width * 0.62,
  maskRoiCanvas.y + maskRoiCanvas.height * 0.58,
  { steps: 4 },
);
await page.mouse.up();
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiFields').isVisible(), true);
assert.equal((await page.locator('#maskRoiShapeLabel').textContent()).trim(), 'Square');
assert.ok(Number(await page.locator('#maskRoiSize').inputValue()) > 0);
await page.locator('#maskRoiRotation').fill('27.5');
await page.locator('#maskRoiRotation').press('Tab');
assert.equal(Number(await page.locator('#maskRoiRotation').inputValue()), 27.5);
const maskRoiLocalX = await page.locator('#maskRoiX').inputValue(),
  maskRoiLocalY = await page.locator('#maskRoiY').inputValue(),
  maskRoiLocalSize = await page.locator('#maskRoiSize').inputValue();
await page.locator('#maskRoiEditor > summary').click();

// File-mask alignment moves the Mask ROI visually, but its local parameters stay unchanged.
await openFunctionPanel(page, 'mask');
const alignment = page.locator('#maskFileControls details.subgroup');
if (!(await alignment.evaluate((details) => details.open))) {
  await alignment.locator(':scope > summary').click();
}
await page.locator('#maskOffsetX').fill('1');
await page.locator('#maskOffsetY').fill('-0.5');
await page.locator('#maskScale').fill('1.1');
await page.locator('#maskRotation').fill('12');
await page.locator('#maskRoiEditor > summary').click();
assert.equal(await page.locator('#maskRoiX').inputValue(), maskRoiLocalX);
assert.equal(await page.locator('#maskRoiY').inputValue(), maskRoiLocalY);
assert.equal(await page.locator('#maskRoiSize').inputValue(), maskRoiLocalSize);
assert.equal(Number(await page.locator('#maskRoiRotation').inputValue()), 27.5);
await page.locator('#maskRoiEditor > summary').click();
await page.locator('#maskOffsetX').fill('0');
await page.locator('#maskOffsetY').fill('0');
await page.locator('#maskScale').fill('1');
await page.locator('#maskRotation').fill('0');

// Each view exposes one Export menu; format-specific actions live inside it.
for (const [panel, button, filename] of [
  ['#mainPanel', '#mainExportSvgBtn', 'wafercad-main.svg'],
  ['#maskPanel', '#maskExportSvgBtn', 'wafercad-mask.svg'],
  ['#sectionPanel', '#sectionExportSvgBtn', 'wafercad-section-ab.svg'],
]) {
  await page.locator(`${panel} .export-control > summary`).click();
  if (panel === '#maskPanel') {
    assert.ok((await page.locator('#maskExportCells option:checked').count()) > 0);
    assert.ok((await page.locator('#maskExportLayers option:checked').count()) > 0);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), filename);
}
for (const [button, filename] of [
  ['#maskExportGdsBtn', 'wafercad-mask.gds'],
  ['#maskExportOasBtn', 'wafercad-mask.oas'],
]) {
  await page.locator('#maskPanel .export-control > summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator(button).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), filename);
}
const headerToolAlignment = await page.locator('.view-head .view-tools').evaluateAll((groups) =>
  groups.map((group) => getComputedStyle(group).alignItems),
);
assert.ok(headerToolAlignment.length >= 4);
assert.ok(headerToolAlignment.every((value) => value === 'center'));

const headerControlBoxes = await page.locator('.view-panel').evaluateAll((panels) =>
  panels.flatMap((panel) => {
    const controls = [...panel.querySelectorAll(
      '.view-head button, .view-head summary, .view-head .three-border-toggle',
    )].filter(
      (element) =>
        element.checkVisibility() &&
        !element.closest('.focus-popover, .three-opacity-popover, .export-popover'),
    );
    return controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.id || element.textContent?.trim() || element.className,
        height: rect.height,
        centerY: rect.top + rect.height / 2,
        panel: panel.id,
      };
    });
  }),
);
assert.ok(headerControlBoxes.length > 12);
for (const box of headerControlBoxes) {
  assert.ok(
    box.height >= 20.4 && box.height <= 22.6,
    `${box.panel}/${box.id} header height ${box.height}`,
  );
}
for (const panelId of ['mainPanel', 'maskPanel', 'threePanel', 'sectionPanel']) {
  const boxes = headerControlBoxes.filter((box) => box.panel === panelId);
  if (boxes.length < 2) continue;
  const center = boxes.reduce((sum, box) => sum + box.centerY, 0) / boxes.length;
  for (const box of boxes) {
    assert.ok(
      Math.abs(box.centerY - center) <= 0.75,
      `${panelId}/${box.id} is vertically misaligned by ${Math.abs(box.centerY - center)}px`,
    );
  }
}

for (const [buttonId, panelId] of [
  ['mainMaxBtn', 'mainPanel'],
  ['maskMaxBtn', 'maskPanel'],
  ['threeMaxBtn', 'threePanel'],
  ['sectionMaxBtn', 'sectionPanel'],
]) {
  await page.locator(`#${buttonId}`).click();
  assert.equal(
    await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
    true,
  );
  assert.equal(
    await page.locator(`#${panelId}`).evaluate((el) => el.classList.contains('is-maximized')),
    true,
  );
  assert.equal((await page.locator(`#${buttonId}`).textContent()).trim(), 'Restore');
  await page.locator(`#${buttonId}`).click();
  assert.equal(
    await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
    false,
  );
}
await page.locator('#sectionMaxBtn').click();
await page.keyboard.press('Escape');
assert.equal(
  await page.locator('body').evaluate((el) => el.classList.contains('view-maximized')),
  false,
);

// 3D inspection controls should operate without runtime errors.
const threeOpacityControl = page.locator('#threePanel .three-opacity-control');
const threeExportControl = page.locator('#threePanel .export-control');
await threeOpacityControl.locator(':scope > summary').click();
await page.locator('#threeOpacityRange').fill('0.5');
await threeExportControl.locator(':scope > summary').click();
assert.equal(await threeOpacityControl.evaluate((details) => details.open), false);
assert.equal(await threeExportControl.evaluate((details) => details.open), true);
await threeExportControl.locator(':scope > summary').click();
const bordersBeforeToggle = await page.locator('#threeBorders').isChecked();
await page.locator('#threeBorderControl').click();
assert.equal(await page.locator('#threeBorders').isChecked(), !bordersBeforeToggle);
await page.locator('#fit3dBtn').click();

await page.locator('#threePanel .export-control > summary').click();
const glbDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportModelBtn').click();
assert.equal((await glbDownloadPromise).suggestedFilename(), 'wafercad-model.glb');
await page.locator('#threePanel .export-control > summary').click();
const pngDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('#threeExportPngBtn').click();
assert.equal((await pngDownloadPromise).suggestedFilename(), 'wafercad-3d-3x.png');

assert.equal(await page.locator('#maskSelectionSummary').count(), 0);

// The active workspace is restored after a normal app.html refresh. This also
// proves that a 2D-only display mutation schedules autosave without relying on 3D rendering.
await openFunctionPanel(page, 'project');
await page.locator('#projectNameInput').fill('Refresh restore check');
await page.evaluate(() => {
  const input = document.getElementById('maskOpacityRange');
  input.value = '0.35';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
const storedMaskOpacity = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('wafercad-workspace-v1', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('workspace', 'readonly');
        const recordRequest = transaction.objectStore('workspace').get('current');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          const project = recordRequest.result?.project;
          resolve({
            maskOpacity: project?.display?.maskOpacity ?? null,
            storageEncoding: project?.storage?.encoding ?? null,
          });
        };
      };
    }),
);
assert.equal(storedMaskOpacity.maskOpacity, 0.35);
assert.equal(storedMaskOpacity.storageEncoding, 'shared-assets-v1');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Restored local workspace'),
  null,
  { timeout: 30000 },
);
assert.equal(await page.locator('#projectNameInput').inputValue(), 'Refresh restore check');
assert.equal(Number(await page.locator('#maskOpacityRange').inputValue()), 0.35);

// History is Step-first: manual save is only a bookmark annotation.
await openFunctionPanel(page, 'snapshots');
assert.equal(await page.locator('#saveSnapshotBtn').count(), 0);
assert.equal(await page.locator('.snapshot-other-branch').count(), 0);

// New Project also leaves a Recovery checkpoint before replacing the live workspace.
await openFunctionPanel(page, 'project');
await page.locator('#newProjectBtn').click();
await chooseConfirmation(page);
await page.waitForFunction(
  () =>
    [...(document.getElementById('workspaceRecoverySelect')?.options || [])].some((option) =>
      /pre-new-project/.test(option.textContent || ''),
    ),
);
assert.match(await page.locator('#statusText').textContent(), /New empty project/);

// Project delivery gate: use a fresh browser context so accumulated download state
// from the long smoke scenario cannot mask whether one user-requested export works.
const projectDownloadContext = await browser.newContext({
  viewport: { width: 1100, height: 760 },
  acceptDownloads: true,
});
const projectDownloadPage = await projectDownloadContext.newPage();
const projectDownloadErrors = [];
projectDownloadPage.on('pageerror', (error) => projectDownloadErrors.push(error.message));
await projectDownloadPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
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

// Two tabs sharing one browser profile still have one autosave writer, but neither
// editor is frozen. The non-owner can keep working and explicitly take over saving.
const safetyContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const safetyFirst = await safetyContext.newPage();
const safetySecond = await safetyContext.newPage();
const safetyErrors = [];
for (const safetyPage of [safetyFirst, safetySecond]) {
  safetyPage.on('pageerror', (error) => safetyErrors.push(error.message));
  safetyPage.on('dialog', (dialog) => { safetyErrors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });
}
await safetyFirst.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await safetyFirst.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'true',
  null,
  { timeout: 30000 },
);
await safetySecond.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await safetySecond.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'false',
  null,
  { timeout: 30000 },
);
assert.equal(await safetySecond.locator('.workspace').evaluate((element) => element.inert), false);
assert.equal(await safetySecond.locator('#workspaceConflictDialog').isVisible(), true);
assert.match(await safetySecond.locator('#workspaceSaveStatus').textContent(), /autosave paused/i);

// A read-only tab may reset its in-memory workspace, but it must never delete
// or overwrite the current autosave owned by the other tab.
await safetyFirst.locator('#projectNameInput').fill('Owner survives read-only New');
await safetyFirst.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 5000 },
);
await openFunctionPanel(safetySecond, 'project');
await safetySecond.locator('#newProjectBtn').click();
await chooseConfirmation(safetySecond);
await safetySecond.waitForFunction(
  () => /New empty project/.test(document.getElementById('statusText')?.textContent || ''),
  null,
  { timeout: 5000 },
);
assert.equal(
  await safetyFirst.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('wafercad-workspace-v1', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result,
            transaction = database.transaction('workspace', 'readonly'),
            current = transaction.objectStore('workspace').get('current');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve(current.result?.project?.name ?? null);
          };
        };
      }),
  ),
  'Owner survives read-only New',
);
assert.equal(
  await safetySecond.locator('.workspace').getAttribute('data-autosave-owner'),
  'false',
);
assert.match(
  await safetySecond.locator('#workspaceSaveStatus').textContent(),
  /Unsaved changes · autosave paused/,
);

await safetySecond.locator('#workspaceTakeOverBtn').click();
await safetySecond.locator('#confirmationDialogOverlay:not([hidden])').waitFor();
assert.match(
  await safetySecond.locator('#confirmationDialogTitle').textContent(),
  /Workspace states differ/,
);
await chooseConfirmation(safetySecond, 'use-current');
await safetySecond.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'true',
  null,
  { timeout: 30000 },
);
await safetyFirst.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'false',
  null,
  { timeout: 30000 },
);
assert.equal(await safetyFirst.locator('.workspace').evaluate((element) => element.inert), false);
assert.equal(await safetyFirst.locator('#workspaceConflictDialog').isVisible(), true);
assert.deepEqual(safetyErrors, []);
await safetyContext.close();

assert.equal(await page.locator('#threeHost').getAttribute('data-render-error'), null);
assert.deepEqual(errors, []);
await browser.close();

// Core editor must still boot when the external Three.js CDN is unavailable.
const degradedBrowser = await chromium.launch(launchOptions);
const degradedContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
let blockedThreeRequests = 0;
await degradedContext.route('https://cdn.jsdelivr.net/**', (route) => {
  blockedThreeRequests++;
  return route.fulfill({ status: 503, body: '' });
});
const degraded = await degradedContext.newPage();
const degradedErrors = [];
degraded.on('pageerror', (error) => degradedErrors.push(error.message));
await degraded.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await degraded.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Ready. Create a base or import a layout.',
  null,
  { timeout: 30000 },
);
assert.ok(blockedThreeRequests > 0);
assert.equal(
  (await degraded.locator('#threeStats').textContent()).trim(),
  'dependency unavailable',
);
assert.match(
  await degraded.locator('#threeHost').textContent(),
  /Three\.js resources could not be loaded/,
);
assert.equal(await degraded.locator('#mainCanvas').count(), 1);
assert.equal(await degraded.locator('#maskCanvas').count(), 1);
assert.deepEqual(degradedErrors, []);
await degradedContext.close();

// A browser/environment that loads Three.js but cannot create WebGL must leave
// the 2D editor usable and replace the loading state with an explicit diagnosis.
const noWebGlContext = await degradedBrowser.newContext({
  viewport: { width: 1100, height: 760 },
});
await noWebGlContext.addInitScript(() => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
    return originalGetContext.call(this, type, ...args);
  };
});
const noWebGl = await noWebGlContext.newPage();
const noWebGlErrors = [];
noWebGl.on('pageerror', (error) => noWebGlErrors.push(error.message));
await noWebGl.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await noWebGl.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Ready. Create a base or import a layout.',
  null,
  { timeout: 30000 },
);
await noWebGl.waitForFunction(
  () => (document.getElementById('threeStats')?.textContent || '').trim() === 'WebGL unavailable',
  null,
  { timeout: 30000 },
);
assert.equal(await noWebGl.locator('#threeHost').getAttribute('data-three-unavailable-reason'), 'webgl');
assert.match(
  await noWebGl.locator('#threeHost').textContent(),
  /could not create a WebGL context/,
);
assert.equal(await noWebGl.locator('#threeHost').evaluate((node) => node.classList.contains('three-loading')), false);
assert.equal(await noWebGl.locator('#mainCanvas').count(), 1);
assert.equal(await noWebGl.locator('#maskCanvas').count(), 1);
assert.deepEqual(noWebGlErrors, []);
await noWebGlContext.close();
await degradedBrowser.close();

console.log('WaferCAD UI smoke: OK');
