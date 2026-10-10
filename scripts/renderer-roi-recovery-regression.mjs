// Scientific regression for bounded full-wafer ROI rejection and recovery.
// The ROI's point-budget guard must not leave an unhandled async rejection,
// destroy the previous valid scene, or strand #threeHost in "building".
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const output = new URL('../test-results/product-review/renderer-roi-recovery/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const errors = observePageErrors(page);
const report = { stage: 'boot', browserVersion: browser.version(), errors };
const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
const waitNewReadyFrame = async (previous, timeout = 120000) => {
  await page.waitForFunction(
    (serial) => {
      const host = document.getElementById('threeHost');
      return (
        host?.dataset.renderState === 'ready' &&
        Number(host.dataset.rendererFrameSerial || 0) > serial
      );
    },
    previous,
    { timeout },
  );
};

try {
  report.stage = 'load-fixture';
  await page.goto(baseUrl + '/app.html?rendererV3RoiTrace=1');
  await waitForAppReady(page);
  await page.locator('#openProjectInput').setInputFiles(
    fileURLToPath(
      new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
    ),
  );
  await chooseConfirmation(page);
  await page.waitForFunction(
    () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
    null,
    { timeout: 120000 },
  );
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 120000);

  report.stage = 'quality-transparent-scene';
  let serial = Number((await snapshot()).rendererFrameSerial || 0);
  await page.locator('#threeFastBtn').evaluate((el) => {
    el.value = 'quality';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitNewReadyFrame(serial);
  serial = Number((await snapshot()).rendererFrameSerial || 0);
  await page.locator('#threeOpacityRange').evaluate((el) => {
    el.value = '0.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitNewReadyFrame(serial);
  report.reference = await snapshot();
  assert.equal(report.reference.renderQuality, 'quality');
  assert.ok(Number(report.reference.arrayInstances || 0) >= 625);
  assert.ok(Number(report.reference.rendererDrawTriangles) > 0);

  report.stage = 'create-bounded-roi';
  await page.locator('#focusEditor').evaluate((el) => {
    const overflow = el.closest('.view-more-control');
    if (overflow) overflow.open = true;
    el.open = true;
  });
  await page.locator('.roi-tool[data-tool="rect"]').click();
  await page.locator('#mainPanel details[open]').evaluateAll((nodes) => {
    for (const node of nodes) node.open = false;
  });
  const rect = await page.locator('#mainCanvas').boundingBox();
  assert.ok(rect && rect.width > 0 && rect.height > 0);
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.6, {
    steps: 4,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () => {
      const host = document.getElementById('threeHost');
      return (
        /^ROI created\./.test(document.getElementById('statusText')?.textContent || '') &&
        ['error', 'ready'].includes(host?.dataset.renderState)
      );
    },
    null,
    { timeout: 30000 },
  );
  report.rejected = await snapshot();
  assert.equal(report.rejected.renderState, 'error', 'expected bounded ROI guard');
  assert.equal(report.rejected.renderPhase, 'failed');
  assert.equal(report.rejected.rendererErrorCode, 'geometry-point-budget');
  assert.match(report.rejected.renderError, /bounded geometry point budget/);
  assert.equal(report.rejected.modelRevision, report.reference.modelRevision);
  assert.equal(report.rejected.processRevision, report.reference.processRevision);
  // The previous scene remains retained for recovery, with its generation
  // unchanged because failed topology was rejected before mesh teardown.
  assert.equal(report.rejected.sceneGeneration, report.reference.sceneGeneration);
  await page.locator('#threeHost canvas').screenshot({
    path: fileURLToPath(new URL('roi-error.png', output)),
  });
  assert.deepEqual(errors, [], 'bounded ROI rejection must not become a page error');

  report.stage = 'clear-roi-and-restore';
  serial = Number((await snapshot()).rendererFrameSerial || 0);
  await page.locator('#clearRoiBtn').evaluate((el) => el.click());
  await waitNewReadyFrame(serial);
  report.restored = await snapshot();
  assert.equal(report.restored.renderState, 'ready');
  assert.equal(report.restored.renderError, undefined);
  assert.equal(report.restored.rendererErrorCode, undefined);
  assert.equal(report.restored.modelRevision, report.reference.modelRevision);
  assert.equal(report.restored.processRevision, report.reference.processRevision);
  assert.equal(report.restored.sceneGeneration, report.reference.sceneGeneration);
  assert.equal(report.restored.rendererDrawTriangles, report.reference.rendererDrawTriangles);
  await page.locator('#threeHost canvas').screenshot({
    path: fileURLToPath(new URL('roi-restored.png', output)),
  });
  assert.deepEqual(errors, []);
  report.passed = true;
  report.stage = 'passed';
} catch (error) {
  report.passed = false;
  report.error = String(error);
  report.final = await snapshot().catch(() => null);
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('RENDERER_ROI_RECOVERY', JSON.stringify(report));
  await context.close();
  await browser.close();
}
