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
      // Save full-size layout evidence instead of relying on the 4-up
      // thumbnail, where 200nm teeth and individual comb fingers vanish.
      await page.locator('[data-action="mode:single"]').click();
      await waitForPaint(page);
      await page.locator('#maskPanel').screenshot({
        path: resolve(out, 'swx-' + state + '-mask-full.png'),
      });
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
      const zScale = Number(await page.locator('#threeHost').getAttribute('data-z-display-scale'));
      assert.ok(Number.isFinite(zScale) && zScale > 0, 'Missing physical 3D Z display scale');
      const deviceLayerId = source.model.layers.find(
        (layer) => layer.name === '220nm SOI device silicon',
      ).id;
      const siliconZ = source.model.regions.flatMap((region) =>
        region.stack.filter((segment) => segment.layerId === deviceLayerId),
      );
      const visualSiliconZ = (Math.max(...siliconZ.map((segment) => segment.z1)) - 0.05) * zScale;
      // Camera-specific evidence is deliberately generated from the real UI,
      // not from a second diagram renderer or a modified fabrication state.
      // Earlier 'miter-corner' images were aimed at a contact pad and did not
      // provide meaningful evidence of the SWX teeth or folded springs.
      const closeups = [
        {
          name: 'swt-stoppers',
          position: [-26, -12, visualSiliconZ + 13],
          target: [-31, 0, visualSiliconZ],
          fov: 31,
        },
        {
          name: 'comb-banks',
          position: [33, 23, visualSiliconZ + 21],
          target: [24, 1, visualSiliconZ],
          fov: 37,
        },
        {
          name: 'folded-springs',
          position: [13, 38, visualSiliconZ + 18],
          target: [0, 25, visualSiliconZ],
          fov: 36,
        },
      ];
      for (const review of closeups) {
        const reviewCamera = {
          position: review.position,
          target: review.target,
          fov: review.fov,
        };
        const inspectProject = structuredClone(source);
        inspectProject.display.threeCamera = reviewCamera;
        // A separately focused cross-section along both comb handle classes:
        // fixed cores must retain BOX and moving cores must be released.
        inspectProject.section = { a: [25, -20], b: [25, 15] };
        for (const branch of inspectProject.snapshotBranches.branches) {
          if (branch.headState?.display) branch.headState.display.threeCamera = reviewCamera;
          if (branch.headState) branch.headState.section = structuredClone(inspectProject.section);
        }
        for (const node of inspectProject.snapshotBranches.nodes) {
          if (node.state?.display) node.state.display.threeCamera = reviewCamera;
          if (node.state) node.state.section = structuredClone(inspectProject.section);
        }
        for (const bookmark of inspectProject.snapshots) {
          if (bookmark.state?.display) bookmark.state.display.threeCamera = reviewCamera;
          if (bookmark.state) bookmark.state.section = structuredClone(inspectProject.section);
        }
        await page.locator('[data-action="domain:project"]').click();
        await page.locator('#openProjectInput').setInputFiles({
          name: 'swx-science-review.wafercad',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(inspectProject)),
        });
        const confirm = page.getByRole('button', { name: 'Open project', exact: true });
        if (await confirm.isVisible()) await confirm.click();
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
            () =>
              window.WaferCadV2Workstation.snapshot().workflow.branches.some(
                (branch) => branch.id === 'on' && branch.active,
              ),
            null,
            { timeout: 120000 },
          );
        }
        await page.locator('[data-action="mode:single"]').click();
        await page.locator('[data-action="view:three"]').click();
        const sectionDock = page.locator('[data-action="section"]');
        if ((await sectionDock.getAttribute('aria-pressed')) === 'true') {
          await sectionDock.click();
        }
        await page.waitForFunction(
          (expected) => {
            const host = document.getElementById('threeHost');
            const camera = window.WaferCadV2Workstation.snapshot().threeCamera;
            return (
              host?.dataset.renderState === 'ready' &&
              camera &&
              camera.target.every((value, i) => Math.abs(value - expected.target[i]) < 1e-4)
            );
          },
          reviewCamera,
          { timeout: 120000 },
        );
        await waitForPaint(page);
        const reviewView = page.locator('#threePanel');
        const bounds = await reviewView.boundingBox();
        assert.ok(
          bounds?.width > 700 && bounds.height > 400,
          '3D science review needs a large canvas: ' + JSON.stringify(bounds),
        );
        await reviewView.screenshot({
          path: resolve(out, 'swx-' + state + '-3d-' + review.name + '.png'),
        });
      }
      // In UI v2 Section is a dock, not a "view:section" toolbar item.
      const sectionToggle = page.locator('[data-action="section"]');
      if ((await sectionToggle.getAttribute('aria-pressed')) !== 'true') {
        await sectionToggle.click();
      }
      await waitForPaint(page);
      const sectionReview = page.locator('#sectionPanel');
      assert.ok(await sectionReview.isVisible(), 'Comb BOX section must be visible');
      await sectionReview.screenshot({
        path: resolve(out, 'swx-' + state + '-section-comb-box.png'),
      });
      assert.deepEqual(errors, [], 'Science closeups triggered browser errors');

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
