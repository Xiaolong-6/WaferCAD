import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  baseUrl,
  canvasInkFraction,
  chooseConfirmation,
  gotoWelcome,
  launchBrowser,
  newUiContext,
  newUiPage,
  openFunctionPanel,
  waitForAppReady,
} from './test-helpers/ui.mjs';

await loadGeometryKernel();
const { createModel } = await import('../site/model.js');

const welcomeLayoutBuffer = await readFile(
  new URL('../site/samples/klayout/oas-rectangles.oas', import.meta.url),
);
const welcomeProject = projectForBenchmark({
  model: createModel({
    shape: 'rect',
    width: 4321,
    height: 3210,
    thickness: 7,
  }),
  section: { a: [-1000, 0], b: [1000, 0] },
});

const browser = await launchBrowser();
const { page, context: mainContext } = await newUiPage(browser, {
  viewport: { width: 1365, height: 900 },
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => {
  errors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`);
  void dialog.dismiss();
});

await page.goto(`${baseUrl.replace(/\/$/, '')}/app.html`, {
  waitUntil: 'networkidle',
  timeout: 30000,
});
await waitForAppReady(page);
await page.waitForFunction(
  () => document.querySelector('.workspace')?.dataset.autosaveOwner === 'true',
  null,
  { timeout: 30000 },
);

// Legacy autosaves must migrate before validation blocks the recovery checkpoint.
const legacyContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
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
await gotoWelcome(legacyPage);
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

// Autosave must not serialize a large workspace while the user is actively
// dragging the 3D camera. A pending dirty save is held until pointer release.
const interactionAutosaveContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
const interactionAutosavePage = await interactionAutosaveContext.newPage();
const interactionAutosaveErrors = [];
interactionAutosavePage.on('pageerror', (error) => interactionAutosaveErrors.push(error.message));
await gotoWelcome(interactionAutosavePage);
await interactionAutosavePage.locator('#welcomeProjectInput').setInputFiles({
  name: 'interaction-autosave-base.wafercad',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(welcomeProject)),
});
await interactionAutosavePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await interactionAutosavePage.waitForFunction(
  () => document.documentElement.dataset.appReady === 'true',
  null,
  { timeout: 30000 },
);
await interactionAutosavePage.waitForFunction(
  () => document.querySelector('#threeHost canvas'),
  null,
  { timeout: 30000 },
);
await interactionAutosavePage.evaluate(() => {
  const input = document.getElementById('maskOpacityRange');
  input.value = '0.55';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await interactionAutosavePage.waitForFunction(
  () => /Unsaved changes/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 3000 },
);
await interactionAutosavePage.evaluate(() => {
  const target = document.getElementById('threeHost');
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    }),
  );
});
await interactionAutosavePage.waitForTimeout(2300);
assert.match(
  await interactionAutosavePage.locator('#workspaceSaveStatus').textContent(),
  /Unsaved changes/,
);
await interactionAutosavePage.evaluate(() => {
  window.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
    }),
  );
});
await interactionAutosavePage.waitForFunction(
  () => /Saved locally/.test(document.getElementById('workspaceSaveStatus')?.textContent || ''),
  null,
  { timeout: 8000 },
);
assert.deepEqual(interactionAutosaveErrors, []);
await interactionAutosaveContext.close();

const { page: refreshPage, context: refreshContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
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
await refreshContext.close();

// Welcome-page layout import must survive the IndexedDB handoff and open in the workspace.
const { page: layoutHandoffPage, context: layoutHandoffContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const layoutHandoffErrors = [];
layoutHandoffPage.on('pageerror', (error) => layoutHandoffErrors.push(error.message));
await gotoWelcome(layoutHandoffPage);
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
await layoutHandoffContext.close();

// Welcome-page project opening uses the same staged-file path and restores physical geometry.
const { page: projectHandoffPage, context: projectHandoffContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const projectHandoffErrors = [];
projectHandoffPage.on('pageerror', (error) => projectHandoffErrors.push(error.message));
await gotoWelcome(projectHandoffPage);
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
await projectHandoffContext.close();

// A Welcome explicit start must checkpoint an existing autosaved workspace before
// replacing it, and that checkpoint must be actually restorable.
const welcomeCheckpointContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
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
await gotoWelcome(welcomeCheckpointPage);
await welcomeCheckpointPage
  .locator('.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-open')
  .click();
await welcomeCheckpointPage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await welcomeCheckpointPage.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '') === 'Opened photodetector-literature-examples.wafercad.',
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
  'Photodetector example Section A–B rendered blank',
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
const failedWelcomeContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
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
await gotoWelcome(failedWelcomePage);
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
const { page: examplePage, context: exampleContext } = await newUiPage(browser, {
  viewport: { width: 1100, height: 760 },
});
const exampleErrors = [];
examplePage.on('pageerror', (error) => exampleErrors.push(error.message));
examplePage.on('dialog', (dialog) => { exampleErrors.push(`Unexpected native dialog: ${dialog.type()} ${dialog.message()}`); void dialog.dismiss(); });
await gotoWelcome(examplePage);
await examplePage
  .locator('.welcome-example-card[data-example-id="photodetector-literature"] .welcome-example-open')
  .click();
await examplePage.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
await examplePage.waitForFunction(
  () =>
    (document.getElementById('statusText')?.textContent || '') ===
    'Opened photodetector-literature-examples.wafercad.',
  null,
  { timeout: 30000 },
);
assert.equal(
  await examplePage.locator('.workspace').evaluate((element) => element.inert),
  false,
);
assert.ok(['nm', 'um', 'mm'].includes(await examplePage.locator('#xyUnitSelect').inputValue()));
assert.ok(Number(await examplePage.locator('#baseWidth').inputValue()) > 0);
assert.ok(await examplePage.locator('#layerLegend .legend-row').count());
assert.ok(Number(await examplePage.locator('#baseThickness').inputValue()) > 0);
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
await exampleContext.close();

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

// Two tabs sharing one browser profile still have one autosave writer, but neither
// editor is frozen. The non-owner can keep working and explicitly take over saving.
const safetyContext = await newUiContext(browser, { viewport: { width: 1100, height: 760 } });
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

assert.deepEqual(errors, []);
await mainContext.close();
await browser.close();
console.log('WaferCAD persistence regression: OK');
