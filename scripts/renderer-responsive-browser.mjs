import { resolveRendererWorkstationUrl } from './test-helpers/renderer-workstation-route.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  baseUrl,
  chooseConfirmation,
  closeFunctionPanel,
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
} from './test-helpers/ui.mjs';

const output = new URL('../test-results/renderer-responsive/', import.meta.url);
await mkdir(output, { recursive: true });
const fixture = fileURLToPath(
  new URL('../site/examples/previews/tio2-metalens-four-unit.wafercad', import.meta.url),
);
const workstationUrl = await resolveRendererWorkstationUrl(baseUrl);
const browser = await launchBrowser();
const report = { passed: false, stage: 'initialization' };
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const errors = observePageErrors(page);
    const host = page.locator('#threeHost');
    const snapshot = () => host.evaluate((node) => ({ ...node.dataset }));
    const load = async () => {
      const input = page.locator('#openProjectInput');
      await input.setInputFiles([]);
      await input.setInputFiles(fixture);
      await chooseConfirmation(page);
      await page.waitForFunction(
        () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
        undefined,
        { timeout: 90000 },
      );
    };
    await page.goto(workstationUrl + '?rendererResponsiveModelStage=1&rendererV4GpuCensus=1');
    await waitForAppReady(page);
    await load();
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 90000);
    const first = await snapshot();
    assert.equal(first.renderState, 'ready');
    assert.ok(Number(first.rendererFrameSerial || 0) > 0);
    report.first = {
      serial: Number(first.rendererFrameSerial),
      generation: Number(first.sceneGeneration),
    };
    report.stage = 'reimport-staged-model';
    await load();
    await page.waitForFunction(
      (priorFrame) => {
        const node = document.getElementById('threeHost');
        return node?.dataset.renderState === 'ready' &&
          Number(node.dataset.rendererStagedModelBuilds || 0) >= 1 &&
          Number(node.dataset.rendererCommittedModelSwaps || 0) >= 1 &&
          Number(node.dataset.rendererFrameSerial || 0) > priorFrame;
      },
      report.first.serial,
      { timeout: 90000 },
    );
    const after = await snapshot();
    assert.equal(after.rendererDisplayedState, undefined, 'outdated label must clear after commit');
    assert.equal(
      after.rendererStagedModelBuilds,
      after.rendererCommittedModelSwaps,
      'every completed model staging operation must commit exactly once',
    );
    assert.ok(Number(after.sceneGeneration) > report.first.generation);
    assert.equal(after.v4GpuResourceStatus, 'measured');
    assert.equal(after.v4GpuResourceComplete, 'true');
    assert.ok(Number(after.v4GpuResourceSceneGroups) <= 2, 'old scene resources retired');
    await host.screenshot({ path: fileURLToPath(new URL('committed.png', output)) });
    assert.deepEqual(errors, [], 'no browser errors');
    report.after = {
      serial: Number(after.rendererFrameSerial),
      staged: Number(after.rendererStagedModelBuilds),
      committed: Number(after.rendererCommittedModelSwaps),
      retainedGroups: Number(after.v4GpuResourceSceneGroups),
    };
    report.passed = true;
    report.stage = 'passed';
  } finally {
    await context.close();
  }
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  console.log('RENDERER_RESPONSIVE_ACCEPTANCE', JSON.stringify(report));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
