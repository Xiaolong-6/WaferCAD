// Single-pose R1/R2 625-site parity probe, deliberately not a GPU performance benchmark.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';
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

const output = new URL('../test-results/renderer-v4-r3/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const observations = [];

async function runArm(name, search) {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    const openedAt = performance.now();
    await page.goto(baseUrl + '/app.html?' + search);
    await waitForAppReady(page);
    await page
      .locator('#openProjectInput')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
            import.meta.url,
          ),
        ),
      );
    await chooseConfirmation(page);
    await page.waitForFunction(() =>
      document.getElementById('statusText')?.textContent.startsWith('Opened '),
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    const display = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    const nested = await display.evaluate((node) =>
      Boolean(node.closest('.view-overflow-secondary')),
    );
    if (nested && !(await more.evaluate((node) => node.open))) {
      await more.locator(':scope > summary').click();
    }
    if (!(await display.evaluate((node) => node.open)))
      await display.locator(':scope > summary').click();
    const beforeFrame = await page
      .locator('#threeHost')
      .evaluate((node) => Number(node.dataset.rendererFrameSerial || 0));
    await page.locator('#threeOpacityRange').fill('0.5');
    await waitForThreeReady(page, 180000);
    await page.waitForFunction(
      (previous) => {
        const host = document.getElementById('threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > previous
        );
      },
      beforeFrame,
      { timeout: 180000 },
    );
    const host = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
    const png = await page.locator('#threeHost canvas').screenshot();
    await writeFile(new URL(name + '.png', output), png);
    assert.equal(host.sceneVariant, 'transparent');
    assert.equal(host.v4TileProbeStatus, 'measured');
    assert.equal(host.v4TileSkippedTriangles, '0');
    assert.ok(Number(host.v4TileTotal) > 0, name + ' must observe real 625-site tiles');
    assert.deepEqual(errors, [], name + ' browser must have zero page errors');
    const result = {
      name,
      elapsedCompleteImageMs: performance.now() - openedAt,
      sceneVariant: host.sceneVariant,
      modelRevision: host.modelRevision,
      arrayInstances: host.arrayInstances,
      renderQuality: host.renderQuality,
      fullWaferTransparencyLod: host.fullWaferTransparencyLod,
      rendererDrawCalls: host.rendererDrawCalls,
      rendererDrawTriangles: host.rendererDrawTriangles,
      sceneObjectCount: host.sceneObjectCount,
      sceneGeometryCount: host.sceneGeometryCount,
      sceneMaterialCount: host.sceneMaterialCount,
      v4TileProbeStatus: host.v4TileProbeStatus,
      v4TileReductionGate: host.v4TileReductionGate,
      v4TileTotal: host.v4TileTotal,
      v4TileNear: host.v4TileNear,
      v4TileMid: host.v4TileMid,
      v4TileFar: host.v4TileFar,
      v4TileOffscreen: host.v4TileOffscreen,
      v4TileUncertain: host.v4TileUncertain,
      v4TileOverflow: host.v4TileOverflow,
      v4TileCacheMode: host.v4TileCacheMode,
      v4TileCacheHit: host.v4TileCacheHit,
      v4TileCacheHits: host.v4TileCacheHits,
      v4TileCacheMisses: host.v4TileCacheMisses,
      v4TileCacheRetainedTiles: host.v4TileCacheRetainedTiles,
      v4TileProbeMs: host.v4TileProbeMs,
      v4FeatureStatus: host.v4FeatureStatus,
      v4FeatureGate: host.v4FeatureGate,
      v4FeatureOwners: host.v4FeatureOwners,
      v4FeatureMeasuredQuads: host.v4FeatureMeasuredQuads,
      v4FeatureSubpixelQuads: host.v4FeatureSubpixelQuads,
      v4FeatureOverflow: host.v4FeatureOverflow,
      v4FeatureCandidateRawTriangles: host.v4FeatureCandidateRawTriangles,
      v4FeatureSkippedTriangles: host.v4FeatureSkippedTriangles,
      v4GpuResourceStatus: host.v4GpuResourceStatus,
      v4GpuResourceMeshes: host.v4GpuResourceMeshes,
      v4GpuResourceGeometries: host.v4GpuResourceGeometries,
      v4GpuResourceMaterials: host.v4GpuResourceMaterials,
      v4GpuResourceEstimatedBufferBytes: host.v4GpuResourceEstimatedBufferBytes,
      v4GpuResourceComplete: host.v4GpuResourceComplete,
      v4FastIndexedVertices: host.v4FastIndexedVertices,
      v4FastOriginalVertices: host.v4FastOriginalVertices,
      v4SharedFlatTemplates: host.v4SharedFlatTemplates,
      v4SharedFlatMeshes: host.v4SharedFlatMeshes,
      v4SharedFlatClonesAvoided: host.v4SharedFlatClonesAvoided,
      rendererIdentity: await page.locator('#threeHost canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          webglVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
          webglRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
          contextVersion: gl?.getParameter(gl.VERSION) ?? null,
        };
      }),
    };
    observations.push({ result, png });
    console.log('RENDERER_V4_R3_BROWSER_ARM', JSON.stringify(result));
  } finally {
    await context.close();
  }
}

try {
  await runArm('baseline', 'rendererV4TileProbe=1&rendererV4GpuCensus=1');
  await runArm(
    'r3-feature-and-resource-survey',
    'rendererV4TileProbe=1&rendererV4FeatureSurvey=1&rendererV4GpuCensus=1',
  );
  await runArm(
    'r3-fast-index',
    'rendererV4TileProbe=1&rendererV4FastSmoothIndex=1&rendererV4GpuCensus=1',
  );
  await runArm(
    'r4-shared-flat',
    'rendererV4TileProbe=1&rendererV4GpuCensus=1&rendererV4SharedFlatCaps=1',
  );
  const [r1, r2, fastIndex, sharedFlat] = observations.map((arm) => arm.result);
  for (const key of [
    'modelRevision',
    'arrayInstances',
    'sceneVariant',
    'renderQuality',
    'fullWaferTransparencyLod',
    'rendererDrawCalls',
    'rendererDrawTriangles',
    'sceneObjectCount',
    'sceneGeometryCount',
    'sceneMaterialCount',
    'v4TileProbeStatus',
    'v4TileReductionGate',
    'v4TileTotal',
    'v4TileNear',
    'v4TileMid',
    'v4TileFar',
    'v4TileOffscreen',
    'v4TileUncertain',
    'v4TileOverflow',
  ]) {
    assert.equal(r2[key], r1[key], key + ' must be unchanged by R3 observability');
    assert.equal(fastIndex[key], r1[key], key + ' must be unchanged by smooth index topology');
  }
  assert.equal(r1.v4TileCacheMode, 'off');
  assert.equal(r2.v4TileCacheMode, 'off');
  assert.equal(r1.v4FeatureStatus, 'disabled');
  assert.equal(r2.v4FeatureStatus, 'measured');
  assert.equal(r2.v4FeatureSkippedTriangles, '0');
  assert.ok(Number(r2.v4FeatureMeasuredQuads) > 0);
  assert.ok(Number(r2.v4FeatureOwners) > 0);
  assert.equal(r2.v4GpuResourceStatus, 'measured');
  assert.equal(r2.v4GpuResourceComplete, 'true');
  assert.ok(Number(r2.v4GpuResourceEstimatedBufferBytes) > 0);
  assert.ok(Number(r2.v4GpuResourceMeshes) > 0);
  assert.ok(
    Number(fastIndex.v4FastIndexedVertices) > 0,
    'fast index must reduce vertex submission',
  );
  assert.ok(Number(fastIndex.v4FastOriginalVertices) > Number(fastIndex.v4FastIndexedVertices));
  // Count *retained unique typed-array bytes*, not per-instance expanded
  // logical vertex records or unobservable driver-resident VRAM.
  assert.equal(r1.v4GpuResourceStatus, 'measured');
  assert.equal(fastIndex.v4GpuResourceStatus, 'measured');
  assert.equal(r1.v4GpuResourceComplete, 'true');
  assert.equal(fastIndex.v4GpuResourceComplete, 'true');
  for (const key of ['v4GpuResourceMeshes', 'v4GpuResourceGeometries', 'v4GpuResourceMaterials']) {
    assert.equal(fastIndex[key], r1[key], key + ' must be unchanged by indexing');
  }
  const baselineBufferBytes = Number(r1.v4GpuResourceEstimatedBufferBytes);
  const indexedBufferBytes = Number(fastIndex.v4GpuResourceEstimatedBufferBytes);
  assert.ok(Number.isFinite(baselineBufferBytes) && baselineBufferBytes > 0);
  assert.ok(Number.isFinite(indexedBufferBytes) && indexedBufferBytes > 0);
  assert.ok(
    indexedBufferBytes < baselineBufferBytes,
    'indexed Fast scene should reduce retained typed-array bytes',
  );
  const indexedBufferEstimate = {
    baselineBytes: baselineBufferBytes,
    indexedBytes: indexedBufferBytes,
    savedBytes: baselineBufferBytes - indexedBufferBytes,
    savedFraction: (baselineBufferBytes - indexedBufferBytes) / baselineBufferBytes,
    category: 'CPU typed-array bytes across retained scene variants; not GPU VRAM',
  };
  console.log('RENDERER_V4_R3_BUFFER_ESTIMATE', JSON.stringify(indexedBufferEstimate));
  // R4 retains the exact polygons/materials/triangle ordering, but each
  // spatial InstancedMesh can refer to one immutable constant-Z cap template.
  for (const key of [
    'modelRevision',
    'sceneVariant',
    'rendererDrawCalls',
    'rendererDrawTriangles',
    'sceneObjectCount',
    'sceneMaterialCount',
  ]) assert.equal(sharedFlat[key], r1[key], key + ' must survive flat geometry sharing');
  assert.ok(Number(sharedFlat.v4SharedFlatClonesAvoided) > 0, 'R4 must actually reuse a template');
  assert.ok(Number(sharedFlat.v4SharedFlatTemplates) > 0);
  assert.equal(sharedFlat.v4GpuResourceStatus, 'measured');
  assert.equal(sharedFlat.v4GpuResourceComplete, 'true');
  assert.ok(
    Number(sharedFlat.v4GpuResourceGeometries) < Number(r1.v4GpuResourceGeometries),
    'R4 must retain fewer unique BufferGeometries',
  );
  const sharedBufferBytes = Number(sharedFlat.v4GpuResourceEstimatedBufferBytes);
  assert.ok(sharedBufferBytes < baselineBufferBytes, 'R4 must reduce retained typed-array bytes');
  const flatShareEstimate = {
    baselineBytes: baselineBufferBytes,
    sharedBytes: sharedBufferBytes,
    savedBytes: baselineBufferBytes - sharedBufferBytes,
    savedFraction: (baselineBufferBytes - sharedBufferBytes) / baselineBufferBytes,
    avoidedClones: Number(sharedFlat.v4SharedFlatClonesAvoided),
    category: 'CPU typed-array estimate across scene variants; not verified GPU VRAM',
  };
  console.log('RENDERER_V4_R4_FLAT_SHARE_ESTIMATE', JSON.stringify(flatShareEstimate));
  const pixels = compareScreenshotPngPixels(observations[0].png, observations[1].png);
  const indexedPixels = compareScreenshotPngPixels(observations[0].png, observations[2].png);
  const sharedPixels = compareScreenshotPngPixels(observations[0].png, observations[3].png);
  const report = {
    fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad',
    observations: [r1, r2, fastIndex, sharedFlat],
    pixels,
    indexedPixels,
    indexedBufferEstimate,
    flatShareEstimate,
    sharedPixels,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log('RENDERER_V4_R3_BROWSER_PARITY', JSON.stringify(pixels));
  console.log('RENDERER_V4_R3_FAST_INDEX_PARITY', JSON.stringify(indexedPixels));
  console.log('RENDERER_V4_R4_FLAT_SHARE_PARITY', JSON.stringify(sharedPixels));
  assert.equal(pixels.pixelIdentical, true, 'R1 and R3 survey canvases must match exactly');
  assert.equal(indexedPixels.pixelIdentical, true, 'R1 and R3 indexed canvases must match exactly');
  assert.equal(sharedPixels.pixelIdentical, true, 'R1 and R4 shared cap canvases must match exactly');
} finally {
  await browser.close();
}
