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
  page.on('console', (msg) => {
    if (msg.text().startsWith('WAFERCAD_VARIANT_STAGE'))
      console.log('ARRAY_RENDERER_BROWSER_PROFILE', msg.text());
  });
  const THREE_READY_TIMEOUT_MS = 45000;
  page.setDefaultTimeout(THREE_READY_TIMEOUT_MS);
  const frameSerial = () =>
    page.locator('#threeHost').evaluate((el) => Number(el.dataset.rendererFrameSerial || 0));
  const waitStage = async (
    label,
    timeout = THREE_READY_TIMEOUT_MS,
    previousFrameSerial = null,
  ) => {
    const started = performance.now();
    console.log('ARRAY_RENDERER_STAGE_BEGIN', label);
    await waitForThreeReady(page, timeout);
    if (previousFrameSerial != null) {
      await page.waitForFunction(
        (previous) => {
          const host = document.getElementById('threeHost');
          return (
            host?.dataset.renderState === 'ready' &&
            Number(host.dataset.rendererFrameSerial || 0) > previous
          );
        },
        previousFrameSerial,
        { timeout },
      );
    }
    const diagnostics = await page.locator('#threeHost').evaluate((el) => ({
      renderState: el.dataset.renderState,
      updateKind: el.dataset.rendererUpdateKind,
      sceneGeneration: el.dataset.sceneGeneration,
      surfacePlanBuildCount: el.dataset.surfacePlanBuildCount,
      presentationMs: el.dataset.rendererPresentationMs,
      topologyMs: el.dataset.rendererTopologyMs,
      smoothCapsMs: el.dataset.rendererSmoothCapsMs,
      sidewallsMs: el.dataset.rendererSidewallsMs,
      annotationsMs: el.dataset.rendererAnnotationsMs,
      assemblyMs: el.dataset.rendererAssemblyMs,
      frameSerial: el.dataset.rendererFrameSerial,
      frameMs: el.dataset.rendererFrameMs,
      drawCalls: el.dataset.rendererDrawCalls,
      drawTriangles: el.dataset.rendererDrawTriangles,
      sceneVariant: el.dataset.sceneVariant,
      sceneObjects: el.dataset.sceneObjectCount,
      sceneGeometries: el.dataset.sceneGeometryCount,
      sceneMaterials: el.dataset.sceneMaterialCount,
      retainedObjects: el.dataset.sceneRetainedObjectCount,
      retainedGeometries: el.dataset.sceneRetainedGeometryCount,
      retainedMaterials: el.dataset.sceneRetainedMaterialCount,
      triangleKinds: el.dataset.sceneTriangleKinds,
      topTriangleObjects: el.dataset.sceneTopTriangleObjects,
    }));
    // Include the host evaluation/compositor blocking time: the old timer
    // reported a 0.67 s cold variant despite ~37 s to the actual first frame.
    const elapsed = performance.now() - started;
    console.log('ARRAY_RENDERER_STAGE_OK', label, Math.round(elapsed), JSON.stringify(diagnostics));
    return elapsed;
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

  // First transparent transition builds and caches a transparency-optimized
  // scene variant while reusing the physical ownership plan.
  const beforeColdFrame = await frameSerial();
  await page.locator('#threeOpacityRange').fill('0.5');
  const coldTransparentMs = await waitStage('opacity-cold-transparent', 120000, beforeColdFrame);
  const transparentCold = await snapshot();
  assert.ok(
    coldTransparentMs < 15000,
    `cold transparent variant build must stay below 15 s, got ${coldTransparentMs.toFixed(1)} ms`,
  );
  assert.equal(transparentCold.arrayInstances, '1885');
  assert.ok(
    Number(transparentCold.electricalRegionInternalCount) > 0,
    'Transparent array retains native buried electrical annotations',
  );
  assert.equal(transparentCold.materialLayerIds, fast.materialLayerIds);
  assert.equal(
    transparentCold.sceneGeneration,
    quality.sceneGeneration,
    'Scene variant build must keep the physical scene generation stable',
  );
  assert.equal(
    transparentCold.surfacePlanBuildCount,
    quality.surfacePlanBuildCount,
    'Scene variant build must reuse the physical surface plan',
  );
  assert.equal(transparentCold.rendererUpdateKind, 'variant-build');
  assert.equal(transparentCold.sceneVariant, 'transparent');

  const transparentResources = Object.fromEntries(
    ['sceneObjectCount', 'sceneGeometryCount', 'sceneMaterialCount', 'presentationObjectCount'].map(
      (key) => [key, transparentCold[key]],
    ),
  );

  // Opaque variant was built first and must now be restored without geometry work.
  const beforeOpaqueFrame = await frameSerial();
  await page.locator('#threeOpacityRange').fill('1');
  const opaqueSwapMs = await waitStage('opacity-swap-opaque', 120000, beforeOpaqueFrame);
  const opaqueSwap = await snapshot();
  assert.equal(opaqueSwap.rendererUpdateKind, 'variant-swap');
  assert.equal(opaqueSwap.sceneVariant, 'opaque');
  assert.equal(opaqueSwap.sceneGeneration, quality.sceneGeneration);
  assert.equal(opaqueSwap.surfacePlanBuildCount, quality.surfacePlanBuildCount);

  // Returning to transparency must reuse the cached transparent variant.
  const beforeWarmFrame = await frameSerial();
  await page.locator('#threeOpacityRange').fill('0.5');
  const warmTransparentMs = await waitStage('opacity-swap-transparent', 120000, beforeWarmFrame);
  const transparentWarm = await snapshot();
  assert.equal(transparentWarm.rendererUpdateKind, 'variant-swap');
  assert.equal(transparentWarm.sceneVariant, 'transparent');
  assert.equal(transparentWarm.sceneGeneration, quality.sceneGeneration);
  assert.equal(transparentWarm.surfacePlanBuildCount, quality.surfacePlanBuildCount);
  for (const [key, value] of Object.entries(transparentResources)) {
    assert.equal(transparentWarm[key], value, `${key} changed after transparent variant reuse`);
  }
  assert.ok(
    warmTransparentMs < coldTransparentMs,
    `warm transparent swap (${warmTransparentMs.toFixed(1)} ms) must beat cold variant build (${coldTransparentMs.toFixed(1)} ms)`,
  );

  // Border visibility is a pure presentation update within the active variant.
  const setBorders = async (checked) => {
    await page.locator('#threeBorders').evaluate((input, value) => {
      input.checked = Boolean(value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);
  };
  await setBorders(true);
  await waitStage('border-on-transparent');
  const borderOn = await snapshot();
  assert.equal(borderOn.rendererUpdateKind, 'presentation');
  assert.equal(borderOn.sceneVariant, 'transparent');
  assert.equal(borderOn.sceneGeneration, quality.sceneGeneration);
  assert.equal(borderOn.surfacePlanBuildCount, quality.surfacePlanBuildCount);

  await setBorders(false);
  await waitStage('border-off-transparent');
  const borderOff = await snapshot();
  assert.equal(borderOff.rendererUpdateKind, 'presentation');
  for (const [key, value] of Object.entries(transparentResources)) {
    assert.equal(borderOff[key], value, `${key} changed across border presentation updates`);
  }

  await page.screenshot({ path: fileURLToPath(new URL('transparent.png', output)) });

  // Stress-test 20 additional opacity/border presentation toggles. Both
  // retained variants must remain bounded; warm changes cannot create a
  // succession of leaked BufferGeometries or materials.
  const retainedKeys = [
    'sceneRetainedGroupCount',
    'sceneRetainedObjectCount',
    'sceneRetainedGeometryCount',
    'sceneRetainedMaterialCount',
  ];
  const retainedBaseline = Object.fromEntries(
    retainedKeys.map((key) => [key, borderOff[key]]),
  );
  const assertRetained = async (label) => {
    const current = await snapshot();
    for (const key of retainedKeys)
      assert.equal(current[key], retainedBaseline[key], `${label}: retained ${key} changed`);
    assert.equal(current.sceneGeneration, quality.sceneGeneration);
    assert.equal(current.surfacePlanBuildCount, quality.surfacePlanBuildCount);
    return current;
  };
  for (let iteration = 0; iteration < 10; iteration++) {
    await setBorders(iteration % 2 === 0);
    await waitStage(`border-stress-${iteration + 1}`, 120000);
    await assertRetained(`border-stress-${iteration + 1}`);
  }
  await setBorders(false);
  for (let iteration = 0; iteration < 5; iteration++) {
    const beforeOpaque = await frameSerial();
    await page.locator('#threeOpacityRange').fill('1');
    await waitStage(`opacity-stress-opaque-${iteration + 1}`, 120000, beforeOpaque);
    await assertRetained(`opacity-stress-opaque-${iteration + 1}`);
    const beforeTransparent = await frameSerial();
    await page.locator('#threeOpacityRange').fill('0.5');
    await waitStage(`opacity-stress-transparent-${iteration + 1}`, 120000, beforeTransparent);
    await assertRetained(`opacity-stress-transparent-${iteration + 1}`);
  }

  const beforeFinalFrame = await frameSerial();
  await page.locator('#threeOpacityRange').fill('1');
  const finalOpaqueSwapMs = await waitStage('opacity-final-opaque', 120000, beforeFinalFrame);
  const opaqueAgain = await snapshot();
  assert.equal(opaqueAgain.rendererUpdateKind, 'variant-swap');
  assert.equal(opaqueAgain.sceneVariant, 'opaque');
  assert.equal(opaqueAgain.sceneGeneration, quality.sceneGeneration);
  assert.equal(opaqueAgain.surfacePlanBuildCount, quality.surfacePlanBuildCount);
  assert.ok(finalOpaqueSwapMs < coldTransparentMs);
  await setBorders(false);
  await waitStage('border-final-off');

  console.log(
    'ARRAY_RENDERER_VARIANT_TIMINGS',
    JSON.stringify({ coldTransparentMs, opaqueSwapMs, warmTransparentMs, finalOpaqueSwapMs }),
  );
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
    transparentCold,
    opaqueSwap,
    transparentWarm,
    opaqueAgain,
    restored,
    variantTimings: {
      coldTransparentMs,
      opaqueSwapMs,
      warmTransparentMs,
      finalOpaqueSwapMs,
    },
    presentationStressToggles: { border: 10, opacity: 10 },
    retainedBaseline,
    rotationPassed: true,
    errors,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('ARRAY_RENDERER_OK');
  await context.close();
} finally {
  await browser.close();
}
