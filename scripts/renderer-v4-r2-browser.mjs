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

const output = new URL('../test-results/renderer-v4-r2/', import.meta.url);
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
    await page.locator('#openProjectInput').setInputFiles(
      fileURLToPath(
        new URL('../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
      ),
    );
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
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
    const beforeFrame = await page.locator('#threeHost').evaluate(
      (node) => Number(node.dataset.rendererFrameSerial || 0),
    );
    await page.locator('#threeOpacityRange').fill('0.5');
    await waitForThreeReady(page, 180000);
    await page.waitForFunction(
      (previous) => {
        const host = document.getElementById('threeHost');
        return host?.dataset.renderState === 'ready' &&
          Number(host.dataset.rendererFrameSerial || 0) > previous;
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
    console.log('RENDERER_V4_R2_BROWSER_ARM', JSON.stringify(result));
  } finally {
    await context.close();
  }
}

try {
  await runArm('r1-probe', 'rendererV4TileProbe=1');
  await runArm('r2-cpu-plan', 'rendererV4TileCache=1');
  const [r1, r2] = observations.map((arm) => arm.result);
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
    assert.equal(r2[key], r1[key], key + ' must be unchanged by CPU caching');
  }
  assert.equal(r1.v4TileCacheMode, 'off');
  assert.equal(r2.v4TileCacheMode, 'cpu-plan');
  assert.ok(Number(r2.v4TileCacheMisses) > 0);
  assert.ok(Number(r2.v4TileCacheRetainedTiles) > 0);
  const pixels = compareScreenshotPngPixels(observations[0].png, observations[1].png);
  const report = { fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad', observations: [r1, r2], pixels };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log('RENDERER_V4_R2_BROWSER_PARITY', JSON.stringify(pixels));
  assert.equal(pixels.pixelIdentical, true, 'R1 and R2 renderer canvases must match exactly');
} finally {
  await browser.close();
}
