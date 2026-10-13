// P2.2A: exercise real multi-layer rough geometry from the curated tandem example.
// This checks cooperative CPU staging; it is not a GPU upload/FPS benchmark.
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

const output = new URL('../test-results/renderer-responsive-rough/', import.meta.url);
await mkdir(output, { recursive: true });
const url = await resolveRendererWorkstationUrl(baseUrl);
const browser = await launchBrowser();
const result = { passed: false, stage: 'boot' };
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    await page.goto(url + '?rendererResponsiveRoughBudget=1&rendererResponsiveMetrics=1');
    await waitForAppReady(page);
    result.stage = 'open-rough-tandem';
    await page
      .locator('#openProjectInput')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../site/examples/fully-textured-perovskite-silicon-tandem.wafercad',
            import.meta.url,
          ),
        ),
      );
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout: 120000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    result.stage = 'wait-cooperative-detailed-geometry';
    await page.waitForFunction(
      () => {
        const host = document.getElementById('threeHost');
        const canvas = host?.querySelector('canvas');
        return (
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererRoughAssemblyUnits || 0) >= 8 &&
          host.dataset.rendererRoughAssemblyCancelled === 'false' &&
          canvas?.dataset.roughMeshMode === 'detailed'
        );
      },
      null,
      { timeout: 180000 },
    );
    const data = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
    assert.ok(Number(data.rendererRoughAssemblyUnits) >= 8, 'multiple rough surface units');
    assert.ok(Number(data.rendererRoughAssemblyYields) >= 1, 'frame/task boundaries yielded');
    assert.ok(
      Number(data.rendererRoughRetainedPreviewMeshes || 0) > 0,
      'previous rough preview must remain owned until detailed geometry commits',
    );
    assert.ok(
      Number(data.rendererRoughRefinementSwaps || 0) >= 1,
      'one transactional rough detail swap must finish',
    );
    assert.ok(
      Number(data.rendererRoughStagedMeshes || 0) >= Number(data.rendererRoughAssemblyUnits),
      'new exact rough objects were staged before commit',
    );
    assert.equal(data.rendererRoughAssemblyCancelled, 'false');
    assert.ok(Number.isFinite(Number(data.rendererRoughAssemblyMaxUnitMs)));
    assert.ok(Number(data.rendererFrameSerial || 0) > 0);
    assert.deepEqual(errors, [], 'no unexpected browser errors');
    result.rough = {
      units: Number(data.rendererRoughAssemblyUnits),
      retainedPreviewMeshes: Number(data.rendererRoughRetainedPreviewMeshes),
      stagedMeshes: Number(data.rendererRoughStagedMeshes),
      committedSwaps: Number(data.rendererRoughRefinementSwaps),
      yields: Number(data.rendererRoughAssemblyYields),
      maxUnitMs: Number(data.rendererRoughAssemblyMaxUnitMs),
      wallMs: Number(data.rendererRoughAssemblyWallMs),
      frameSerial: Number(data.rendererFrameSerial),
    };
    result.passed = true;
    result.stage = 'passed';
  } finally {
    await context.close();
  }
} catch (error) {
  result.error = String(error);
  throw error;
} finally {
  console.log('RENDERER_RESPONSIVE_ROUGH_ACCEPTANCE', JSON.stringify(result));
  await writeFile(new URL('report.json', output), JSON.stringify(result, null, 2) + '\n');
  await browser.close();
}
