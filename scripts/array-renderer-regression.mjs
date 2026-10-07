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
const browser = await launchBrowser();
const output = new URL('../test-results/array-renderer/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const THREE_READY_TIMEOUT_MS = 45000;
  page.setDefaultTimeout(THREE_READY_TIMEOUT_MS);
  const waitStage = async (label) => {
    const started = performance.now();
    console.log('ARRAY_RENDERER_STAGE_BEGIN', label);
    await waitForThreeReady(page, THREE_READY_TIMEOUT_MS);
    console.log(
      'ARRAY_RENDERER_STAGE_OK',
      label,
      Math.round(performance.now() - started),
      JSON.stringify(await page.locator('#threeHost').evaluate((el) => ({
        renderState: el.dataset.renderState,
        updateKind: el.dataset.rendererUpdateKind,
        sceneGeneration: el.dataset.sceneGeneration,
        surfacePlanBuildCount: el.dataset.surfacePlanBuildCount,
        presentationMs: el.dataset.rendererPresentationMs,
      }))),
    );
  };
  const errors = observePageErrors(page);
  await page.goto(baseUrl + '/app.html');
  await waitForAppReady(page);
  await page
    .locator('#openProjectInput')
    .setInputFiles(
      fileURLToPath(
        new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
      ),
    );
  await chooseConfirmation(page);
  await page.waitForFunction(() =>
    document.getElementById('statusText').textContent.startsWith('Opened '),
  );
  await closeFunctionPanel(page);
  await waitStage('initial');
  const snapshot = () => page.locator('#threeHost').evaluate((el) => ({ ...el.dataset }));
  const fast = await snapshot();
  assert.equal(fast.arrayInstances, '1885');
  assert.equal(fast.renderQuality, 'fast');
  assert.equal(fast.cooperativeSceneAssembly, 'true');
  assert.ok(Number(fast.rendererAssemblyMs) > 0, 'renderer profiling must record assembly time');
  assert.ok(
    Number(fast.derivedCapCacheMisses) > 0,
    'initial full-wafer render must populate derived cap triangulation data',
  );
  await page.locator('#threeFastBtn').click();
  console.log('ARRAY_RENDERER_STAGE_BEGIN', 'quality');
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost').dataset.renderQuality === 'quality' &&
      document.getElementById('threeHost').dataset.renderState === 'ready',
    null,
    { timeout: THREE_READY_TIMEOUT_MS },
  );
  console.log('ARRAY_RENDERER_STAGE_OK', 'quality');
  const quality = await snapshot();
  assert.ok(
    Number(quality.derivedCapCacheHits) > Number(fast.derivedCapCacheHits),
    'Fast → Quality rebuild must reuse canonical array-cap triangulation data',
  );
  for (const key of [
    'arrayInstances',
    'materialLayerIds',
    'surfaceTopology',
    'modelRevision',
    'processRevision',
  ])
    assert.equal(quality[key], fast[key], key + ' changed when switching display quality');
  await page.screenshot({ path: fileURLToPath(new URL('quality.png', output)) });
  await page.locator('#threePanel .three-opacity-control > summary').click();
  await page.locator('#threeOpacityRange').fill('0.5');
  await waitStage('opacity-0.5');
  const transparent = await snapshot();
  assert.equal(transparent.arrayInstances, '1885');
  assert.ok(
    Number(transparent.electricalRegionInternalCount) > 0,
    'Transparent array retains native buried electrical annotations',
  );
  assert.equal(transparent.materialLayerIds, fast.materialLayerIds);
  assert.equal(
    transparent.sceneGeneration,
    quality.sceneGeneration,
    'Opacity must not rebuild the physical scene',
  );
  assert.equal(
    transparent.surfacePlanBuildCount,
    quality.surfacePlanBuildCount,
    'Opacity must not rebuild the surface plan',
  );
  assert.equal(transparent.rendererUpdateKind, 'presentation');
  assert.equal(transparent.rendererAssemblyMs, '0');
  assert.ok(
    Number(transparent.presentationUpdateCount) > Number(quality.presentationUpdateCount || 0),
    'Opacity must take the persistent presentation path',
  );

  const stableResources = Object.fromEntries(
    ['sceneObjectCount', 'sceneGeometryCount', 'sceneMaterialCount', 'presentationObjectCount'].map(
      (key) => [key, transparent[key]],
    ),
  );
  for (let cycle = 0; cycle < 10; cycle++) {
    await page.locator('#threeOpacityRange').fill(cycle % 2 ? '0.5' : '1');
    await waitStage(`opacity-stress-${cycle + 1}`);
  }
  const stressOpacity = await snapshot();
  for (const [key, value] of Object.entries(stableResources)) {
    assert.equal(stressOpacity[key], value, `${key} changed across repeated opacity updates`);
  }
  assert.equal(stressOpacity.sceneGeneration, quality.sceneGeneration);
  assert.equal(stressOpacity.surfacePlanBuildCount, quality.surfacePlanBuildCount);

  const setBorders = async (checked) => {
    await page.locator('#threeBorders').evaluate((input, value) => {
      input.checked = Boolean(value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);
  };
  for (let cycle = 0; cycle < 6; cycle++) {
    await setBorders(cycle % 2 === 0);
    await waitStage(`border-stress-${cycle + 1}`);
  }
  const stressBorders = await snapshot();
  for (const [key, value] of Object.entries(stableResources)) {
    assert.equal(stressBorders[key], value, `${key} changed across repeated border updates`);
  }
  assert.equal(stressBorders.sceneGeneration, quality.sceneGeneration);
  assert.equal(stressBorders.surfacePlanBuildCount, quality.surfacePlanBuildCount);
  assert.equal(stressBorders.rendererUpdateKind, 'presentation');

  await page.locator('#threeOpacityRange').fill('0.5');
  await waitStage('opacity-final-0.5');
  await page.screenshot({ path: fileURLToPath(new URL('transparent.png', output)) });
  await page.locator('#threeOpacityRange').fill('1');
  await waitStage('opacity-final-1');
  const opaqueAgain = await snapshot();
  assert.equal(opaqueAgain.sceneGeneration, quality.sceneGeneration);
  assert.equal(opaqueAgain.surfacePlanBuildCount, quality.surfacePlanBuildCount);
  assert.equal(opaqueAgain.rendererUpdateKind, 'presentation');
  await setBorders(false);
  await waitStage('border-final-off');
  await page.locator('#threePanel .three-opacity-control > summary').click();
  await page.locator('#threeFastBtn').click();
  await waitStage('restore-fast');
  const restored = await snapshot();
  assert.equal(restored.renderQuality, 'fast');
  assert.equal(restored.surfaceTopology, fast.surfaceTopology);
  const canvas = page.locator('#threeHost canvas');
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(rect.x + rect.width * 0.5 + i * 4, rect.y + rect.height * 0.5 + i);
  await page.mouse.up();
  await waitStage('rotation');
  assert.deepEqual(errors, []);
  const report = {
    browserVersion: browser.version(),
    fast,
    quality,
    transparent,
    restored,
    rotationPassed: true,
    errors,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('ARRAY_RENDERER_OK');
  await context.close();
} finally {
  await browser.close();
}
