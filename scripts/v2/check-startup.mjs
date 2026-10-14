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

async function snapshot() {
  return page.evaluate(() => window.WaferCadV2Workstation.snapshot());
}

try {
  await open('/app.html');
  let state = await snapshot();
  assert.equal(state.source, 'empty', 'No start intent initializes a blank workspace');
  assert.equal(state.model.layers.length, 1, 'A new project contains only its Base');
  assert.equal(state.workflow.steps.length, 0);
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
  );

  await page.goto(`${base}/index.html`);
  const exampleCard = page.locator('[data-example-id="photodetector-literature"]');
  await exampleCard.locator('[data-preview-view="main"]').click();
  await exampleCard.locator('.welcome-example-project-preview.ready').waitFor({ timeout: 120000 });
  const preview = await (await exampleCard.locator('iframe').elementHandle()).contentFrame();
  assert.match(preview.url(), /\/app\.html\?preview=1/);
  await preview.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
  );
  assert.equal(
    await preview.evaluate(() => window.WaferCadV2Workstation.snapshot().workflow.writable),
    false,
    'Welcome read-only preview does not become the workspace writer',
  );
  await exampleCard.locator('[data-preview-view="mask"]').click();
  await preview.waitForFunction(() => window.WaferCadV2Workstation?.snapshot().ui.view === 'mask');
  await exampleCard.locator('.welcome-example-title-link').click();
  await page.waitForURL('**/app.html*');
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  state = await snapshot();
  assert.match(state.source, /photodetector-literature-examples\.wafercad$/);
  assert.equal(state.workflow.steps.length, 47);
  assert.equal(state.workflow.branches.length, 7);
  assert.ok(state.hash);
  assert.equal(
    new URL(page.url()).searchParams.has('start'),
    false,
    'Successful start is consumed',
  );
  const savedLayers = state.model.layers.length;
  const savedSteps = state.workflow.steps.length;
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
  );

  await open('/app.html');
  state = await snapshot();
  assert.equal(state.model.layers.length, savedLayers, 'No intent restores the saved model');
  assert.equal(state.workflow.steps.length, savedSteps, 'No intent restores History');

  await open('/app.html?start=example&example=not-a-real-example');
  state = await snapshot();
  assert.equal(state.model.layers.length, savedLayers, 'Invalid start preserves the saved model');
  assert.equal(state.workflow.steps.length, savedSteps, 'Invalid start preserves History');

  await open('/app.html?start=');
  state = await snapshot();
  assert.equal(
    state.model.layers.length,
    savedLayers,
    'Empty start parameter preserves the saved model',
  );
  assert.equal(state.workflow.steps.length, savedSteps, 'Empty start parameter preserves History');

  await open('/app.html?start=empty');
  state = await snapshot();
  assert.equal(
    state.model.layers.length,
    1,
    'Explicit Empty replaces the saved example after checkpoint',
  );
  assert.equal(state.workflow.steps.length, 0);
  assert.equal(state.projectName, 'Untitled');
  assert.equal(new URL(page.url()).searchParams.has('start'), false);
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
  );

  await page.evaluate(async () => {
    const { stageStartupFile } = await import('/startup-file.js');
    await stageStartupFile(new File(['not a WaferCAD project'], 'invalid.wafercad'), 'project');
  });
  await open('/app.html?start=staged');
  state = await snapshot();
  assert.equal(state.model.layers.length, 1, 'Failed staged import preserves the saved model');
  assert.equal(state.workflow.steps.length, 0);
  assert.equal(
    await page.evaluate(async () =>
      Boolean(await (await import('/startup-file.js')).readStartupFile()),
    ),
    true,
    'Failed staged import remains available for retry',
  );

  const stagedProject = await page.evaluate(async () => {
    const response = await fetch('/examples/photodetector-literature-examples.wafercad');
    const bytes = await response.arrayBuffer();
    const { stageStartupFile } = await import('/startup-file.js');
    await stageStartupFile(new File([bytes], 'staged-photodetector.wafercad'), 'project');
    return true;
  });
  assert.equal(stagedProject, true);
  await open('/app.html?start=staged');
  state = await snapshot();
  assert.equal(state.model.layers.length, 6, 'Staged project imports the complete model');
  assert.equal(state.workflow.steps.length, 47, 'Staged project preserves History');
  assert.equal(
    await page.evaluate(async () =>
      Boolean(await (await import('/startup-file.js')).readStartupFile()),
    ),
    false,
    'Successful staged import consumes its temporary copy',
  );
  console.log(
    `Staged project autosave: writable=${state.workflow.writable} dirty=${state.workflow.dirty} layers=${state.model.layers.length}`,
  );
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
  );

  for (const filename of ['gds-basic-instances.gds', 'oas-rectangles.oas']) {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.documentElement.dataset.welcomeReady === 'true');
    await page.locator('#welcomeLayoutInput').setInputFiles(`site/samples/klayout/${filename}`);
    await page.waitForURL('**/app.html*');
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    state = await snapshot();
    const importedLayout = await page.evaluate(
      () => window.WaferCadV2Workstation.snapshot().layout,
    );
    assert.equal(importedLayout.name, filename, `${filename} is routed through the layout worker`);
    assert.ok(importedLayout.elements.length > 0, `${filename} produces real Mask geometry`);
    assert.equal(state.model.layers.length, 1, 'Staged layout starts a clean Base workspace');
    if (filename === 'gds-basic-instances.gds') {
      const recovery = await page.evaluate(async () => {
        const storage = await import('/workspace-persistence.js');
        const points = await storage.listWorkspaceRecoveryPoints();
        const newest = points[0] && (await storage.loadWorkspaceRecoveryPoint(points[0].key));
        return newest
          ? {
              points: points.length,
              layers: newest.model.layers.length,
              steps: newest.snapshotBranches?.nodes.length || newest.snapshots.length,
              branches: newest.snapshotBranches?.branches.length || 0,
            }
          : null;
      });
      assert.ok(recovery, 'Replacing a saved workspace creates a Recovery point');
      assert.equal(recovery.layers, 6, 'Recovery contains the displaced physical model');
      assert.equal(recovery.steps, 47, 'Recovery contains the displaced History');
      assert.equal(recovery.branches, 7, 'Recovery contains every Variant');
    }
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
  }

  assert.deepEqual(errors, [], 'Startup scenarios produce no uncaught page errors');
  console.log(
    'M5 startup: no-intent restore, Empty, full Example, invalid-intent safety, staged Project, GDS and OAS PASS',
  );
} finally {
  await context.close();
  await browser.close();
}
