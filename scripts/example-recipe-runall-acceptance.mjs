// Real browser acceptance: user-visible Run All from a cleared Main for every
// production example. Run with a static server on WAFERCAD_URL (default 4173).
// This is intentionally separate from History/Recipe metadata-only assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import {
  assertNoPageErrors,
  baseUrl,
  chooseConfirmation,
  launchBrowser,
  newUiContext,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForStatus,
} from './test-helpers/ui.mjs';
import { exportCurrentProject } from './test-helpers/product-scientific.mjs';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

function materialFootprintPerimeter(model, name, vectorApi) {
  const ids = new Set((model.layers || []).filter((layer) => layer.name === name).map((layer) => layer.id));
  const geoms = (model.regions || [])
    .filter((region) => region.stack.some((segment) => ids.has(segment.layerId)))
    .map((region) => region.geom);
  if (!geoms.length) return 0;
  let perimeter = 0;
  for (const polygon of vectorApi.unionGeometries(geoms)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        const current = ring[i];
        const next = ring[(i + 1) % ring.length];
        perimeter += Math.hypot(current[0] - next[0], current[1] - next[1]);
      }
    }
  }
  return perimeter;
}

async function assertSameCanonicalArrayGeometry(expected, actual) {
  assert.equal(actual.kernel, expected.kernel, 'Run All changed canonical array kernel');
  const actualSites = new Map(actual.array?.instances?.map((site) => [site.id, site]));
  const expectedSites = expected.array.instances;
  assert.equal(actualSites.size, expectedSites.length, 'Run All lost/duplicated canonical sites');
  const { loadGeometryKernel } = await import('./process-benchmarks.mjs');
  await loadGeometryKernel();
  const vectorApi = await import('../site/vector-geometry.js');
  const expectedTemplates = new Map(expected.array.templates.map((item) => [item.id, item.model]));
  const actualTemplates = new Map(actual.array.templates.map((item) => [item.id, item.model]));
  const checkedPairs = new Set();
  let slabsChecked = 0;
  let maxMismatchAreaUm2 = 0;
  for (const expectedSite of expectedSites) {
    const actualSite = actualSites.get(expectedSite.id);
    assert.ok(actualSite, 'Run All lost array instance ' + expectedSite.id);
    assert.deepEqual(
      [actualSite.x, actualSite.y, actualSite.role],
      [expectedSite.x, expectedSite.y, expectedSite.role],
      'Run All changed canonical site placement/role ' + expectedSite.id,
    );
    const key = expectedSite.templateId + '|' + actualSite.templateId;
    if (checkedPairs.has(key)) continue;
    checkedPairs.add(key);
    const expectedLeaf = expectedTemplates.get(expectedSite.templateId);
    const actualLeaf = actualTemplates.get(actualSite.templateId);
    assert.ok(expectedLeaf && actualLeaf, 'Run All references a missing physical template');
    // Published geometry quantizes each XY coordinate to 0.1 nm. A boundary
    // displaced by at most one quantum changes area by at most perimeter×quantum
    // to first order. Allow a 10% numeric margin, capped at 150 nm² per slab.
    // This remains sensitive to a missing meta-atom or a filled annular gap.
    const perimeterUm = materialFootprintPerimeter(expectedLeaf, 'TiO2', vectorApi);
    const areaToleranceUm2 = Math.max(
      1e-7,
      Math.min(1.5e-4, 1.1e-4 * perimeterUm),
    );
    let comparison;
    try {
      comparison = await assertSameMaterialGeometry(expectedLeaf, actualLeaf, {
        areaToleranceUm2,
      });
    } catch (error) {
      throw new Error(
        `Array geometry differs at ${expectedSite.id} ${expectedSite.templateId} -> ${actualSite.templateId}: ${error.message}`,
      );
    }
    slabsChecked += comparison.slabsChecked;
    maxMismatchAreaUm2 = Math.max(maxMismatchAreaUm2, comparison.maxMismatchAreaUm2);
  }
  return {
    verified: true,
    materialCount: expected.layers.length,
    sitesChecked: expectedSites.length,
    templatePairsChecked: checkedPairs.size,
    slabsChecked,
    maxMismatchAreaUm2,
  };
}

const browser = await launchBrowser();
const historyChoice = process.argv.includes('--history=keep') ? 'keep' : 'clear';
const requestedVariant =
  process.argv.find((arg) => arg.startsWith('--variant='))?.slice(10) || null;
const only = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);
const examples = BUNDLED_EXAMPLES.filter((example) => !only || example.id === only);
assert.ok(examples.length, 'No matching bundled example was found.');
try {
  for (const example of examples) {
    const context = await newUiContext(browser, { viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    const errors = observePageErrors(page);
    const browserEvents = [];
    let lastStep = '';
    page.on('crash', () => browserEvents.push('Chromium page crashed'));
    page.on('close', () => browserEvents.push('Chromium page closed'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) browserEvents.push(`Navigation: ${frame.url()}`);
    });
    page.on('console', (message) => {
      if (message.text().startsWith('Recipe batch progress:')) {
        lastStep = message.text();
        console.log(`${example.id}: ${lastStep}`);
      }
    });
    try {
      await page.goto(
        `${baseUrl}/app.html?start=example&example=${encodeURIComponent(example.id)}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await waitForAppReady(page);
      await waitForStatus(page, /Opened .*\.wafercad\./, 120000);
      await page.waitForFunction(
        () => !!document.querySelector('#layerLegend .legend-name'),
        null,
        { timeout: 120000 },
      );
      if (requestedVariant) {
        await openFunctionPanel(page, 'snapshots', { timeout: 20000 });
        const variant = page.locator(`.history-variant[data-variant-id="${requestedVariant}"]`);
        await variant.waitFor({ state: 'attached', timeout: 30000 });
        // A literature Variant can be nested under collapsed family/parent
        // Variants. Open ancestors through their real UI controls first.
        const parentIds = await variant.evaluate((element) => {
          const ids = [];
          let ancestor = element.parentElement?.closest('.history-variant');
          while (ancestor) {
            ids.unshift(ancestor.dataset.variantId);
            ancestor = ancestor.parentElement?.closest('.history-variant');
          }
          return ids;
        });
        for (const parentId of parentIds) {
          const parent = page.locator(`.history-variant[data-variant-id="${parentId}"]`);
          const body = parent.locator(':scope > .history-variant-body');
          if (await body.evaluate((element) => element.hidden)) {
            await parent.locator(':scope > .history-variant-head .history-variant-toggle').click();
          }
        }
        await variant.locator(':scope > .history-variant-head .history-variant-name').click();
        await page.waitForFunction(
          (id) =>
            document.querySelector(`.history-variant[data-variant-id="${id}"]`)?.dataset.active ===
            'true',
          requestedVariant,
          { timeout: 30000 },
        );
      }
      const sourceProject = await exportCurrentProject(page, 120000);
      await openFunctionPanel(page, 'process', { timeout: 20000 });
      await page.locator('[data-process-input-mode="recipe"]').click();
      const recipeRows = page.locator('.recipe-step-row');
      const count = await recipeRows.count();
      assert.ok(count > 0, `${example.id}: opening the example lost its Recipe`);
      assert.doesNotMatch(
        await page.locator('#recipeValidation').innerText(),
        /✕|mask.*missing|material.*does not exist/i,
        `${example.id}: Recipe preflight reported an invalid reconstruction`,
      );
      await page.locator('#recipeRunStart').selectOption('new-base');
      assert.doesNotMatch(
        await page.locator('#recipeValidation').innerText(),
        /✕/,
        `${example.id}: invalid new-Main preflight`,
      );

      // The user can choose either clear or archive. This test exercises
      // "Clear history"; product UI's alternative is "Keep (new Main)".
      // Observe actual committed-step progression without modifying product code.
      await page.evaluate(() => {
        const progress = document.getElementById('recipeProgressCount');
        if (!progress) return;
        const log = () => {
          const value = progress.textContent?.trim();
          if (value) console.info(`Recipe batch progress: ${value}`);
        };
        new globalThis.MutationObserver(log).observe(progress, { childList: true, subtree: true });
      });
      console.log(`${example.id}: beginning ${count}-Step Kernel rebuild`);
      await page.locator('#recipeRunAllBtn').click();
      await chooseConfirmation(page, historyChoice);
      await page.waitForFunction(
        () => {
          const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
          if (/^(Completed|Failed|Stopped):/.test(summary)) return true;
          const status = document.querySelector('#statusText')?.textContent || '';
          return /Recipe failed at Step|Recipe preflight failed/.test(status);
        },
        null,
        { timeout: 900000 },
      );
      const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
      const status = (await page.locator('#statusText').innerText()).trim();
      assert.match(
        summary,
        new RegExp(`^Completed: ${count}/${count} steps committed`),
        `${example.id}: Run All failed or stopped: ${summary}; status: ${status}`,
      );

      console.log(`${example.id}: browser reports ${summary}; checking final UI and export`);
      const exported = await exportCurrentProject(page, 120000);
      assert.equal(
        exported.processRecipe?.steps?.length,
        count,
        `${example.id}: rebuilt export must retain the complete Recipe`,
      );
      if (example.id === 'tio2-metalens-four-unit') {
        assert.deepEqual(
          exported.layout,
          sourceProject.layout,
          'Full-array Run All must retain the exact exportable 4725-site Mask',
        );
        assert.deepEqual(
          exported.processRecipe.steps,
          sourceProject.processRecipe.steps,
          'Full-array Run All must preserve the editable nine-step Recipe',
        );
      }
      assert.equal(
        exported.snapshotBranches?.activeBranchId,
        'main',
        `${example.id}: rebuilding should create a fresh Main`,
      );
      if (historyChoice === 'keep') {
        assert.ok(
          exported.snapshotBranches?.branches?.length > 1,
          `${example.id}: Keep should archive the previous History as a Variant`,
        );
      } else {
        assert.equal(
          exported.snapshotBranches?.branches?.length,
          1,
          `${example.id}: Clear should remove all previous Variants`,
        );
      }
      assert.ok(
        exported.snapshotBranches?.nodes?.length >= count,
        `${example.id}: rebuilt History omits Process Steps`,
      );
      // The material-name/count checks below cannot detect a 0.35 nm film
      // replayed as 0.40 nm. Check the actual Kernel request retained in History.
      const processSteps = exported.processRecipe.steps.filter(
        (step) => step.command !== 'snapshot',
      );
      const replayNodes = exported.snapshotBranches.nodes.filter(
        (node) => node.branchId === 'main',
      );
      assert.equal(replayNodes.length, processSteps.length);
      for (const [index, step] of processSteps.entries()) {
        if (step.command === 'record') continue;
        if (step.command === 'liftoff') {
          const replay = replayNodes[index].operation?.replay?.params;
          assert.ok(
            replay?.sacrificialLayerId,
            `${example.id}: Step ${index + 1} lost its lift-off sacrificial material`,
          );
          assert.equal(
            replay.thickness ?? 0,
            0,
            `${example.id}: Step ${index + 1} lift-off unexpectedly gained a physical depth`,
          );
          continue;
        }
        const expected = step.params.thicknessUm ?? step.params.depthUm;
        const actual = replayNodes[index].operation?.replay?.params?.thickness;
        assert.ok(
          Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12,
          `${example.id}: Step ${index + 1} changed physical length ${expected} to ${actual}`,
        );
      }
      assert.ok(
        exported.model.layers.length > 1,
        `${example.id}: Kernel replay left only the Base substrate`,
      );
      assert.deepEqual(
        exported.model.layers.map((layer) => layer.name).sort(),
        sourceProject.model.layers.map((layer) => layer.name).sort(),
        `${example.id}: recreated material list differs from the saved example`,
      );
      assert.equal(
        exported.model.implants.length,
        sourceProject.model.implants.length,
        `${example.id}: rebuilt implant count differs`,
      );
      assert.equal(
        exported.model.electricalRegions.length,
        sourceProject.model.electricalRegions.length,
        `${example.id}: rebuilt electrical region count differs`,
      );
      if (sourceProject.model.array) {
        assert.equal(
          exported.model.array?.instances.length,
          sourceProject.model.array.instances.length,
          `${example.id}: rebuilt wafer array site count differs`,
        );
      }
      // MAGIC-1000 requires stricter scientific acceptance than matching
      // material labels/counts. Compare 2.5D physical material occupancy:
      // exact XY polygons, per material, for every distinct Z slab.
      const geometryComparison =
        example.id === 'magic-1000-mos2-beol'
          ? await assertSameMaterialGeometry(sourceProject.model, exported.model)
          : example.id === 'tio2-metalens-four-unit'
            ? await assertSameCanonicalArrayGeometry(sourceProject.model, exported.model)
            : null;
      if (geometryComparison) {
        console.log(
          `${example.id}: strict XY/Z geometry parity verified: ${geometryComparison.materialCount} materials, ${geometryComparison.slabsChecked} material-Z slabs, largest mismatched XY area ${geometryComparison.maxMismatchAreaUm2} um2`,
        );
      }
      assertNoPageErrors(errors, `${example.id}: uncaught browser errors`);
      await mkdir('test-results/example-recipe-runall', { recursive: true });
      await writeFile(
        `test-results/example-recipe-runall/${example.id}${requestedVariant ? '-' + requestedVariant : ''}-${historyChoice}.json`,
        JSON.stringify(
          {
            example: example.id,
            variant: requestedVariant,
            historyChoice,
            outcome: 'Completed',
            committedSteps: count,
            ...(geometryComparison ? { geometryComparison } : {}),
            sourceLayerNames: sourceProject.model.layers.map((layer) => layer.name),
            exportedLayerNames: exported.model.layers.map((layer) => layer.name),
            implants: exported.model.implants.length,
            electricalRegions: exported.model.electricalRegions.length,
            waferSites: exported.model.array?.instances?.length || null,
            historyNodes: exported.snapshotBranches.nodes.length,
          },
          null,
          2,
        ) + '\n',
      );
      console.log(`${example.id}: Run All completed, exported ${count} History/Recipe steps`);
    } catch (error) {
      // Preserve actionable evidence when a large-array replay exhausts
      // Chromium memory, navigates unexpectedly or blocks the main thread.
      const state = await Promise.race([
        page
          .evaluate(() => ({
            url: location.href,
            ready: document.documentElement.dataset.appReady,
            status: document.getElementById('statusText')?.textContent,
            progress: document.getElementById('recipeProgressCount')?.textContent,
            summary: document.getElementById('recipeRunSummary')?.textContent,
            projectButton: {
              exists: Boolean(
                document.querySelector('.workstation-rail-button[data-tool="project"]'),
              ),
              visible: Boolean(
                document
                  .querySelector('.workstation-rail-button[data-tool="project"]')
                  ?.checkVisibility(),
              ),
            },
            threeState: document.getElementById('threeHost')?.dataset?.renderState,
            threeError: document.getElementById('threeHost')?.dataset?.renderError,
          }))
          .catch((reason) => ({ error: String(reason) })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ error: 'UI unresponsive after 4 s' }), 4000),
        ),
      ]);
      const details = {
        example: example.id,
        error: error.message,
        lastStep,
        browserEvents,
        pageClosed: page.isClosed(),
        pageState: state,
        pageErrors: errors,
      };
      console.error(`${example.id}: diagnostic ${JSON.stringify(details)}`);
      await mkdir('test-results/example-recipe-runall', { recursive: true });
      await writeFile(
        `test-results/example-recipe-runall/${example.id}.json`,
        JSON.stringify(details, null, 2),
      );
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log('All selected bundled examples replayed from clean Main in Chromium.');
