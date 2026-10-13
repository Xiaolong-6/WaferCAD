import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function open(path, ui) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    (mode) =>
      mode === 'legacy'
        ? document.documentElement.dataset.appReady === 'true'
        : document.body.dataset.ready === 'true',
    ui,
    { timeout: 120000 },
  );
}

async function waitForSavedProject(expected) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const saved = await page.evaluate(async (expected) => {
      const storage = await import('/workspace-persistence.js');
      const project = await storage.loadWorkspaceState();
      const matches =
        project &&
        (expected.name
          ? project.name === expected.name
          : project.model.layers.length === expected.layers);
      return matches
        ? {
            name: project.name,
            model: project.model,
            branches: project.snapshotBranches.branches.length,
          }
        : null;
    }, expected);
    if (saved) return saved;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for workspace save: ${JSON.stringify(expected)}`);
}

async function waitForProjectName(name) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if ((await page.locator('#projectNameInput').inputValue()) === name) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for project name: ${name}`);
}

try {
  await open('/app-legacy.html?start=example&example=photodetector-literature', 'legacy');
  const fromLegacy = await waitForSavedProject({ layers: 6 });
  assert.equal(fromLegacy.model.layers.length, 6);
  assert.equal(fromLegacy.branches, 7);

  await open('/app.html', 'v2');
  const v2FirstLoad = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.deepEqual(
    v2FirstLoad.model,
    fromLegacy.model,
    'V2 restores Legacy geometry without drift',
  );
  assert.equal(v2FirstLoad.workflow.steps.length, 47, 'V2 restores Legacy History');
  assert.equal(v2FirstLoad.workflow.branches.length, 7, 'V2 restores all Legacy Variants');

  const v2Title = 'V2 cross-interface save';
  await page.locator('#projectNameInput').fill(v2Title);
  // The optional Legacy URL is no longer linked from v2. Save through
  // the visible Project action and verify persisted state before navigation.
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(() =>
    /Saved "V2 cross-interface save" locally/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || '',
    ),
  );
  const fromV2 = await waitForSavedProject({ name: v2Title });
  await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
  await open('/app-legacy.html', 'legacy');
  await waitForProjectName(v2Title);
  assert.deepEqual(fromV2.model, fromLegacy.model, 'V2 autosave preserves exact physical geometry');
  assert.equal(fromV2.branches, 7);

  const legacyTitle = 'Legacy cross-interface save';
  await page.locator('#projectNameInput').fill(legacyTitle);
  await waitForSavedProject({ name: legacyTitle });
  await open('/app.html', 'v2');
  const restoredInV2 = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(restoredInV2.projectName, legacyTitle);
  assert.deepEqual(restoredInV2.model, fromLegacy.model);
  assert.equal(restoredInV2.workflow.steps.length, 47);

  const stalePage = await context.newPage();
  stalePage.on('pageerror', (error) => errors.push(error.message));
  await stalePage.goto(`${base}/app-legacy.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await stalePage.waitForFunction(
    () => document.documentElement.dataset.appReady === 'true',
    null,
    {
      timeout: 120000,
    },
  );
  assert.equal(
    await stalePage.locator('.workspace').getAttribute('data-autosave-owner'),
    'false',
    'A simultaneous Legacy tab does not acquire the active v2 writer lease',
  );
  const primaryTitle = 'Active v2 writer';
  await page.locator('#projectNameInput').fill(primaryTitle);
  await waitForSavedProject({ name: primaryTitle });
  await stalePage.locator('#projectNameInput').fill('Stale tab must not save');
  for (let attempt = 0; attempt < 12; attempt++) {
    const savedName = await stalePage.evaluate(
      async () => (await (await import('/workspace-persistence.js')).loadWorkspaceState())?.name,
    );
    assert.equal(savedName, primaryTitle, 'A stale tab cannot overwrite the writer');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stalePage.close();
  const exitTitle = 'Protected reload with pending edits';
  await page.locator('#projectNameInput').fill(exitTitle);
  assert.equal(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ),
    false,
    'Pending structural edits prevent silent unload and start a final save',
  );
  await waitForSavedProject({ name: exitTitle });
  await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
  const reloaded = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(reloaded.projectName, exitTitle);
  assert.deepEqual(reloaded.model, fromLegacy.model);
  assert.equal(reloaded.workflow.steps.length, 47);
  assert.deepEqual(errors, [], 'Cross-interface and lease scenarios produce no page errors');
  console.log(
    'M5 cross-UI: Legacy → V2 → Legacy → V2 restores exact geometry, History and Variants PASS',
  );
} finally {
  await context.close();
  await browser.close();
}
