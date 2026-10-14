// Browser acceptance for one shared-fabrication SWX project with OFF/ON Variants.
// This exercises the real v2 Project worker, shared renderer state and exports.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { parseOAS } from '../site/oasis.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const out = resolve('test-results/swx-mems/browser');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const report = { browser: browser.version(), cases: [] };

try {
  for (const state of ['off', 'on']) {
    const filename = resolve('test-results/swx-mems/swx-photonic-mems.wafercad');
    const source = await readProjectFile(new Blob([await readFile(filename)]));
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('crash', () => errors.push('Chromium page crashed'));
    page.on('close', () => errors.push('Chromium page closed'));
    try {
      await page.goto(base + '/app.html?start=empty', {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#openProjectInput').setInputFiles(filename);
      const confirmation = page.getByRole('button', {
        name: 'Open project',
        exact: true,
      });
      if (await confirmation.isVisible()) await confirmation.click();
      await page.waitForFunction(
        (expected) => {
          const s = window.WaferCadV2Workstation.snapshot();
          return s.projectName === expected && !s.workflow.busy;
        },
        source.name,
        { timeout: 120000 },
      );

      const branches = source.snapshotBranches.branches;
      assert.deepEqual(new Set(branches.map((b) => b.id)), new Set(['main', 'on']));
      const onLayout = branches.find((b) => b.id === 'on').headState.layout;
      assert.deepEqual(
        onLayout.elements,
        source.layout.elements,
        'OFF/ON must share the manufactured Mask',
      );
      assert.deepEqual(onLayout.bounds, source.layout.bounds);
      assert.deepEqual(
        branches.find((b) => b.id === 'on').headState.processRecipe,
        source.processRecipe,
      );
      if (state === 'on') {
        await page.locator('[data-action="domain:history"]').click();
        await page.locator('.history-variant[data-variant-id="on"] .history-variant-name').click();
        await page.waitForFunction(
          () =>
            window.WaferCadV2Workstation.snapshot().workflow.branches.some(
              (b) => b.id === 'on' && b.active,
            ),
          null,
          { timeout: 120000 },
        );
      }
      const imported = await snapshot();
      assert.equal(imported.sharedIdentity, true);
      assert.equal(imported.model.layers.length, source.model.layers.length);
      const expectedModel =
        state === 'off' ? source.model : branches.find((b) => b.id === 'on').headState.model;
      await assertSameMaterialGeometry(expectedModel, imported.model, { areaToleranceUm2: 0.01 });
      assert.equal(imported.layout.elements.length, source.layout.elements.length);
      assert.ok(imported.workflow.steps.length >= 8, 'History did not import');
      assert.ok(imported.model.layers.some((layer) => layer.name === 'Au electrode'));
      await page.locator('[data-action="view:mask"]').click();
      await waitForPaint(page);
      assert.ok((await snapshot()).layout.elements.length > 100);

      const maskMenu = page.locator('[data-action="mask-export-menu"]');
      if (!(await maskMenu.isVisible())) {
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      }
      await maskMenu.click();
      for (const format of ['gds', 'oas']) {
        const exportAction = page.locator('[data-action="mask-export:' + format + '"]');
        if (!(await exportAction.isVisible())) {
          if (!(await maskMenu.isVisible())) {
            await page.locator('#maskPanel button[aria-label$="more tools"]').click();
          }
          await maskMenu.click();
        }
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 120000 }),
          exportAction.click({ timeout: 120000, noWaitAfter: true }),
        ]);
        const layoutPath = resolve(out, 'swx-' + state + '.' + format);
        await download.saveAs(layoutPath);
        const bytes = await readFile(layoutPath);
        assert.ok(bytes.byteLength > 100, 'Empty ' + format + ' export');
        const buffer = Uint8Array.from(bytes).buffer;
        const parsed = format === 'gds' ? parseGDS(buffer) : await parseOAS(buffer);
        assert.ok(
          flattenGDS(parsed, parsed.root).elements.length > 100,
          'Exported ' + format.toUpperCase() + ' lacks physical SWX polygons',
        );
      }

      // Export is a persistent nonmodal floating editor: it does not
      // disappear after saving. Dismiss it explicitly before visual evidence.
      await page.getByRole('button', { name: 'Close Export Mask' }).click();
      await page.locator('#maskExportSettings').waitFor({ state: 'hidden' });
      await page.locator('[data-action="view:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      await page.locator('[data-action="domain:history"]').click();
      await page.locator('[data-action="mode:overview"]').click();
      await page.waitForFunction(
        () => {
          const stage = document.querySelector('[data-view-mode="overview"]');
          if (!stage) return false;
          return ['mainCanvas', 'maskCanvas', 'threeHost', 'sectionCanvas'].every((id) => {
            const node = document.getElementById(id);
            if (!node || node.closest('[hidden]')) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 100 && rect.height > 100;
          });
        },
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      const beforeExport = await snapshot();
      assert.equal(
        beforeExport.projectName,
        source.name,
        'Variant switch changed project identity',
      );
      await page.screenshot({ path: resolve(out, 'swx-' + state + '-four-views.png') });
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#projectExportMenuBtn').click();
      const savedFile = page.waitForEvent('download', { timeout: 120000 });
      await page.locator('#exportProjectBtn').click();
      const projectDownload = await savedFile;
      const exportedPath = resolve(out, 'swx-' + state + '-reexport.wafercad');
      await projectDownload.saveAs(exportedPath);
      const reloaded = await readProjectFile(new Blob([await readFile(exportedPath)]));
      await assertSameMaterialGeometry(beforeExport.model, reloaded.model, {
        areaToleranceUm2: 0.01,
      });
      assert.equal(reloaded.layout.elements.length, source.layout.elements.length);
      assert.equal(reloaded.processRecipe.steps.length, source.processRecipe.steps.length);
      assert.equal(reloaded.snapshotBranches.branches.length, 2);
      assert.deepEqual(
        reloaded.snapshotBranches.branches.find((b) => b.id === 'on').headState.layout.elements,
        reloaded.layout.elements,
      );
      assert.deepEqual(
        (await snapshot()).model,
        beforeExport.model,
        'Export must not mutate live physical geometry',
      );
      assert.deepEqual(errors, [], 'Browser runtime errors');

      if (state === 'off') {
        await page.locator('[data-action="domain:process"]').click();
        const recipeTab = page.locator('[data-action="process-mode:recipe"]');
        if (await recipeTab.isVisible()) await recipeTab.click();
        await page.locator('#recipeRunStart').selectOption('new-base');
        assert.doesNotMatch(
          await page.locator('#recipeValidation').innerText(),
          /✕/,
          'SWX shared fabrication must pass new Base preflight',
        );
        const stepCount = source.processRecipe.steps.length;
        await page.locator('#recipeRunAllBtn').click();
        const clearHistory = page.getByRole('button', { name: 'Clear history', exact: true });
        const keepHistory = page.getByRole('button', {
          name: 'Keep previous history',
          exact: true,
        });
        await page
          .getByRole('button', { name: /Clear history|Keep previous history/ })
          .first()
          .waitFor({ state: 'visible', timeout: 15000 });
        if (await clearHistory.isVisible()) await clearHistory.click();
        else await keepHistory.click();
        await page.waitForFunction(
          () => {
            const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
            return /^(Completed|Failed|Stopped):/.test(summary);
          },
          null,
          { timeout: 300000 },
        );
        const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
        assert.match(summary, new RegExp('^Completed: ' + stepCount + '/' + stepCount));
        const rebuilt = await snapshot();
        await assertSameMaterialGeometry(source.model, rebuilt.model, {
          areaToleranceUm2: 0.01,
        });
      }

      // Review the actual 3D WebGL sidewalls at the same physical camera
      // in both Variants. Keep this camera change in the TEST copy only;
      // the user-facing project retains its own default overview camera.
      const cornerCamera = {
        position: [10.5, 15.5, 13.0],
        target: [2.6, 31.0, 4.65],
        fov: 34,
      };
      const inspectProject = structuredClone(source);
      inspectProject.display.threeCamera = cornerCamera;
      for (const branch of inspectProject.snapshotBranches.branches) {
        if (branch.headState?.display) branch.headState.display.threeCamera = cornerCamera;
      }
      for (const node of inspectProject.snapshotBranches.nodes) {
        if (node.state?.display) node.state.display.threeCamera = cornerCamera;
      }
      for (const bookmark of inspectProject.snapshots) {
        if (bookmark.state?.display) bookmark.state.display.threeCamera = cornerCamera;
      }
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#openProjectInput').setInputFiles({
        name: 'swx-corner-review.wafercad',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(inspectProject)),
      });
      const cornerOpen = page.getByRole('button', {
        name: 'Open project',
        exact: true,
      });
      if (await cornerOpen.isVisible()) await cornerOpen.click();
      await page.waitForFunction(
        (expected) =>
          window.WaferCadV2Workstation.snapshot().projectName === expected &&
          !window.WaferCadV2Workstation.snapshot().workflow.busy,
        source.name,
        { timeout: 120000 },
      );
      if (state === 'on') {
        await page.locator('[data-action="domain:history"]').click();
        await page.locator('.history-variant[data-variant-id="on"] .history-variant-name').click();
        await page.waitForFunction(
          () => window.WaferCadV2Workstation.snapshot().workflow.branches
            .some((branch) => branch.id === 'on' && branch.active),
          null,
          { timeout: 120000 },
        );
      }
      await page.locator('[data-action="mode:single"]').click();
      await page.locator('[data-action="view:three"]').click();
      // Single view can still reserve half the workspace for Section dock.
      // Close that dock for a full-size 3D view before inspecting 200nm ribs.
      const sectionDock = page.locator('[data-action="section"]');
      if ((await sectionDock.getAttribute('aria-pressed')) === 'true') {
        await sectionDock.click();
      }
      await page.waitForFunction(
        (expected) => {
          const host = document.getElementById('threeHost');
          const camera = window.WaferCadV2Workstation.snapshot().threeCamera;
          return host?.dataset.renderState === 'ready' && camera &&
            camera.target.every((value, i) => Math.abs(value - expected.target[i]) < 1e-4);
        },
        cornerCamera,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      const cornerView = page.locator('#threePanel');
      const cornerBounds = await cornerView.boundingBox();
      assert.ok(
        cornerBounds?.width > 700 && cornerBounds.height > 400,
        '3D corner review requires a large canvas: ' + JSON.stringify(cornerBounds),
      );
      await cornerView.screenshot({ path: resolve(out, 'swx-' + state + '-3d-miter-corner.png') });
      assert.deepEqual(errors, [], 'Corner review triggered WebGL errors');

      report.cases.push({
        state,
        pass: true,
        regions: beforeExport.model.regions.length,
        historyNodes: beforeExport.workflow.steps.length,
        masks: beforeExport.layout.elements.length,
        projectRoundTrip: true,
        unifiedProject: true,
        correctBranchSelection: true,
        gdsExport: true,
        oasExport: true,
        views: ['mask', 'three', 'main'],
      });
      console.log(
        'SWX browser ' + state.toUpperCase() + ': project import/export, 3D and GDS/OAS PASS',
      );
    } catch (error) {
      await page.screenshot({ path: resolve(out, 'swx-' + state + '-failure.png') });
      throw error;
    } finally {
      await context.close();
    }
  }
  report.pass = true;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
}
