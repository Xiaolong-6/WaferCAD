// Browser regression for Recipe drafts, preflight ordering, prefix replay and Stop.
import assert from 'node:assert/strict';
import {
  assertNoPageErrors,
  gotoWelcome,
  launchBrowser,
  newUiContext,
  observePageErrors,
  openFunctionPanel,
  waitForAppReady,
  waitForStatus,
} from './test-helpers/ui.mjs';

const browser = await launchBrowser();
try {
  const context = await newUiContext(browser, { viewport: { width: 1365, height: 950 } });
  const page = await context.newPage();
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  await page.locator('#welcomeEmptyBtn').click();
  await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 30000 });
  await waitForAppReady(page);
  await openFunctionPanel(page, 'process');
  await page.locator('[data-process-input-mode="recipe"]').click();
  await page.locator('#recipeTemplateSelect').selectOption('deposit-etch');
  await page.locator('#recipeCodeTab').click();

  // R1: Invalid Format and Steps/Code switching do not erase an unapplied draft.
  const draft = 'deposit({ material: "Draft film", thickness: "25 nm", area: "full" });\ninvalid();';
  await page.locator('#recipeCodeEditor').fill(draft);
  await page.locator('#recipeFormatCodeBtn').click();
  assert.equal(await page.locator('#recipeCodeEditor').inputValue(), draft);
  await page.locator('#recipeStepsTab').click();
  await page.locator('#recipeCodeTab').click();
  assert.equal(await page.locator('#recipeCodeEditor').inputValue(), draft);

  // R2: Validate checks the visible draft and rejects valid but unapplied code.
  const prefixSource = [
    'deposit({ material: "UI film", thickness: "30 nm", area: "full" });',
    'etch({ target: "UI film", depth: "10 nm", area: "mask" });',
  ].join('\n');
  await page.locator('#recipeCodeEditor').fill(prefixSource);
  await page.locator('#recipeValidateBtn').click();
  assert.match(await page.locator('#recipeValidation').innerText(), /unapplied/i);
  await page.locator('#recipeApplyCodeBtn').click();
  await page.locator('#recipeStepsTab').click();

  // R4 + R6: Step 2 is invalid, but replaying only Step 1 commits it.
  const rows = page.locator('.recipe-step-row');
  await rows.nth(0).click();
  await page.locator('#recipeRunToBtn').click();
  await waitForStatus(page, /Recipe completed: 1\/1 steps committed/, 45000);
  assert.equal(await rows.nth(0).locator('.recipe-step-state').innerText(), '✓');
  assert.match(await page.locator('#recipeRunSummary').innerText(), /1\/1 steps committed/);
  await rows.nth(1).click();
  assert.equal(await rows.nth(0).locator('.recipe-step-state').innerText(), '✓');

  // R3: Invalid second Step MUST NOT rebuild Base or archive the current model.
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.locator('#recipeRunAllBtn').click();
  await waitForStatus(page, /Recipe preflight failed/);
  assert.ok(await page.locator('#layerLegend .legend-name').evaluateAll(
    (inputs) => inputs.some((element) => element.value === 'UI film'),
  ));
  assert.equal(await page.locator('#recipeRunSummary').count(), 1);

  // R2: Negative / nonsensical UI input remains invalid even if applied recipe was valid.
  await rows.nth(0).click();
  const thickness = page.locator('#recipeStepEditor label', { hasText: 'Thickness' }).locator('input').first();
  await thickness.fill('-1 nm');
  await thickness.press('Tab');
  await page.locator('#recipeValidateBtn').click();
  assert.equal(await thickness.getAttribute('aria-invalid'), 'true');
  assert.match(await page.locator('#recipeValidation').innerText(), /greater than zero/);
  await thickness.fill('abc');
  await thickness.press('Tab');
  assert.match(await page.locator('#recipeValidation').innerText(), /must be a number/);

  assertNoPageErrors(errors);
  await context.close();

  // R7 synthetic guard: a many-Step run yields to the browser and Stop stays clickable.
  // The original privately supplied OAS is not in the repository, so this is NOT a
  // reproduction of the reported imported-layout stall.
  const stressContext = await newUiContext(browser, { viewport: { width: 1365, height: 950 } });
  const stressPage = await stressContext.newPage();
  const stressErrors = observePageErrors(stressPage);
  await gotoWelcome(stressPage);
  await stressPage.locator('#welcomeEmptyBtn').click();
  await stressPage.waitForURL(/\\/app\\.html(?:\\?.*)?$/, { timeout: 30000 });
  await waitForAppReady(stressPage);
  await openFunctionPanel(stressPage, 'process');
  await stressPage.locator('[data-process-input-mode="recipe"]').click();
  await stressPage.locator('#recipeCodeTab').click();
  const stressRecipe = Array.from({ length: 40 }, (_, index) =>
    `deposit({ material: "Stop film ${index + 1}", thickness: "20 nm", area: "full" });`,
  ).join('\\n');
  await stressPage.locator('#recipeCodeEditor').fill(stressRecipe);
  await stressPage.locator('#recipeApplyCodeBtn').click();
  await stressPage.locator('#recipeRunAllBtn').click();
  await stressPage.locator('#recipeStopBtn').click({ timeout: 5000 });
  await stressPage.waitForFunction(
    () => document.getElementById('recipeStopBtn')?.disabled,
    null, { timeout: 45000 },
  );
  assert.match(await stressPage.locator('#recipeRunSummary').innerText(), /Stopped: [0-9]+\\/40/);
  assertNoPageErrors(stressErrors);
  await stressContext.close();
} finally {
  await browser.close();
}
console.log('WaferCAD Process Recipe safety browser regression: OK');
