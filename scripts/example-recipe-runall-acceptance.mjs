// Real browser acceptance: user-visible Run All from a cleared Main for every
// production example. Run with a static server on WAFERCAD_URL (default 4173).
// This is intentionally separate from History/Recipe metadata-only assertions.
import assert from 'node:assert/strict';
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
} from './test-helpers/ui.mjs';
import { exportCurrentProject } from './test-helpers/product-scientific.mjs';

const browser = await launchBrowser();
const only = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);
const examples = BUNDLED_EXAMPLES.filter((example) => !only || example.id === only);
assert.ok(examples.length, 'No matching bundled example was found.');
try {
  for (const example of examples) {
    const context = await newUiContext(browser, { viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    const errors = observePageErrors(page);
    try {
      await page.goto(
        `${baseUrl}/app.html?start=example&example=${encodeURIComponent(example.id)}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 },
      );
      await waitForAppReady(page);
      await page.waitForFunction(
        () => !!document.querySelector('#layerLegend .legend-name'),
        null,
        { timeout: 120000 },
      );
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
      await page.locator('#recipeRunAllBtn').click();
      await chooseConfirmation(page, 'clear');
      await page.waitForFunction(
        ({ count }) => {
          const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
          if (/^(Completed|Failed|Stopped):/.test(summary)) return true;
          const status = document.querySelector('#statusText')?.textContent || '';
          return /Recipe failed at Step|Recipe preflight failed/.test(status);
        },
        { count },
        { timeout: 900000 },
      );
      const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
      const status = (await page.locator('#statusText').innerText()).trim();
      assert.match(summary, new RegExp(`^Completed: ${count}/${count} steps committed`),
        `${example.id}: Run All failed or stopped: ${summary}; status: ${status}`);

      const exported = await exportCurrentProject(page, 120000);
      assert.equal(exported.processRecipe?.steps?.length, count,
        `${example.id}: rebuilt export must retain the complete Recipe`);
      assert.equal(exported.snapshotBranches?.activeBranchId, 'main',
        `${example.id}: rebuilding should create a clean Main`);
      assert.ok(exported.snapshotBranches?.nodes?.length >= count,
        `${example.id}: rebuilt History omits Process Steps`);
      assert.ok(exported.model.layers.length > 1,
        `${example.id}: Kernel replay left only the Base substrate`);
      assertNoPageErrors(errors, `${example.id}: uncaught browser errors`);
      console.log(`${example.id}: Run All completed, exported ${count} History/Recipe steps`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log('All selected bundled examples replayed from clean Main in Chromium.');
