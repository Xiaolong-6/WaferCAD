// Retirement parity: v2 Example → Save → Reload → competing v2 writer → Recovery.
// Historical Legacy file decoding remains owned by check-legacy-project-recovery.mjs.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
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
  await open('/app.html?start=example&example=photodetector-literature');
  const fromExample = await waitForSavedProject({ layers: 6 });
  assert.equal(fromExample.model.layers.length, 6);
  assert.equal(fromExample.branches, 7);
  const example = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(example.workflow.steps.length, 47);
  assert.equal(example.workflow.branches.length, 7);

  await open('/app.html');
  const v2FirstLoad = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.deepEqual(
    v2FirstLoad.model,
    fromExample.model,
    'V2 restores the complete saved Example geometry without drift',
  );
  assert.equal(v2FirstLoad.workflow.steps.length, 47, 'V2 reload restores complete History');
  assert.equal(v2FirstLoad.workflow.branches.length, 7, 'V2 reload restores all Variants');

  const v2Title = 'V2 session save';
  await page.locator('#projectNameInput').fill(v2Title);
  // Save through the visible Project action and verify the committed state
  // before a new independent v2 session reads it.
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(() =>
    /Saved "V2 session save" locally/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || '',
    ),
  );
  const fromV2 = await waitForSavedProject({ name: v2Title });
  await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
  await open('/app.html');
  await waitForProjectName(v2Title);
  assert.deepEqual(fromV2.model, fromExample.model, 'V2 Save preserves exact physical geometry');
  assert.equal(fromV2.branches, 7);

  const secondTitle = 'V2 second-session save';
  await page.locator('#projectNameInput').fill(secondTitle);
  await waitForSavedProject({ name: secondTitle });
  await open('/app.html');
  const restoredInV2 = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(restoredInV2.projectName, secondTitle);
  assert.deepEqual(restoredInV2.model, fromExample.model);
  assert.equal(restoredInV2.workflow.steps.length, 47);

  const stalePage = await context.newPage();
  stalePage.on('pageerror', (error) => errors.push(error.message));
  await stalePage.goto(`${base}/app.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await stalePage.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  const nonOwner = await stalePage.evaluate(() => window.WaferCadV2Workstation.snapshot());
  assert.equal(nonOwner.workflow.writable, false, 'A second v2 tab cannot steal the writer lease');
  assert.deepEqual(nonOwner.model, restoredInV2.model);
  assert.deepEqual(nonOwner.workflow.steps, restoredInV2.workflow.steps);
  assert.deepEqual(nonOwner.workflow.branches, restoredInV2.workflow.branches);
  const primaryTitle = 'Active v2 writer';
  await page.locator('#projectNameInput').fill(primaryTitle);
  await waitForSavedProject({ name: primaryTitle });
  await stalePage.locator('[data-action="domain:project"]').click();
  await stalePage.locator('#projectNameInput').fill('Stale tab must not save');
  await stalePage.locator('#saveProjectBtn').click();
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
  assert.deepEqual(reloaded.model, fromExample.model);
  assert.equal(reloaded.workflow.steps.length, 47);
  // Replacing the active workspace must checkpoint the last committed
  // model and its complete 47-Step / seven-Variant graph for Recovery.
  await open('/app.html?start=empty');
  const recovery = await page.evaluate(async (name) => {
    const storage = await import('/workspace-persistence.js');
    for (const point of await storage.listWorkspaceRecoveryPoints()) {
      const saved = await storage.loadWorkspaceRecoveryPoint(point.key);
      if (saved?.name === name) {
        return {
          model: saved.model,
          steps: saved.snapshotBranches?.nodes?.length || 0,
          branches: saved.snapshotBranches?.branches?.length || 0,
        };
      }
    }
    return null;
  }, exitTitle);
  assert.ok(recovery, 'Replacing the v2 project creates a Recovery checkpoint');
  assert.deepEqual(recovery.model, fromExample.model);
  assert.equal(recovery.steps, 47);
  assert.equal(recovery.branches, 7);
  assert.deepEqual(errors, [], 'v2 session and lease scenarios produce no page errors');
  console.log('M5 v2 session: 47 Steps, seven Variants, stale writer and Recovery PASS');
} finally {
  await context.close();
  await browser.close();
}
