// Real WaferCAD UI acceptance: import paper-derived Metalens project,
// rebuild every Step from clean Base using its captured file Mask, then export.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { buildMetalensLocal } from './build-tio2-metalens-example.mjs';
import { exportCurrentProject, loadProject } from './test-helpers/product-scientific.mjs';
import {
  baseUrl,
  chooseConfirmation,
  launchBrowser,
  newUiContext,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForThreeReady,
  canvasInkFraction,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();
const context = await newUiContext(browser, {
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = observePageErrors(page);
try {
  const { project } = await buildMetalensLocal();
  const { pointInMulti } = await import('../site/vector-geometry.js');
  await page.goto(baseUrl + '/app.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForAppReady(page);
  await loadProject(page, project, 'TiO2-metalens-four-unit');
  await openFunctionPanel(page, 'process');
  await page.locator('[data-process-input-mode="recipe"]').click();
  const rows = page.locator('.recipe-step-row');
  assert.equal(await rows.count(), project.processRecipe.steps.length);
  await page.locator('#recipeRunStart').selectOption('new-base');
  const errorText = await page.locator('#recipeValidation').innerText();
  assert.doesNotMatch(errorText, /✕|material.*missing|mask.*missing/i);
  await page.locator('#recipeRunAllBtn').click();
  await chooseConfirmation(page, 'clear');
  await page.waitForFunction(
    () => {
      const summary = document.getElementById('recipeRunSummary')?.textContent || '';
      return /^(Completed|Failed|Stopped):/.test(summary);
    },
    null,
    { timeout: 180000 },
  );
  const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
  assert.match(
    summary,
    /^Completed: 9\/9 steps committed/,
    'Failed to rebuild from Base: ' + summary,
  );
  const rebuilt = await exportCurrentProject(page, 120000);
  assert.equal(rebuilt.snapshotBranches.branches.length, 1);
  assert.ok(rebuilt.snapshotBranches.nodes.length >= 9);
  assert.equal(rebuilt.processRecipe.steps.length, 9);
  const sample = (model, position) => {
    const region = model.regions.find((r) => pointInMulti(position, r.geom));
    return region?.stack?.map((s) => model.layers.find((l) => l.id === s.layerId)?.name) || [];
  };
  for (const xy of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [-1.1 + 0.135, 1.1],
    [1.1, 1.1],
    [1.1 + 0.078, 1.1],
    [0, 0],
  ]) {
    assert.deepEqual(
      sample(rebuilt.model, xy),
      sample(project.model, xy),
      'Run All differs at probe ' + JSON.stringify(xy),
    );
  }
  await mkdir('test-results/metalens', { recursive: true });
  await writeFile(
    'test-results/metalens/runall-browser-report.json',
    JSON.stringify(
      {
        pass: true,
        summary,
        historyNodes: rebuilt.snapshotBranches.nodes.length,
        sections: 'Process UI and project export verified',
        probes: 7,
      },
      null,
      2,
    ) + '\n',
  );
  await page.screenshot({ path: 'test-results/metalens/recipe-runall-actual.png' });
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  console.log('TiO2 Metalens local Recipe Run All SUCCESS: ' + summary);

  // Open from the real Welcome card, not only by importing a test fixture.
  // This exercises the registered example id, bundled asset, startup,
  // persistent Recipe, and History in the same route used by end users.
  const welcomeContext = await newUiContext(browser, {
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  try {
    const welcomePage = await welcomeContext.newPage();
    const welcomeErrors = observePageErrors(welcomePage);
    const welcomeStart = performance.now();
    await welcomePage.goto(baseUrl + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const exampleCard = welcomePage.locator(
      '.welcome-example-card[data-example-id="tio2-metalens-four-unit"]',
    );
    await exampleCard.waitFor({ state: 'visible', timeout: 30000 });
    await exampleCard.locator('.welcome-example-title-link').click();
    await waitForAppReady(welcomePage);
    await welcomePage.waitForFunction(
      () => /Opened .*\.wafercad\./.test(document.getElementById('statusText')?.textContent || ''),
      null,
      { timeout: 180000 },
    );
    const loadedMs = Math.round(performance.now() - welcomeStart);
    // Large scenes finish asynchronously after the import status changes.
    // Exercise Project actions only after the visible frame has completed.
    await waitForThreeReady(welcomePage, 180000);
    const frameReadyMs = Math.round(performance.now() - welcomeStart);
    const opened = await exportCurrentProject(welcomePage, 180000);
    assert.equal(opened.processRecipe.steps.length, 9, 'Welcome lost Recipe');
    assert.equal(opened.snapshotBranches.nodes.length, 10, 'Welcome lost full History');
    const { readProjectFile } = await import('../site/project-io.js');
    const source = await readFile(
      new URL('../site/examples/tio2-metalens-full-array.wafercad', import.meta.url),
    );
    const expected = await readProjectFile({
      size: source.length,
      text: async () => source.toString('utf8'),
    });
    assert.equal(opened.model.kernel, 'vector-2.5d-array-v1');
    assert.equal(opened.model.width, 30);
    assert.equal(opened.model.array.instances.length, 6400);
    assert.equal(
      opened.model.array.instances.filter((instance) => instance.role === 'device').length,
      4725,
    );
    assert.equal(opened.layout.root, 'TIO2_GRID');
    assert.equal(opened.layout.elements.length, 60232);
    assert.equal(opened.snapshots.length, 6);
    assert.deepEqual(
      opened.model,
      expected.model,
      'Welcome/export changed full-array physical geometry',
    );
    assert.deepEqual(opened.layout, expected.layout, 'Welcome/export changed matching Mask');
    assert.deepEqual(opened.processRecipe, expected.processRecipe, 'Welcome/export changed Recipe');
    assert.deepEqual(opened.snapshots, expected.snapshots, 'Welcome/export changed bookmarks');
    assert.deepEqual(
      opened.snapshotBranches.nodes,
      expected.snapshotBranches.nodes,
      'Welcome/export changed complete History restore states',
    );
    // Scientific views must actually render the reconstructed material stack.
    // A valid data model with a blank or stale canvas is a product regression.
    await waitForThreeReady(welcomePage, 90000);
    await welcomePage.waitForFunction(
      () => {
        const canvas = document.getElementById('sectionCanvas');
        return Boolean(canvas && canvas.width > 100 && canvas.height > 100);
      },
      null,
      { timeout: 30000 },
    );
    const visual = await welcomePage.evaluate(() => {
      const section = document.getElementById('sectionCanvas');
      const three = document.querySelector('#threeHost canvas');
      const host = document.getElementById('threeHost');
      const panel = document.getElementById('sectionPanel');
      return {
        sectionWidth: section.width,
        sectionHeight: section.height,
        threeWidth: three?.width || 0,
        threeHeight: three?.height || 0,
        threeState: host?.dataset.renderState || '',
        sectionDisplayed: panel?.getBoundingClientRect().width > 100,
      };
    });
    assert.ok(visual.sectionDisplayed, 'Section panel must remain visible');
    assert.ok(visual.sectionWidth > 100 && visual.sectionHeight > 100);
    assert.ok(visual.threeWidth > 100 && visual.threeHeight > 100);
    assert.equal(visual.threeState, 'ready');
    const sectionInk = await canvasInkFraction(welcomePage, '#sectionCanvas');
    assert.ok(sectionInk > 0.02, 'Section canvas must not be blank: ' + sectionInk);
    await welcomePage.locator('#sectionPanel').screenshot({
      path: 'test-results/metalens/metalens-final-section.png',
    });
    await welcomePage.locator('#threePanel').screenshot({
      path: 'test-results/metalens/metalens-final-three.png',
    });
    await writeFile(
      'test-results/metalens/visual-browser-report.json',
      JSON.stringify({ pass: true, loadedMs, frameReadyMs, ...visual, sectionInk }, null, 2) + '\n',
    );
    await welcomePage.screenshot({
      path: 'test-results/metalens/welcome-opened-project.png',
    });
    assert.deepEqual(welcomeErrors, []);
    console.log(
      'TiO2 Metalens Welcome opens 4725 sites, matching Mask, 9-Step Recipe and 10 compiled History nodes.',
    );
  } finally {
    await welcomeContext.close();
  }
} finally {
  await context.close();
  await browser.close();
}
