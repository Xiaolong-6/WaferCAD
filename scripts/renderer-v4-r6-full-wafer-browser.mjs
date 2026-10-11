// R6 Phase B — two real 625-site scene variants across WebGL context loss.
// This is a software-WebGL functional/pixel/resource test, not physical GPU VRAM.
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

const output = new URL('../test-results/renderer-v4-r6-full-wafer/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const history = [];
const comparisons = [];
const timeout = 180000;

async function capture(page, phase, variant) {
  await waitForThreeReady(page, timeout);
  // The WebGL frame counter advances when Three returns, before Chromium
  // necessarily presents the completed compositor frame. Compare only
  // after two browser paint opportunities; do not omit or mask any pixels.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  const host = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
  assert.equal(host.renderState, 'ready', phase);
  assert.equal(host.sceneVariant, variant, phase + ': physical variant');
  assert.equal(host.v4GpuResourceStatus, 'measured', phase);
  assert.equal(host.v4GpuResourceComplete, 'true', phase);
  assert.equal(host.v4GpuResourceCrossVariantGeometries, '0', phase);
  assert.equal(host.v4GpuResourceCrossVariantMaterials, '0', phase);
  assert.equal(host.v4GpuResourceSceneGroups, '2', phase + ': both variants retained');
  // This counter includes rendered layer/owner instances, not unique physical sites.
  assert.ok(
    Number.isSafeInteger(Number(host.arrayInstances)) && Number(host.arrayInstances) >= 625,
    phase + ': real 625-site model must expose its rendered owner instances',
  );
  const state = {
    phase,
    variant,
    groups: Number(host.v4GpuResourceSceneGroups),
    renderedOwnerInstances: Number(host.arrayInstances),
    geometries: Number(host.v4GpuResourceGeometries),
    materials: Number(host.v4GpuResourceMaterials),
    bytes: Number(host.v4GpuResourceEstimatedBufferBytes),
    disposedGroups: Number(host.v4R5DisposedGroups || 0),
    sceneGeneration: host.sceneGeneration,
    cameraWorld: host.rendererCameraWorld || null,
    cameraProjection: host.rendererCameraProjection || null,
    webglContext: host.rendererWebglContext || null,
    modelRevision: host.modelRevision,
    processRevision: host.processRevision,
    frame: Number(host.rendererFrameSerial || 0),
    triangles: Number(host.rendererDrawTriangles),
    calls: Number(host.rendererDrawCalls),
  };
  for (const key of ['geometries', 'materials', 'bytes', 'frame', 'triangles', 'calls']) {
    assert.ok(Number.isSafeInteger(state[key]) && state[key] > 0, phase + ': ' + key);
  }
  const png = await page.locator('#threeHost canvas').screenshot();
  await writeFile(new URL(phase + '.png', output), png);
  history.push(state);
  console.log('RENDERER_V4_R6_FULL_WAFER_STATE', JSON.stringify(state));
  return { state, png };
}

async function changeVariant(page, value, variant, phase) {
  const display = page.locator('#threePanel .three-opacity-control');
  const more = page.locator('#threePanel .view-more-control');
  if (
    (await display.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))) &&
    !(await more.evaluate((node) => node.open))
  ) {
    await more.locator(':scope > summary').click();
  }
  if (!(await display.evaluate((node) => node.open))) {
    await display.locator(':scope > summary').click();
  }
  const before = Number(
    await page.locator('#threeHost').evaluate((node) => node.dataset.rendererFrameSerial || 0),
  );
  await page.locator('#threeOpacityRange').fill(value);
  await page.waitForFunction(
    ({ before, variant }) => {
      const host = document.getElementById('threeHost');
      return (
        host?.dataset.renderState === 'ready' &&
        host.dataset.sceneVariant === variant &&
        Number(host.dataset.rendererFrameSerial || 0) > before
      );
    },
    { before, variant },
    { timeout },
  );
  assert.equal(
    await page.locator('#threeOpacityValue').textContent(),
    value === '1' ? '100%' : '50%',
    phase,
  );
}

async function cycleContext(page, phase) {
  const serial = Number(
    await page.locator('#threeHost').evaluate((node) => node.dataset.rendererFrameSerial || 0),
  );
  const probe = await page.locator('#threeHost canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return { supported: false };
    window.__wafercadR6FullWaferExtension = ext;
    window.__wafercadR6FullWaferEvents = [];
    canvas.addEventListener(
      'webglcontextlost',
      () => window.__wafercadR6FullWaferEvents.push('lost'),
      { once: true },
    );
    canvas.addEventListener(
      'webglcontextrestored',
      () => window.__wafercadR6FullWaferEvents.push('restored'),
      { once: true },
    );
    const backend = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = backend ? gl.getParameter(backend.UNMASKED_RENDERER_WEBGL) : 'not-reported';
    ext.loseContext();
    return { supported: true, renderer };
  });
  assert.ok(probe.supported, phase + ': WEBGL_lose_context extension required');
  await page.waitForFunction(() => window.__wafercadR6FullWaferEvents?.includes('lost'), null, {
    timeout,
  });
  const lost = await page.locator('#threeHost canvas').evaluate((canvas) => {
    return canvas.getContext('webgl2').isContextLost();
  });
  assert.equal(lost, true, phase + ': actual WebGL context lost');
  assert.equal(
    await page.locator('#threeHost').evaluate((node) => node.dataset.renderState),
    'context-lost',
    phase + ': do not report ready while the WebGL context is lost',
  );
  await page.evaluate(() => window.__wafercadR6FullWaferExtension.restoreContext());
  await page.waitForFunction(() => window.__wafercadR6FullWaferEvents?.includes('restored'), null, {
    timeout,
  });
  assert.deepEqual(
    await page.evaluate(() => window.__wafercadR6FullWaferEvents),
    ['lost', 'restored'],
    phase + ': single ordered recovery pair',
  );
  assert.equal(
    await page
      .locator('#threeHost canvas')
      .evaluate((canvas) => canvas.getContext('webgl2').isContextLost()),
    false,
    phase + ': context genuinely restored',
  );
  console.log(
    'RENDERER_V4_R6_FULL_WAFER_CONTEXT',
    JSON.stringify({ phase, renderer: probe.renderer, serialBeforeLoss: serial }),
  );
  return probe.renderer;
}

function verifyStable(before, after, label) {
  for (const key of [
    'groups',
    'geometries',
    'materials',
    'bytes',
    'disposedGroups',
    'sceneGeneration',
    'modelRevision',
    'processRevision',
    'cameraWorld',
    'cameraProjection',
    'triangles',
    'calls',
  ]) {
    assert.equal(after.state[key], before.state[key], label + ': ' + key);
  }
  assert.ok(after.state.frame > before.state.frame, label + ': post-restore frame required');
  const pixels = compareScreenshotPngPixels(before.png, after.png);
  comparisons.push({ phase: label, ...pixels });
  console.log('RENDERER_V4_R6_FULL_WAFER_PIXEL_PARITY', JSON.stringify(comparisons.at(-1)));
  return pixels;
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    // Collect asynchronous page errors by reference, not by snapshot.
    const observedErrors = observePageErrors(page);
    await page.goto(
      baseUrl +
        '/app.html?rendererV3RoiTrace=1&rendererV4GpuCensus=1&rendererV4SharedFlatCaps=1&rendererV4HeavyCameraNoDamping=1',
    );
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
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
      null,
      { timeout },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, timeout);
    if ((await page.locator('#threeOpacityRange').inputValue()) !== '1') {
      await changeVariant(page, '1', 'opaque', 'warm-opaque');
    }
    await changeVariant(page, '0.5', 'transparent', 'warm-transparent');
    const transparent = await capture(page, 'baseline-transparent', 'transparent');
    await changeVariant(page, '1', 'opaque', 'warm-opaque');
    const opaque = await capture(page, 'baseline-opaque', 'opaque');

    await changeVariant(page, '0.5', 'transparent', 'preloss-repeat-transparent');
    await changeVariant(page, '1', 'opaque', 'preloss-repeat-opaque');
    const repeatedOpaque = await capture(page, 'preloss-repeat-opaque', 'opaque');
    verifyStable(opaque, repeatedOpaque, 'opaque-variant-repeat-without-context-loss');

    const backend = await cycleContext(page, 'opaque-loss');
    // Use real UI events to re-submit a frame without changing final pose.
    await changeVariant(page, '0.5', 'transparent', 'post-opaque-loss-transparent');
    await changeVariant(page, '1', 'opaque', 'post-opaque-loss-opaque');
    const recoveredOpaque = await capture(page, 'recovered-opaque', 'opaque');
    verifyStable(repeatedOpaque, recoveredOpaque, 'opaque-restoration');

    await changeVariant(page, '0.5', 'transparent', 'pre-transparent-loss');
    const repeatedTransparent = await capture(page, 'preloss-repeat-transparent', 'transparent');
    verifyStable(
      transparent,
      repeatedTransparent,
      'transparent-variant-repeat-without-context-loss',
    );
    await cycleContext(page, 'transparent-loss');
    await changeVariant(page, '1', 'opaque', 'post-transparent-loss-opaque');
    await changeVariant(page, '0.5', 'transparent', 'post-transparent-loss-transparent');
    const recoveredTransparent = await capture(page, 'recovered-transparent', 'transparent');
    verifyStable(repeatedTransparent, recoveredTransparent, 'transparent-restoration');
    assert.deepEqual(observedErrors, [], 'no unexpected page errors');
    const report = {
      fixture: 'three-tier-silicon-jlfets-full-wafer.wafercad',
      adapter: backend,
      backendClass: 'CI Chromium WebGL; software/physical adapter is not independently certified',
      comparisons,
      history,
      meaning: 'strict pixel parity and bounded CPU scene references; not driver GPU VRAM',
    };
    await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
    console.log('RENDERER_V4_R6_FULL_WAFER_ACCEPTANCE', JSON.stringify(report));
    assert.ok(
      comparisons.every((entry) => entry.pixelIdentical),
      'each variant must have strict 0-different-pixel parity both without and after context loss',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
