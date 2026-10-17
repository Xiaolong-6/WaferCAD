// Scientific acceptance for the experimental 16-cell native Recipe.
// Verify actual Chromium Run All and non-vacuous expanded material parity.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { readProjectFile } from '../site/project-io.js';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const { resolveArrayModel } = await import('../site/model-array.js');
const { parseGDS, flattenGDS } = await import('../site/gds.js');
const { parseOAS } = await import('../site/oasis.js');
const dir = resolve('test-results/tcmos');
const path = resolve(dir, 'tcmos-inverter-4x4-RECIPE-EXPERIMENT.wafercad');
const expected = await readProjectFile(new Blob([await readFile(path)]));
assert.equal(expected.processRecipe.steps.length, 23);
assert.equal(expected.model.array.instances.length, 16);
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const report = {
  status: 'in_progress',
  experimental: true,
  sourceCells: 16,
  steps: 23,
  targetAreaToleranceUm2: 2e-6,
};
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const selectPanel = async (kind) => {
  await page.locator('.p-nav [data-action="domain:' + kind + '"]').click();
  await waitForPaint(page);
};
try {
  await page.goto((process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') +
    '/app.html?start=empty', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await selectPanel('project');
  await page.locator('#openProjectInput').setInputFiles(path);
  const confirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    expected.name,
    { timeout: 120000 },
  );
  let snapshot = await snap();
  assert.equal(snapshot.layout.elements.length, 3712);
  assert.equal(snapshot.model.array.instances.length, 16);
  await selectPanel('mask');
  const maskDock = page.locator('[data-action="dock:view:mask"]:visible').first();
  if (await maskDock.count()) {
    if ((await maskDock.getAttribute('aria-pressed')) !== 'true') await maskDock.click();
  } else {
    await page.locator('[data-action="view:mask"]:visible').first().click();
  }
  await waitForPaint(page);
  const selection = page.locator('#v2-maskLayerList input[type="checkbox"]');
  assert.equal(await selection.count(), 8);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => document.querySelector(
      '#v2-maskLayerList input[type="checkbox"]:not(:checked)',
    )?.click());
  }
  const tools = page.locator('[data-action="mask-export-menu"]');
  if (!(await tools.isVisible())) {
    await page.getByRole('button', { name: 'Mask more tools' }).click();
  }
  await tools.click();
  report.exports = [];
  const counts = Object.fromEntries(
    expected.layout.combos.map((combo) => {
      const [, layer, datatype] = combo.key.split('|');
      return [layer + '/' + datatype, combo.count];
    }),
  );
  for (const format of ['gds', 'oas']) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('[data-action="mask-export:' + format + '"]').click(),
    ]);
    const exportedPath = resolve(dir, 'tcmos-4x4-recipe-mask.' + format);
    await download.saveAs(exportedPath);
    const bytes = await readFile(exportedPath);
    const parsed = format === 'gds'
      ? parseGDS(Uint8Array.from(bytes).buffer)
      : await parseOAS(Uint8Array.from(bytes).buffer);
    const elements = flattenGDS(parsed, parsed.root).elements;
    const byLayer = {};
    for (const element of elements) {
      const key = element.layer + '/' + element.datatype;
      byLayer[key] = (byLayer[key] || 0) + 1;
    }
    assert.deepEqual(byLayer, counts, '4×4 ' + format + ' layers/polygons were lost');
    assert.equal(elements.length, 3712, 'Every CNT and other cell mask must be exported');
    report.exports.push({ format, bytes: bytes.length, elements: elements.length });
  }
  await page.keyboard.press('Escape');
  await selectPanel('process');
  await page.locator('[data-action="process-mode:recipe"]').click();
  assert.equal(await page.locator('.recipe-step-row').count(), 23);
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.evaluate(() => {
    window.__tcmosArrayStatusHistory = [];
    const status = document.querySelector('[data-slot="status.message"]');
    if (status) {
      new MutationObserver(() => {
        const text = status.textContent?.trim() || '';
        if (text && window.__tcmosArrayStatusHistory.at(-1) !== text) {
          window.__tcmosArrayStatusHistory.push(text);
        }
      }).observe(status, { childList: true, characterData: true, subtree: true });
    }
  });
  await page.locator('#recipeRunAllBtn').click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    const clear = dialog.getByRole('button', { name: /Clear history|Clear/i });
    if (await clear.count()) await clear.first().click();
    else throw new Error('Unknown array Recipe confirmation modal');
  }
  await page.waitForFunction(() => {
    const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
    const status = document.querySelector('[data-slot="status.message"]')?.textContent || '';
    return /^(Completed|Failed|Stopped):/.test(summary) ||
      /Recipe (completed|failed)|Recipe failed at Step/i.test(status);
  }, null, { timeout: 900000 });
  const summary = await page.locator('#recipeRunSummary').innerText();
  const status = await page.locator('[data-slot="status.message"]').innerText();
  report.runSummary = summary;
  report.runStatus = status;
  if (!summary.startsWith('Completed: 23/23')) {
    const failed = await snap();
    const diagnostics = await page.evaluate(async () => {
      const state = window.WaferCadV2Workstation.snapshot();
      const step = state.processRecipe.steps[12];
      const answer = {
        maskSourceMode: state.maskSourceMode,
        maskRoi: state.maskRoi,
        currentDrawShapeCount: state.drawMask?.shapes?.length,
        step13MaskShapeCount: step.params.mask?.drawMask?.shapes?.length,
        statuses: window.__tcmosArrayStatusHistory || [],
      };
      try {
        const [{ drawMaskGeometry }, { applyOperation }, arrayApi, vectorApi] =
          await Promise.all([
            import('/draw-mask-geometry.js'),
            import('/model.js'),
            import('/model-array.js'),
            import('/vector-geometry.js'),
          ]);
        const p = step.params;
        const geom = drawMaskGeometry(p.mask.drawMask);
        const params = {
          type: 'implant',
          name: p.name,
          tilt: p.tilt,
          color: p.color,
          thickness: p.depthUm,
          depthStart: p.startDepthUm || 0,
          face: p.face,
          area: geom,
          dopantPolarity: p.dopantPolarity,
          dopantRole: p.dopantRole,
          dopantHostLayerId: p.dopantHostLayerId,
          dopantProvenance: p.dopantProvenance,
        };
        answer.drawAreaBounds = arrayApi.geometryBounds(geom);
        const global = structuredClone(state.model);
        try {
          answer.directArrayResult = applyOperation(global, params);
          answer.directArrayRevision = global.processRevision;
          answer.directArrayImplants = global.implants.length;
        } catch (error) {
          answer.directArrayResult = { thrown: error.message };
        }
        const part = arrayApi.arrayParts(state.model)[0];
        const local = vectorApi.intersection(
          arrayApi.translateGeometry(geom, -part.x, -part.y),
          part.model.boundary,
        );
        answer.firstCellLocalAreaBounds = arrayApi.geometryBounds(local);
        const leaf = structuredClone(part.model);
        try {
          answer.directFirstCellResult = applyOperation(leaf, { ...params, area: local });
          answer.directFirstCellImplants = leaf.implants?.length;
        } catch (error) {
          answer.directFirstCellResult = { thrown: error.message };
        }
      } catch (error) {
        answer.diagnosticError = error.stack || error.message;
      }
      return answer;
    });
    await writeFile(
      resolve(dir, 'tcmos-4x4-step13-diagnostics.json'),
      JSON.stringify(diagnostics, null, 2),
    );
    await writeFile(
      resolve(dir, 'tcmos-4x4-replay-intermediate-model.json'),
      JSON.stringify({ model: failed.model, summary, status, nextStep: 13 }),
    );
  }
  assert.ok(
    summary.startsWith('Completed: 23/23') || /Recipe completed:/.test(status),
    'Full 16-cell Recipe failed: ' + summary + ' / ' + status,
  );
  snapshot = await snap();
  assert.equal(snapshot.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(snapshot.model.array.instances.length, 16);
  await selectPanel('project');
  await page.locator('#projectExportMenuBtn').click();
  const [saved] = await Promise.all([
    page.waitForEvent('download', { timeout: 180000 }),
    page.locator('#exportProjectBtn').click(),
  ]);
  const exportedPath = resolve(dir, 'tcmos-4x4-replayed.wafercad');
  await saved.saveAs(exportedPath);
  const reopened = await readProjectFile(new Blob([await readFile(exportedPath)]));
  assert.equal(reopened.model.kernel, 'vector-2.5d-array-v1');
  assert.equal(reopened.model.array.instances.length, 16);
  const expectedPhysical = resolveArrayModel(expected.model);
  const replayedPhysical = resolveArrayModel(reopened.model);
  // Never pass both empty array roots to occupancy() – that would produce
  // a false green. Material parity is checked on *expanded real XY regions*.
  assert.ok(expectedPhysical.regions.length > 100);
  assert.ok(replayedPhysical.regions.length > 100);
  const material = await assertSameMaterialGeometry(expectedPhysical, replayedPhysical, {
    areaToleranceUm2: 2e-6,
  });
  assert.deepEqual(
    reopened.model.dopantRegions.map((d) => [d.role, d.polarity, d.depthStartUm, d.depthEndUm]),
    expected.model.dopantRegions.map((d) => [d.role, d.polarity, d.depthStartUm, d.depthEndUm]),
    'Source/body implant intent must survive all 16 processed cells',
  );
  assert.ok(reopened.snapshotBranches.nodes.length >= 23);
  report.material = material;
  report.historyNodes = reopened.snapshotBranches.nodes.length;
  await page.screenshot({ path: resolve(dir, 'tcmos-4x4-recipe-replayed.png') });
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    () => /Saved .* locally/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || '',
    ),
    null,
    { timeout: 120000 },
  );
  const recovery = await page.locator('#workspaceRecoverySelect').inputValue();
  assert.ok(recovery, 'Array replay must create a Recovery checkpoint');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail';
  report.error = error.stack || error.message;
  report.pageErrors = pageErrors;
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'tcmos-4x4-recipe-replay.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
