// Production v2 Base, Manual and typed Recipe sub-nanometre scientific unit contract.
// A fresh browser context for each display unit prevents autosave cross-talk.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
import { readProjectFile } from '../../site/project-io.js';

await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-physical-process');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = { result: 'running', cases: [] };
const baseDimensions = { width: 4.0001, height: 3.0002, thickness: 2.0003 };
const manualThickness = 0.0004;
const recipeThickness = 0.00035;
const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-11,
    label + ': requested ' + expected + ' µm, got ' + actual + ' µm',
  );
const physicalFilms = (model, name) => {
  const layer = model.layers.find((item) => item.name === name);
  assert.ok(layer, 'Missing physical layer ' + name);
  const segments = model.regions.flatMap((region) =>
    region.stack.filter((item) => item.layerId === layer.id),
  );
  assert.ok(segments.length, name + ' must have actual kernel Z segments');
  return segments.map((segment) => segment.z1 - segment.z0);
};

try {
  for (const [displayUnit, factor] of [
    ['um', 1],
    ['nm', 1000],
    ['mm', 0.001],
  ]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base + '/app.html?start=empty');
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const initial = await snapshot();
      await page.locator('#xyUnitSelect').selectOption(displayUnit);
      assert.deepEqual(
        (await snapshot()).model,
        initial.model,
        'Selecting ' + displayUnit + ' cannot mutate canonical Base',
      );
      const baseWidth = page.locator('#baseWidth');
      if (!(await baseWidth.isVisible())) {
        await page.getByRole('heading', { name: 'Base', exact: true }).click();
      }
      // Production UI v2 exposes the Shape select. The legacy segmented
      // buttons are deliberately hidden and are only its controller bridge.
      // Selecting Rectangle enables an independently editable Base height.
      await page.locator('#v2BaseShape').selectOption('rect');
      assert.equal(await page.locator('#baseHeight').isVisible(), true);
      assert.equal(await page.locator('#baseHeight').isEnabled(), true);
      for (const [id, value] of Object.entries({
        baseWidth: baseDimensions.width,
        baseHeight: baseDimensions.height,
        baseThickness: baseDimensions.thickness,
      })) {
        await page.locator('#' + id).fill(String(value * factor));
      }
      await page.locator('#applyBaseBtn').click();
      await page.waitForFunction(
        (width) => window.WaferCadV2Workstation.snapshot().model.width === width,
        baseDimensions.width,
        { timeout: 120000 },
      );
      const based = await snapshot();
      for (const [key, value] of Object.entries(baseDimensions))
        near(based.model[key], value, displayUnit + ' Base ' + key);
      report.cases.push(displayUnit + ':base-physical');

      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#faceToggleBtn').selectOption('front');
      await page.locator('#layerName').fill('M4 manual film');
      await page.locator('#operationThickness').fill(String(manualThickness * factor));
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        () =>
          window.WaferCadV2Workstation.snapshot().workflow.steps.length === 1 &&
          !window.WaferCadV2Workstation.snapshot().workflow.busy,
        null,
        { timeout: 120000 },
      );
      const afterManual = await snapshot();
      physicalFilms(afterManual.model, 'M4 manual film').forEach((value) =>
        near(value, manualThickness, displayUnit + ' Manual film Z'),
      );
      assert.equal(afterManual.workflow.steps.length, 1);
      // In UI v2 the canonical model Undo/Redo buttons live in History;
      // Process displays independent "Undo form edit" draft controls.
      await page.locator('[data-action="domain:history"]').click();
      await page.locator('#undoBtn').click();
      await page.waitForFunction(
        (expected) => window.WaferCadV2Workstation.snapshot().model.layers.length === expected,
        based.model.layers.length,
      );
      assert.deepEqual(
        (await snapshot()).model,
        based.model,
        displayUnit + ' Manual Undo restores Base geometry',
      );
      await page.locator('#redoBtn').click();
      await page.waitForFunction(
        (expected) => window.WaferCadV2Workstation.snapshot().model.layers.length === expected,
        afterManual.model.layers.length,
      );
      assert.deepEqual(
        (await snapshot()).model,
        afterManual.model,
        displayUnit + ' Manual Redo restores exact physical film',
      );
      report.cases.push(displayUnit + ':manual-undo-redo');

      await page.locator('[data-action="domain:process"]').click();
      await page.locator('[data-action="process-mode:code"]').click();
      await page
        .locator('#recipeCodeEditor')
        .fill('deposit({ material: "M4 typed film", thickness: "0.35 nm", area: "full" });');
      await page.locator('#recipeApplyCodeBtn').click();
      await page.locator('#recipeRunAllBtn').click();
      const continuation = page.getByRole('button', {
        name: 'Continue and apply',
        exact: true,
      });
      await continuation.waitFor({ state: 'visible', timeout: 15000 });
      await continuation.click();
      await page.waitForFunction(
        () =>
          /Recipe completed: 1\/1/.test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        null,
        { timeout: 120000 },
      );
      const afterRecipe = await snapshot();
      physicalFilms(afterRecipe.model, 'M4 typed film').forEach((value) =>
        near(value, recipeThickness, displayUnit + ' typed Recipe Z'),
      );
      physicalFilms(afterRecipe.model, 'M4 manual film').forEach((value) =>
        near(value, manualThickness, displayUnit + ' retained Manual film Z'),
      );
      assert.equal(afterRecipe.workflow.steps.length, 2);
      report.cases.push(displayUnit + ':recipe-0.35nm-physical');

      await page.locator('[data-action="domain:project"]').click();
      const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
      await page.locator('#projectExportMenuBtn').click();
      await page.locator('#exportProjectBtn').click();
      const download = await downloadPromise;
      const filename = resolve(output, 'physical-' + displayUnit + '.wafercad');
      await download.saveAs(filename);
      const exported = await readProjectFile(new Blob([await readFile(filename)]));
      assert.deepEqual(
        exported.model,
        afterRecipe.model,
        displayUnit + ' exported project must retain sub-nm geometry bit for bit',
      );
      physicalFilms(exported.model, 'M4 typed film').forEach((value) =>
        near(value, recipeThickness, displayUnit + ' exported typed Recipe Z'),
      );
      report.cases.push(displayUnit + ':project-export-physical');

      await page.locator('#saveProjectBtn').click();
      await page.waitForFunction(
        () =>
          /Saved .* locally/.test(
            document.querySelector('[data-slot="status.message"]')?.textContent || '',
          ),
        null,
        { timeout: 120000 },
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
        timeout: 120000,
      });
      const restored = await snapshot();
      assert.deepEqual(
        restored.model,
        afterRecipe.model,
        displayUnit + ' Save/Reload restores exact canonical Z and geometry',
      );
      assert.deepEqual(
        restored.workflow.steps,
        afterRecipe.workflow.steps,
        displayUnit + ' Save/Reload restores Process History',
      );
      assert.deepEqual(
        restored.workflow.branches,
        afterRecipe.workflow.branches,
        displayUnit + ' Save/Reload restores Variants',
      );
      assert.deepEqual(errors, []);
      report.cases.push(displayUnit + ':save-reload-history');
    } finally {
      await context.close();
    }
  }
  report.result = 'pass';
  console.log('V2_PHYSICAL_PROCESS_UNITS_OK', JSON.stringify(report.cases));
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || String(error);
  console.error('V2_PHYSICAL_PROCESS_UNITS_FAIL', report.error);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
