/**
 * Real Chromium OFF/ON Mask, 3D, and Section acceptance for the isolated
 * SEM-oriented 2x2 SWX unit. This is not author-GDS parity.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { parseOAS } from '../site/oasis.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();

const root = resolve(process.env.WAFERCAD_SWX_SEM_OUTPUT || 'test-results/swx-sem-v2');
const directory = resolve(root, 'browser');
await mkdir(directory, { recursive: true });
const filename = resolve(root, process.env.WAFERCAD_SWX_SEM_PROJECT || 'swx-sem-v2-unit.wafercad');
const exportPrefix = process.env.WAFERCAD_SWX_SEM_EXPORT_PREFIX || 'sem-v2';
const source = await readProjectFile(new Blob([await readFile(filename)]));
assert.equal(source.snapshotBranches.branches.length, 2);
assert.ok(source.layout.elements.length > 0);
const browser = await launchBrowser();
const report = { browser: browser.version(), projectName: source.name, cases: [] };

try {
  for (const state of ['off', 'on']) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1500, height: 960 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('crash', () => errors.push('Chromium page crashed'));
    try {
      await page.goto(
        (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182') + '/app.html?start=empty',
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const docking =
        (await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').count()) > 0;
      const switchView = async (view) => {
        if (docking) {
          await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
          if (view === 'mask') {
            await page.locator('[data-action="domain:mask"]').click();
          } else {
            await page.locator('#threePanel [data-action="maximize:three"]').click();
          }
        } else {
          await page.locator('[data-action="mode:single"]').click();
          await page.locator('[data-action="view:' + view + '"]').click();
        }
      };
      const showSection = async () => {
        if (docking) {
          await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
        } else {
          const action = page.locator('[data-action="section"]');
          if ((await action.getAttribute('aria-pressed')) !== 'true') {
            await action.click();
          }
        }
        await page.locator('#sectionPanel').waitFor({ state: 'visible' });
      };
      const importProject = async (bytes) => {
        await page.locator('[data-action="domain:project"]').click();
        await page.locator('#openProjectInput').setInputFiles(bytes);
        const confirm = page.getByRole('button', { name: 'Open project', exact: true });
        if (await confirm.isVisible()) await confirm.click();
        await page.waitForFunction(
          (expected) => {
            const snapshot = window.WaferCadV2Workstation?.snapshot?.();
            return snapshot?.projectName === expected && !snapshot?.workflow?.busy;
          },
          source.name,
          { timeout: 120000 },
        );
        if (state === 'on') {
          await page.locator('[data-action="domain:history"]').click();
          await page
            .locator('.history-variant[data-variant-id="on"] .history-variant-name')
            .click();
          await page.waitForFunction(
            () =>
              window.WaferCadV2Workstation.snapshot().workflow.branches.some(
                (branch) => branch.id === 'on' && branch.active,
              ),
            null,
            { timeout: 120000 },
          );
        }
      };
      await importProject(filename);
      const snapshot = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(snapshot.layout.elements.length, source.layout.elements.length);
      const expectedModel =
        state === 'off'
          ? source.model
          : source.snapshotBranches.branches.find((branch) => branch.id === 'on').headState.model;
      assert.equal(snapshot.model.layers.length, expectedModel.layers.length);
      await assertSameMaterialGeometry(expectedModel, snapshot.model, { areaToleranceUm2: 0.01 });
      await switchView('mask');
      await waitForPaint(page);
      await page.locator('#maskPanel').screenshot({
        path: resolve(directory, state + '-mask.png'),
      });
      const exportMenu = page.locator('[data-action="mask-export-menu"]');
      if (!(await exportMenu.isVisible())) {
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      }
      await exportMenu.click();
      for (const format of ['gds', 'oas']) {
        const action = page.locator('[data-action="mask-export:' + format + '"]');
        if (!(await action.isVisible())) {
          if (!(await exportMenu.isVisible())) {
            await page.locator('#maskPanel button[aria-label$="more tools"]').click();
          }
          await exportMenu.click();
        }
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 120000 }),
          action.click({ timeout: 120000, noWaitAfter: true }),
        ]);
        const path = resolve(directory, exportPrefix + '-' + state + '.' + format);
        await download.saveAs(path);
        const bytes = await readFile(path);
        const parsed =
          format === 'gds'
            ? parseGDS(Uint8Array.from(bytes).buffer)
            : await parseOAS(Uint8Array.from(bytes).buffer);
        assert.equal(
          flattenGDS(parsed, parsed.root).elements.length,
          source.layout.elements.length,
          'SEM v2 browser export did not preserve the complete Mask polygons',
        );
      }
      await page.getByRole('button', { name: 'Close Export Mask' }).click();
      await page.locator('#maskExportSettings').waitFor({ state: 'hidden' });
      await switchView('three');
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      await page.locator('#threePanel').screenshot({
        path: resolve(directory, state + '-3d-overview.png'),
      });

      const layer = source.model.layers.find((item) => item.name === '220nm SOI device silicon');
      assert.ok(layer, 'Missing modeled 220nm device Si');
      const zScale = Number(await page.locator('#threeHost').getAttribute('data-z-display-scale'));
      assert.ok(zScale > 0 && Number.isFinite(zScale));
      const topZ =
        Math.max(
          ...source.model.regions.flatMap((region) =>
            region.stack.filter((seg) => seg.layerId === layer.id).map((seg) => seg.z1),
          ),
        ) * zScale;
      for (const [name, targetY, cameraHeight, fov] of [
        ['swx-optical', -47, 66, 28],
        ['actuator-springs', -82, 130, 48],
      ]) {
        const camera = {
          target: [0, targetY, topZ],
          position: [1, targetY, topZ + cameraHeight],
          fov,
        };
        const inspect = structuredClone(source);
        inspect.display.threeCamera = camera;
        for (const branch of inspect.snapshotBranches.branches) {
          if (branch.headState?.display) branch.headState.display.threeCamera = camera;
        }
        for (const node of inspect.snapshotBranches.nodes) {
          if (node.state?.display) node.state.display.threeCamera = camera;
        }
        for (const bookmark of inspect.snapshots) {
          if (bookmark.state?.display) bookmark.state.display.threeCamera = camera;
        }
        await importProject({
          name: 'sem-v2-visual-camera.wafercad',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(inspect)),
        });
        await switchView('three');
        await page.waitForFunction(
          (expected) => {
            const snapshot = window.WaferCadV2Workstation.snapshot();
            return (
              document.getElementById('threeHost')?.dataset.renderState === 'ready' &&
              snapshot.threeCamera?.target?.every(
                (value, index) => Math.abs(value - expected[index]) < 1e-4,
              )
            );
          },
          camera.target,
          { timeout: 120000 },
        );
        await waitForPaint(page);
        await page.locator('#threePanel').screenshot({
          path: resolve(directory, state + '-3d-' + name + '.png'),
        });
      }
      await showSection();
      await waitForPaint(page);
      await page.locator('#sectionPanel').screenshot({
        path: resolve(directory, state + '-section.png'),
      });
      if (state === 'off') {
        await page.locator('[data-action="domain:process"]').click();
        const recipeTab = page.locator('[data-action="process-mode:recipe"]');
        if (await recipeTab.isVisible()) await recipeTab.click();
        await page.locator('#recipeRunStart').selectOption('new-base');
        assert.doesNotMatch(
          await page.locator('#recipeValidation').innerText(),
          /✕/,
          'SEM v2 browser Recipe preflight failed',
        );
        const expectedSteps = source.processRecipe.steps.length;
        await page.locator('#recipeRunAllBtn').click();
        await page
          .getByRole('button', { name: /Clear history|Keep previous history/ })
          .first()
          .waitFor({ state: 'visible', timeout: 15000 });
        const clearHistory = page.getByRole('button', { name: 'Clear history', exact: true });
        const keepHistory = page.getByRole('button', {
          name: 'Keep previous history',
          exact: true,
        });
        if (await clearHistory.isVisible()) await clearHistory.click();
        else await keepHistory.click();
        await page.waitForFunction(
          () =>
            /^(Completed|Failed|Stopped):/.test(
              document.querySelector('#recipeRunSummary')?.textContent || '',
            ),
          null,
          { timeout: 300000 },
        );
        const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
        assert.match(summary, new RegExp('^Completed: ' + expectedSteps + '/' + expectedSteps));
        const replay = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
        await assertSameMaterialGeometry(source.model, replay.model, { areaToleranceUm2: 0.01 });
        await writeFile(resolve(directory, 'off-recipe-summary.txt'), summary + '\n');
      }
      assert.deepEqual(errors, []);
      report.cases.push({
        state,
        imported: true,
        maskElements: snapshot.layout.elements.length,
        actual3dReady: true,
        sectionVisible: true,
        gdsAndOasBrowserExports: true,
        materialGeometryRoundTrip: true,
        recipeReplayMatchesSavedOff: state === 'off' ? true : 'common OFF fabrication',
        closeups: ['swx-optical', 'actuator-springs'],
        sourceGdsAndPerimeterAccepted: false,
        errors,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(resolve(directory, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
