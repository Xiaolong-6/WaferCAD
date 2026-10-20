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
    const physical = await page.evaluate(async () => {
      const { continuousModelMaterialAt, validateContinuousEtchModel } =
        await import('/continuous-etch-model.js');
      const model = window.WaferCadV2Workstation.snapshot().model;
      validateContinuousEtchModel(model);
      return {
        removedTop: continuousModelMaterialAt(model, [0, 0, 4]),
        retainedCore: continuousModelMaterialAt(model, [0, 0, 0]),
      };
    });
    assert.equal(physical.removedTop, null);
    assert.equal(physical.retainedCore, 'base');
    report.physical = physical;
    await page.screenshot({ path: resolve(output, 'continuous-after-apply.png') });

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
    assert.deepEqual(report.browserErrors, []);
    report.status = 'pass';
    console.log('Continuous Etch Workstation: Process Worker, History, IndexedDB and reload PASS');
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
