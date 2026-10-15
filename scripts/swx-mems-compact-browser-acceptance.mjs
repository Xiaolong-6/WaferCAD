/**
 * Real Chromium UI v2 acceptance of the independently generated compact
 * WaferCAD process project. Not a replacement for the original SWX example.
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
const directory = resolve('test-results/swx-mems-compact/browser');
await mkdir(directory, { recursive: true });
const filename = resolve('test-results/swx-mems-compact/swx-compact-candidate.wafercad');
const source = await readProjectFile(new Blob([await readFile(filename)]));
assert.equal(source.snapshotBranches.branches.length, 2);
assert.equal(source.layout.elements.length, 148);
const browser = await launchBrowser();
const report = { browser: browser.version(), cases: [] };
try {
  for (const state of ['off', 'on']) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('crash', () => errors.push('Chromium page crashed'));
    try {
      await page.goto(
        (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182') + '/app.html?start=empty',
        {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        },
      );
      await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      await page.locator('[data-action="domain:project"]').click();
      await page.locator('#openProjectInput').setInputFiles(filename);
      const confirm = page.getByRole('button', { name: 'Open project', exact: true });
      if (await confirm.isVisible()) await confirm.click();
      await page.waitForFunction(
        (expected) => {
          const value = window.WaferCadV2Workstation.snapshot();
          return value.projectName === expected && !value.workflow.busy;
        },
        source.name,
        { timeout: 120000 },
      );
      const onBranch = source.snapshotBranches.branches.find((branch) => branch.id === 'on');
      assert.ok(onBranch, 'Missing restorable ON branch');
      assert.deepEqual(onBranch.headState.layout.elements, source.layout.elements);
      assert.deepEqual(onBranch.headState.processRecipe, source.processRecipe);
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
      const loaded = await snapshot();
      assert.equal(loaded.sharedIdentity, true);
      const expectedModel = state === 'off' ? source.model : onBranch.headState.model;
      await assertSameMaterialGeometry(expectedModel, loaded.model, { areaToleranceUm2: 0.01 });
      assert.equal(loaded.layout.elements.length, 148);
      await page.locator('[data-action="mode:overview"]').click();
      await waitForPaint(page);
      await page.screenshot({
        path: resolve(directory, 'compact-' + state + '-overview.png'),
        animations: 'disabled',
      });

      await page.locator('[data-action="mode:single"]').click();
      await page.locator('[data-action="view:mask"]').click();
      await waitForPaint(page);
      await page.locator('#maskPanel').screenshot({
        path: resolve(directory, 'compact-' + state + '-mask.png'),
      });
      const menu = page.locator('[data-action="mask-export-menu"]');
      if (!(await menu.isVisible())) {
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      }
      await menu.click();
      for (const format of ['gds', 'oas']) {
        const action = page.locator('[data-action="mask-export:' + format + '"]');
        if (!(await action.isVisible())) {
          if (!(await menu.isVisible())) {
            await page.locator('#maskPanel button[aria-label$="more tools"]').click();
          }
          await menu.click();
        }
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 120000 }),
          action.click({ timeout: 120000, noWaitAfter: true }),
        ]);
        const path = resolve(directory, 'compact-' + state + '.' + format);
        await download.saveAs(path);
        const bytes = await readFile(path);
        const parsed =
          format === 'gds'
            ? parseGDS(Uint8Array.from(bytes).buffer)
            : await parseOAS(Uint8Array.from(bytes).buffer);
        assert.equal(
          flattenGDS(parsed, parsed.root).elements.length,
          source.layout.elements.length,
          'Compact browser export changed original mask polygons',
        );
      }
      await page.getByRole('button', { name: 'Close Export Mask' }).click();
      await page.locator('#maskExportSettings').waitFor({ state: 'hidden' });
      await page.locator('[data-action="view:three"]').click();
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
      await waitForPaint(page);
      await page.locator('#threePanel').screenshot({
        path: resolve(directory, 'compact-' + state + '-3d.png'),
      });

      // Inspect selected geometrical landmarks at the same physical
      // cameras in OFF/ON. The saved source project is never changed;
      // only this disposable browser-import copy carries camera overrides.
      const zScale = Number(await page.locator('#threeHost').getAttribute('data-z-display-scale'));
      assert.ok(zScale > 0 && Number.isFinite(zScale));
      const deviceLayer = source.model.layers.find(
        (layer) => layer.name === '220nm SOI device silicon',
      ).id;
      const topZ =
        Math.max(
          ...source.model.regions.flatMap((region) =>
            region.stack
              .filter((segment) => segment.layerId === deviceLayer)
              .map((segment) => segment.z1),
          ),
        ) * zScale;
      const closeups = [
        { name: 'comb', position: [39, -10, topZ + 52], target: [0, -22, topZ], fov: 46 },
        { name: 'swt', position: [19, -71, topZ + 38], target: [0, -48, topZ], fov: 43 },
        { name: 'springs', position: [12, 62, topZ + 53], target: [0, 25, topZ], fov: 47 },
        // Nearly normal-incidence cameras show XY topology without
        // perspective clipping; Z targets account for the displayed
        // physical height rather than assuming an unscaled Z origin.
        {
          name: 'swt-plan',
          position: [4, -55, topZ + 58],
          target: [0, -48, topZ * 0.45],
          fov: 25,
        },
        {
          name: 'actuator-plan',
          position: [4, -8, topZ + 115],
          target: [0, 0, topZ * 0.45],
          fov: 44,
        },
      ];
      for (const view of closeups) {
        const camera = { position: view.position, target: view.target, fov: view.fov };
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
        await page.locator('[data-action="domain:project"]').click();
        await page.locator('#openProjectInput').setInputFiles({
          name: 'compact-scientific-camera.wafercad',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(inspect)),
        });
        const reopen = page.getByRole('button', { name: 'Open project', exact: true });
        if (await reopen.isVisible()) await reopen.click();
        await page.waitForFunction(
          (expected) =>
            window.WaferCadV2Workstation.snapshot().projectName === expected &&
            !window.WaferCadV2Workstation.snapshot().workflow.busy,
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
        await page.locator('[data-action="mode:single"]').click();
        await page.locator('[data-action="view:three"]').click();
        const dock = page.locator('[data-action="section"]');
        if ((await dock.getAttribute('aria-pressed')) === 'true') await dock.click();
        await page.waitForFunction(
          (expected) => {
            const snapshot = window.WaferCadV2Workstation.snapshot();
            return (
              document.getElementById('threeHost')?.dataset.renderState === 'ready' &&
              snapshot.threeCamera?.target?.every(
                (coordinate, i) => Math.abs(coordinate - expected.target[i]) < 1e-4,
              )
            );
          },
          camera,
          { timeout: 120000 },
        );
        await waitForPaint(page);
        await page.mouse.move(1380, 920);
        await page.locator('#threePanel').screenshot({
          path: resolve(directory, 'compact-' + state + '-3d-' + view.name + '.png'),
        });
      }
      const sectionToggle = page.locator('[data-action="section"]');
      if ((await sectionToggle.getAttribute('aria-pressed')) !== 'true') {
        await sectionToggle.click();
      }
      await waitForPaint(page);
      const section = page.locator('#sectionPanel');
      assert.ok(await section.isVisible(), 'BOX Section is hidden');
      await section.screenshot({
        path: resolve(directory, 'compact-' + state + '-section.png'),
      });
      assert.deepEqual(errors, [], 'Real UI v2 runtime errors');
      // The saved manufacturing History is not accepted until the browser
      // re-executes every Recipe operation from a fresh Si handle and
      // reproduces the saved OFF material model.
      if (state === 'off') {
        await page.locator('[data-action="domain:process"]').click();
        const recipeTab = page.locator('[data-action="process-mode:recipe"]');
        if (await recipeTab.isVisible()) await recipeTab.click();
        await page.locator('#recipeRunStart').selectOption('new-base');
        assert.doesNotMatch(
          await page.locator('#recipeValidation').innerText(),
          /✕/,
          'Compact process Recipe preflight failed in the browser',
        );
        const expectedSteps = source.processRecipe.steps.length;
        await page.locator('#recipeRunAllBtn').click();
        const clearHistory = page.getByRole('button', {
          name: 'Clear history',
          exact: true,
        });
        const keepHistory = page.getByRole('button', {
          name: 'Keep previous history',
          exact: true,
        });
        await page
          .getByRole('button', {
            name: /Clear history|Keep previous history/,
          })
          .first()
          .waitFor({ state: 'visible', timeout: 15000 });
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
        await assertSameMaterialGeometry(source.model, (await snapshot()).model, {
          areaToleranceUm2: 0.01,
        });
      }
      report.cases.push({
        state,
        projectLoaded: true,
        restorableVariant: true,
        materialGeometryEqual: true,
        maskElements: source.layout.elements.length,
        gdsAndOasBrowserExports: true,
        threeDReady: true,
        boxSectionVisible: true,
        fullRecipeReplayMatchesSavedOFFModel: state === 'off' ? true : 'shared OFF fabrication',
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
