// Actual Manual Process UI: Both applies one atomic Front/Back transaction.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-manual-both');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 960 },
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const report = { result: 'running', cases: [] };

try {
  await page.goto(`${base}/app.html?start=empty`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const initial = await snapshot();
  assert.equal(initial.model.layers.length, 1);
  await page.locator('[data-action="domain:process"]').click();
  const face = page.locator('#faceToggleBtn');
  const faceOptions = await face
    .locator('option')
    .evaluateAll((nodes) => nodes.map((n) => n.value));
  assert.deepEqual(faceOptions, ['front', 'back', 'both']);
  await face.selectOption('both');
  await page.locator('#operationArea').selectOption('full');
  await page.locator('#growthMode').selectOption('conformal');
  await page.locator('#layerName').fill('Dual ALD');
  await page.locator('#operationThickness').fill('0.2');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().model.layers.length === 3,
    null,
    { timeout: 120000 },
  );
  const deposited = await snapshot();
  const [front, back] = deposited.model.layers.slice(1);
  assert.notEqual(front.id, back.id, 'One Process transaction creates two layer IDs');
  assert.equal(front.processFace, 'front');
  assert.equal(back.processFace, 'back');
  assert.equal(front.pairedLayerId, back.id);
  assert.equal(back.pairedLayerId, front.id);
  assert.ok(front.processGroupId);
  assert.equal(front.processGroupId, back.processGroupId);
  assert.equal(deposited.workflow.processFace, 'both');
  assert.equal(deposited.workflow.steps.length, 1, 'One logical History step');
  report.cases.push('deposit:two-distinct-paired-layers');

  await page.locator('#operationType').selectOption('grow');
  const growOptions = await page
    .locator('#targetLayer option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.deepEqual(growOptions, [front.id], 'Extend offers only the linked Front film');
  await page.locator('#targetLayer').selectOption(front.id);
  await page.locator('#growthMode').selectOption('direct');
  await page.locator('#operationThickness').fill('0.05');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.steps.length === 2,
    null,
    { timeout: 120000 },
  );
  const extended = await snapshot();
  assert.equal(extended.model.layers.length, 3);
  assert.equal(extended.workflow.steps.at(-1).operation.face, 'both');
  report.cases.push('extend:paired-target-atomic');

  await page.locator('#operationType').selectOption('etch');
  const etchOptions = await page
    .locator('#etchTargetLayer option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.ok(etchOptions.includes(front.id));
  assert.ok(!etchOptions.includes(back.id), 'Back film cannot be the canonical Both target');
  await page.locator('#etchTargetLayer').selectOption(front.id);
  await page.locator('#operationThickness').fill('0.02');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.steps.length === 3,
    null,
    { timeout: 120000 },
  );
  const etched = await snapshot();
  assert.equal(etched.workflow.steps.at(-1).operation.face, 'both');
  assert.equal(etched.model.layers.length, 3);
  report.cases.push('etch:paired-selective-target');

  await page.locator('#operationType').selectOption('liftoff');
  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
  await page.locator('#operationType').selectOption('etch');
  await page.locator('#etchProfile').selectOption('planarize');
  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), true);
  assert.equal((await snapshot()).workflow.steps.length, 3);
  await face.selectOption('front');
  assert.equal(await page.locator('#applyOperationBtn').isDisabled(), false);
  await face.selectOption('both');
  report.cases.push('unsupported-operations:fail-closed');

  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().workflow.dirty === false,
    null,
    { timeout: 120000 },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  const restored = await snapshot();
  assert.deepEqual(restored.model, etched.model, 'Autosave/reload preserves paired geometry');
  assert.equal(restored.workflow.steps.length, 3, 'History stays logical after reload');
  assert.deepEqual(errors, []);
  report.cases.push('recovery:pair-and-history-preserved');
  report.result = 'pass';
  console.log('V2_MANUAL_BOTH_OK', JSON.stringify(report.cases));
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || String(error);
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  console.error('V2_MANUAL_BOTH_FAILED', report.error);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
