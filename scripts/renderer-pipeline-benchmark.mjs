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
const output = new URL('../test-results/renderer-pipeline/', import.meta.url);
await mkdir(output, { recursive: true });

function numericProfile(dataset) {
  const fields = [
    'rendererTopologyMs',
    'rendererSmoothCapsMs',
    'rendererSidewallsMs',
    'rendererAnnotationsMs',
    'rendererAssemblyMs',
    'rendererPresentationMs',
    'rendererRoughMs',
    'rendererPreviewReadyMs',
    'rendererFinalReadyMs',
    'rendererFrameSerial',
    'rendererFrameMs',
    'rendererDrawCalls',
    'rendererDrawTriangles',
    'sceneSinglePassCapObjects',
    'sceneSavedCapTriangleSubmissions',
    // V3 Phase A: observe-only subpixel interface-budget measurements.
    'v3SubpixelWallCandidates',
    'v3SubpixelWallInstances',
    'v3SubpixelRawTriangleEstimate',
    'v3SkippedTriangles',
    'v3ProjectionOwners',
    'v3ProjectionSampleQuads',
    'v3ProjectionVisibleQuads',
    'v3ProjectionSubpixelQuads',
    'v3ProjectionOffscreenQuads',
    'v3ProjectionRawTriangleUpperBound',
    'v3TileBoundOwners',
    'v3TileBoundTiles',
    'v3TileSubpixelBounds',
    'v3TileOffscreenBounds',
    'v3TileUncertainBounds',
    'v3TileOwnerOverflow',
    'v3TileBoundOverflow',
    'v3EdgeSurveyOwners',
    'v3EdgeSurveyBounds',
    'v3EdgeSurveySubpixel',
    'v3EdgeSurveyUncertain',
    'v3EdgeSurveyOverflow',
    'v3EdgeSurveyRawUpperBound',
    'v3EdgeSurveySubpixelRawUpperBound',
    'v3EdgeSurveyMs',
    'v3QualityIndexedVertices',
    'v3QualityOriginalVertices',
    'v3QualityIndexedTriangles',
    'sceneRetainedGroupCount',
    'sceneRetainedObjectCount',
    'sceneRetainedGeometryCount',
    'sceneRetainedMaterialCount',
  ];
  return Object.fromEntries(
    fields
      .filter((key) => dataset[key] != null && dataset[key] !== '')
      .map((key) => [key, Number(dataset[key])]),
  );
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = observePageErrors(page);

  await page.goto(baseUrl + '/app.html?rendererV3Diagnostics=1&rendererV3QualityIndex=1');
  await waitForAppReady(page);
  const openStarted = performance.now();
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
  await waitForThreeReady(page, 180000);
  const initialReadyMs = performance.now() - openStarted;

  const snapshot = () =>
    page.locator('#threeHost').evaluate((host) => ({
      host: { ...host.dataset },
      canvas: { ...(host.querySelector('canvas')?.dataset || {}) },
    }));

  const initial = await snapshot();
  assert.equal(initial.host.renderState, 'ready');

  await page.locator('#threePanel .three-opacity-control > summary').click();

  const changeOpacity = async (value, { capture = false } = {}) => {
    const before = Number((await snapshot()).host.rendererFrameSerial || 0);
    const started = performance.now();
    await page.locator('#threeOpacityRange').fill(String(value));
    await waitForThreeReady(page, 180000);
    await page.waitForFunction(
      (previous) => {
        const host = document.getElementById('threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > previous
        );
      },
      before,
      { timeout: 180000 },
    );
    if (capture) {
      // Forces the browser's compositor to consume the newly rendered frame.
      await page.locator('#threeHost canvas').screenshot({
        path: fileURLToPath(
          new URL(`frame-${Number(value) < 1 ? 'transparent' : 'opaque'}.png`, output),
        ),
      });
    }
    const state = await snapshot();
    return { elapsedMs: performance.now() - started, state };
  };
  const cold = await changeOpacity(0.5, { capture: true });
  const coldTransparentReadyMs = cold.elapsedMs,
    transparentCold = cold.state;

  const opaque = await changeOpacity(1);
  const opaqueSwapReadyMs = opaque.elapsedMs,
    opaqueSwap = opaque.state;

  const warm = await changeOpacity(0.5, { capture: true });
  const warmTransparentReadyMs = warm.elapsedMs,
    transparentWarm = warm.state;

  const final = await changeOpacity(1);
  const finalOpaqueReadyMs = final.elapsedMs,
    finalOpaque = final.state;

  for (const state of [transparentCold, opaqueSwap, transparentWarm, finalOpaque]) {
    assert.equal(initial.host.surfaceTopology, state.host.surfaceTopology);
    assert.equal(initial.host.modelRevision, state.host.modelRevision);
    assert.equal(initial.host.sceneGeneration, state.host.sceneGeneration);
    assert.equal(initial.host.surfacePlanBuildCount, state.host.surfacePlanBuildCount);
  }
  assert.equal(transparentCold.host.rendererUpdateKind, 'variant-build');
  assert.equal(transparentCold.host.sceneVariant, 'transparent');
  assert.equal(opaqueSwap.host.rendererUpdateKind, 'variant-swap');
  assert.equal(opaqueSwap.host.sceneVariant, 'opaque');
  assert.equal(transparentWarm.host.rendererUpdateKind, 'variant-swap');
  assert.equal(transparentWarm.host.sceneVariant, 'transparent');
  assert.equal(finalOpaque.host.rendererUpdateKind, 'variant-swap');
  assert.equal(finalOpaque.host.sceneVariant, 'opaque');

  for (const key of [
    'sceneObjectCount',
    'sceneGeometryCount',
    'sceneMaterialCount',
    'presentationObjectCount',
  ]) {
    assert.equal(
      transparentWarm.host[key],
      transparentCold.host[key],
      `${key} changed across transparent variant reuse`,
    );
    assert.equal(
      finalOpaque.host[key],
      opaqueSwap.host[key],
      `${key} changed across opaque variant reuse`,
    );
  }
  // Timing is diagnostic here, not a hardware-independent pass/fail
  // condition. Both frames must be complete and own the same cached geometry.
  assert.ok(
    Number(transparentWarm.host.rendererFrameSerial) >
      Number(transparentCold.host.rendererFrameSerial),
  );
  assert.deepEqual(errors, []);

  const report = {
    browserVersion: browser.version(),
    initialReadyMs,
    coldTransparentReadyMs,
    opaqueSwapReadyMs,
    warmTransparentReadyMs,
    finalOpaqueReadyMs,
    initial: numericProfile(initial.host),
    transparentCold: numericProfile(transparentCold.host),
    opaqueSwap: numericProfile(opaqueSwap.host),
    transparentWarm: numericProfile(transparentWarm.host),
    finalOpaque: numericProfile(finalOpaque.host),
    updateKinds: {
      initial: initial.host.rendererUpdateKind,
      transparentCold: transparentCold.host.rendererUpdateKind,
      opaqueSwap: opaqueSwap.host.rendererUpdateKind,
      transparentWarm: transparentWarm.host.rendererUpdateKind,
      finalOpaque: finalOpaque.host.rendererUpdateKind,
    },
    variants: {
      initial: initial.host.sceneVariant,
      transparentCold: transparentCold.host.sceneVariant,
      opaqueSwap: opaqueSwap.host.sceneVariant,
      transparentWarm: transparentWarm.host.sceneVariant,
      finalOpaque: finalOpaque.host.sceneVariant,
    },
    resources: {
      initial: {
        objects: initial.host.sceneObjectCount,
        geometries: initial.host.sceneGeometryCount,
        materials: initial.host.sceneMaterialCount,
      },
      transparentCold: {
        objects: transparentCold.host.sceneObjectCount,
        geometries: transparentCold.host.sceneGeometryCount,
        materials: transparentCold.host.sceneMaterialCount,
      },
      opaqueSwap: {
        objects: opaqueSwap.host.sceneObjectCount,
        geometries: opaqueSwap.host.sceneGeometryCount,
        materials: opaqueSwap.host.sceneMaterialCount,
      },
      transparentWarm: {
        objects: transparentWarm.host.sceneObjectCount,
        geometries: transparentWarm.host.sceneGeometryCount,
        materials: transparentWarm.host.sceneMaterialCount,
      },
    },
    topology: initial.host.surfaceTopology,
    arrayInstances: initial.host.arrayInstances,
    errors,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('RENDERER_PIPELINE_PROFILE_OK', JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
}
