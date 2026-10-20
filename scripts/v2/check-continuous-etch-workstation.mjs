// Native, normal-origin Workstation acceptance for exact Continuous Etch.
// Exercises the real Process worker, History, IndexedDB save and reload.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';


const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/continuous-etch-workstation');
await mkdir(output, { recursive: true });
const report = { status: 'running', browserErrors: [] };
const browser = await launchBrowser();
let page;
try {
  report.chromiumVersion = browser.version();
  const { page: workstation, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 900 },
  });
  page = workstation;
  page.on('pageerror', (error) => report.browserErrors.push(error.message));
  try {
    await page.goto(`${base}/app.html?start=empty`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    assert.equal(initial.workflow.writable, true, 'The isolated tab must own its workspace');
    assert.equal(initial.workflow.steps.length, 0, 'Start with a clean process timeline');


    await page.locator('[data-action="domain:project"]').click();
    if (!(await page.locator('#baseWidth').isVisible())) {
      await page.getByRole('heading', { name: 'Base', exact: true }).click();
    }
    await page.locator('#v2BaseShape').selectOption('rect');
    await page.locator('#baseWidth').fill('20');
    await page.locator('#baseHeight').fill('20');
    await page.locator('#baseThickness').fill('10');
    await page.locator('#applyBaseBtn').click();
    const clearHistory = page.getByRole('button', { name: 'Clear history', exact: true });
    if (await clearHistory.isVisible()) await clearHistory.click();
    await page.waitForFunction(() => {
      const model = window.WaferCadV2Workstation.snapshot().model;
      return model.width === 20 && model.height === 20 && model.thickness === 10;
    });
    const source = await snapshot();
    const beforeSteps = source.workflow.steps.length;
    assert.equal(source.model.kernel, 'vector-2.5d-v1');


    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('etch');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#etchProfile').selectOption('continuous');
    await page.locator('#etchTargetLayer').selectOption('base');
    await page.locator('#continuousShape').selectOption('circular');
    await page.locator('#operationThickness').fill('2');
    assert.equal(await page.locator('#applyOperationBtn').isEnabled(), true);
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      (count) => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          !state.workflow.busy &&
          state.workflow.steps.length === count + 1 &&
          state.model.kernel === 'vector-continuous-etch-v1'
        );
      },
      beforeSteps,
      { timeout: 120000 },
    );
    const committed = await snapshot();
    const model = committed.model;
    assert.equal(model.continuousEtchOwner.fronts[0].shape, 'circular');
    assert.equal(model.continuousEtchOwner.fronts[0].lateralUm, 2);
    assert.equal(model.continuousEtchOwner.fronts[0].verticalUm, 2);
    // Sample across the source and release front, not just at the centre.
    // Front equality alone cannot prove the Process Worker removed the same
    // physical material when Recipe Run All rebuilds its starting Base.
    const witnesses = [];
    for (const x of [-8, -4, 0, 4, 8])
      for (const y of [-8, -4, 0, 4, 8])
        for (const z of [-4, -1, 0, 2, 3.5, 4, 4.8]) witnesses.push([x, y, z]);
    const physical = await page.evaluate(async (points) => {
      const { continuousModelMaterialAt, validateContinuousEtchModel } =
        await import('/continuous-etch-model.js');
      const model = window.WaferCadV2Workstation.snapshot().model;
      validateContinuousEtchModel(model);
      return {
        removedTop: continuousModelMaterialAt(model, [0, 0, 4]),
        retainedCore: continuousModelMaterialAt(model, [0, 0, 0]),
        grid: points.map((point) => continuousModelMaterialAt(model, point)),
      };
    }, witnesses);
    assert.equal(physical.removedTop, null);
    assert.equal(physical.retainedCore, 'base');
    report.physical = physical;
    await page.screenshot({ path: resolve(output, 'continuous-after-apply.png') });


    // A real Main rectangular ROI must keep the continuous 3D visible and
    // produce scientific cut faces. The Section must show the full physical-Z
    // profile instead of the generic wafer Z Break that hides curved release.
    await page.waitForFunction(
      () => document.querySelector('#sectionCanvas')?.dataset.sectionCollapseEnabled === 'false',
      null,
      { timeout: 30000 },
    );
    await page.locator('#mainPanel [data-action="roi"]').click();
    await page.locator('#mainRoiTools [aria-label="Rectangle"]').click();
    const mainBox = await page.locator('#mainCanvas').boundingBox();
    assert.ok(mainBox?.width > 100 && mainBox?.height > 100);
    const xa = mainBox.x + mainBox.width * 0.31;
    const ya = mainBox.y + mainBox.height * 0.28;
    await page.mouse.move(xa, ya);
    await page.mouse.down();
    await page.mouse.move(xa + mainBox.width * 0.35, ya + mainBox.height * 0.43, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      () => {
        const host = document.querySelector('#threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          host.dataset.continuousEtchRoi === 'rect-clipped' &&
          host.dataset.continuousEtchRoiMeshMode === 'geometry-clipped' &&
          Number(host.dataset.continuousEtchRoiMeshTriangles) > 0 &&
          Number(host.dataset.continuousEtchRoiCapTriangles) > 0 &&
          !host.dataset.rendererBuildFailure
        );
      },
      null,
      { timeout: 120000 },
    );
    const clipped = await snapshot();
    assert.deepEqual(clipped.model, model, '3D ROI remains strictly view-only');
    assert.equal(clipped.workflow.steps.length, committed.workflow.steps.length);
    report.roiCapTriangles = Number(
      await page.locator('#threeHost').getAttribute('data-continuous-etch-roi-cap-triangles'),
    );
    report.roiMeshTriangles = Number(
      await page.locator('#threeHost').getAttribute('data-continuous-etch-roi-mesh-triangles'),
    );
    await page.screenshot({ path: resolve(output, 'continuous-with-main-roi.png') });
    // The four-panel screenshot makes a broken cut easy to miss. Capture the
    // same actual 3D WebGL view maximized for independent visual review.
    await page.locator('#threePanel [data-action="maximize:three"]').click();
    await page.waitForFunction(
      () => document.querySelector('#threeHost canvas')?.getBoundingClientRect().width > 800,
      null,
      { timeout: 30000 },
    );
    await page.screenshot({ path: resolve(output, 'continuous-roi-three-maximized.png') });
    await page.locator('#threePanel [data-action="maximize:three"]').click();


    await page.locator('[data-action="domain:history"]').click();
    await page.locator('#undoBtn').click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().model.kernel === 'vector-2.5d-v1',
      null,
      { timeout: 30000 },
    );
    assert.deepEqual((await snapshot()).model, source.model, 'Undo restores exact predecessor');
    await page.locator('#redoBtn').click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().model.kernel === 'vector-continuous-etch-v1',
      null,
      { timeout: 30000 },
    );
    assert.deepEqual((await snapshot()).model, model, 'Redo restores the exact analytic owner');


    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectNameInput').fill('Continuous Etch transaction acceptance');
    await page.locator('#saveProjectBtn').click();
    // Save is a two-phase transaction: the current workspace must commit and
    // the Recovery checkpoint must be durable before the UI announces success.
    // Polling IDB directly while that transaction is in flight can race with
    // browser storage replacement. Wait for the public completion contract.
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-slot="status.message"]')?.textContent || '').includes(
          'Saved "Continuous Etch transaction acceptance" locally',
        ),
      null,
      { timeout: 30000 },
    );
    report.saveStatus = await page.locator('[data-slot="status.message"]').textContent();
    const persisted = await page.evaluate(async () =>
      (await import('/workspace-persistence.js')).loadWorkspaceState(),
    );
    assert.ok(persisted, 'Save must retain an IndexedDB current project after checkpoint');
    assert.deepEqual(persisted.model, model, 'IndexedDB stores exact analytic geometry');
    report.savedSteps = committed.workflow.steps.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(restored.model, model, 'Reload recovers exact physical owner');
    assert.equal(restored.workflow.steps.length, committed.workflow.steps.length);
    assert.equal(restored.projectName, 'Continuous Etch transaction acceptance');


    // Recipe Run All must use the same exact front as a manual Process Apply.
    // This replays from a real rebuilt Base, never substituting legacy N-band Etch.
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('[data-action="process-mode:recipe"]').click();
    await page.locator('#recipeCodeTab').click();
    await page
      .locator('#recipeCodeEditor')
      .fill(
        'etch({ target: "Base", depth: "2 µm", profile: "continuous", shape: "circular", face: "front", area: "full" });',
      );
    await page.locator('#recipeApplyCodeBtn').click();
    assert.doesNotMatch(await page.locator('#recipeValidation').innerText(), /✕/);
    await page.locator('#recipeRunStart').selectOption('new-base');
    assert.doesNotMatch(await page.locator('#recipeValidation').innerText(), /✕/);
    await page.locator('#recipeRunAllBtn').click();
    await page.getByRole('button', { name: 'Clear history', exact: true }).click({
      timeout: 30000,
    });
    await page.waitForFunction(
      () => {
        const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
        return /^(Completed|Failed|Stopped):/.test(summary);
      },
      null,
      { timeout: 120000 },
    );
    report.recipeSummary = (await page.locator('#recipeRunSummary').innerText()).trim();
    assert.match(report.recipeSummary, /^Completed: 1\/1 steps committed/);
    const recipeReplayed = (await snapshot()).model;
    assert.equal(recipeReplayed.kernel, 'vector-continuous-etch-v1');
    assert.deepEqual(
      recipeReplayed.continuousEtchOwner.fronts,
      model.continuousEtchOwner.fronts,
      'Run All must preserve the same exact analytic release, not a sampled surrogate',
    );
    const reference = model.continuousEtchOwner.sourceModel;
    const replayedSource = recipeReplayed.continuousEtchOwner.sourceModel;
    for (const key of ['shape', 'width', 'height', 'thickness', 'boundary', 'regions'])
      assert.deepEqual(
        replayedSource[key],
        reference[key],
        `Run All starting Base differs in physical source field ${key}`,
      );
    const recipePhysical = await page.evaluate(async (points) => {
      const { continuousModelMaterialAt, validateContinuousEtchModel } =
        await import('/continuous-etch-model.js');
      const current = window.WaferCadV2Workstation.snapshot().model;
      validateContinuousEtchModel(current);
      return {
        removedTop: continuousModelMaterialAt(current, [0, 0, 4]),
        retainedCore: continuousModelMaterialAt(current, [0, 0, 0]),
        grid: points.map((point) => continuousModelMaterialAt(current, point)),
      };
    }, witnesses);
    assert.deepEqual(recipePhysical, physical, 'Recipe and manual Apply must agree on material');
    report.recipeMaterialWitnessCount = witnesses.length;
    await page.screenshot({ path: resolve(output, 'continuous-after-recipe-runall.png') });
    assert.deepEqual(report.browserErrors, []);
    report.status = 'pass';
    console.log('Continuous Etch Workstation: Process/ROI/History/Recovery/Recipe Run All PASS');
  } catch (error) {
    report.uiStatus = await page
      .locator('[data-slot="status.message"]')
      .textContent()
      .catch(() => null);
    await page.screenshot({ path: resolve(output, 'continuous-failure.png') }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
} catch (error) {
  report.status = 'failed';
  report.failure = String(error.stack || error);
  if (page) {
    try {
      await page.screenshot({ path: resolve(output, 'continuous-failure.png') });
    } catch {
      // The capture is supplementary; the original failure remains authoritative.
    }
  }
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}