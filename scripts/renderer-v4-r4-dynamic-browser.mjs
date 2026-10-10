// R4 acceptance: compare *real* browser actions at the same input pose.
// The shared cap path must match the default in Section display, camera and ROI.
// SwiftShader is valid for pixel parity, NOT for GPU timing or VRAM claims.
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

const output = new URL('../test-results/renderer-v4-r4-dynamic/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const all = [];

async function frameSerial(page) {
  return page
    .locator('#threeHost')
    .evaluate((node) => Number(node.dataset.rendererFrameSerial || 0));
}

async function nextRealFrame(page, previous) {
  await page.waitForFunction(
    (before) => {
      const node = document.getElementById('threeHost');
      return (
        node?.dataset.renderState === 'ready' &&
        Number(node.dataset.rendererFrameSerial || 0) > before
      );
    },
    previous,
    { timeout: 180000 },
  );
}

async function capture(page, name, state) {
  await waitForThreeReady(page, 180000);
  const host = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
  assert.equal(host.sceneVariant, 'transparent');
  assert.equal(host.v4GpuResourceStatus, 'measured');
  assert.equal(host.v4GpuResourceComplete, 'true');
  const png = await page.locator('#threeHost canvas').screenshot();
  await writeFile(new URL(name + '-' + state + '.png', output), png);
  return {
    state,
    png,
    data: {
      serial: host.rendererFrameSerial,
      zCollapsed: host.zCollapseEnabled,
      zFrontScale: host.zFrontScale,
      zBackScale: host.zBackScale,
      drawCalls: host.rendererDrawCalls,
      triangles: host.rendererDrawTriangles,
      geometries: host.v4GpuResourceGeometries,
      bufferBytes: host.v4GpuResourceEstimatedBufferBytes,
      sharedClonesAvoided: host.v4SharedFlatClonesAvoided,
      roiBounds: host.rendererRoiBounds || null,
      webglRenderer: await page.locator('#threeHost canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
      }),
    },
  };
}

async function run(name, flags) {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    await page.goto(baseUrl + '/app.html?' + flags);
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
    const opacityControl = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    if (
      await opacityControl.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))
    ) {
      if (!(await more.evaluate((node) => node.open))) {
        await more.locator(':scope > summary').click();
      }
    }
    if (!(await opacityControl.evaluate((node) => node.open))) {
      await opacityControl.locator(':scope > summary').click();
    }
    let before = await frameSerial(page);
    await page.locator('#threeOpacityRange').fill('0.5');
    await nextRealFrame(page, before);
    await waitForThreeReady(page, 180000);
    const states = [await capture(page, name, 'initial')];

    // Real Section controller operation; ensure a submitted frame follows.
    await page.locator('#sectionCollapseAxisBtn').click();
    await page.locator('#sectionCollapseEditor').waitFor({ state: 'visible' });
    before = await frameSerial(page);
    await page.locator('#sectionCollapseEnabled').uncheck();
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.zCollapseEnabled === 'false',
    );
    await nextRealFrame(page, before);
    states.push(await capture(page, name, 'unbroken-z'));

    before = await frameSerial(page);
    await page.locator('#sectionCollapseEnabled').check();
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.zCollapseEnabled === 'true',
    );
    await nextRealFrame(page, before);

    // Unlinked, unequal front/back Section scales exercise the formerly
    // mutating Z path. All shared flat cap physical Z coordinates must survive.
    await page.locator('#sectionCollapseScaleLinked').uncheck();
    before = await frameSerial(page);
    await page.locator('#sectionCollapseFrontScale').fill('1.6');
    await page.locator('#sectionCollapseFrontScale').dispatchEvent('change');
    await nextRealFrame(page, before);
    before = await frameSerial(page);
    await page.locator('#sectionCollapseBackScale').fill('0.6');
    await page.locator('#sectionCollapseBackScale').dispatchEvent('change');
    await nextRealFrame(page, before);
    states.push(await capture(page, name, 'unlinked-z-scales'));
    await page.locator('#sectionCollapseClose').click();

    // One bounded pointer orbit, instead of a stepped drag that can
    // queue minutes of unnecessary full-wafer SwiftShader redraws.
    const rect = await page.locator('#threeHost canvas').boundingBox();
    assert.ok(rect, '3D canvas must be visible for orbit');
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    before = await frameSerial(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 36, cy + 14);
    await page.mouse.up();
    await nextRealFrame(page, before);
    states.push(await capture(page, name, 'orbit-angle'));

    // Main-drawn ROI must trigger a real clipped 3D scene update.
    await page.locator('#focusEditor > summary').click();
    await page.locator('.roi-tool[data-tool="rect"]').click();
    const main = await page.locator('#mainCanvas').boundingBox();
    assert.ok(main, 'Main canvas must be visible for ROI creation');
    before = await frameSerial(page);
    await page.mouse.move(main.x + main.width * 0.36, main.y + main.height * 0.36);
    await page.mouse.down();
    await page.mouse.move(main.x + main.width * 0.64, main.y + main.height * 0.64);
    await page.mouse.up();
    await nextRealFrame(page, before);
    states.push(await capture(page, name, 'clipped-roi'));
    assert.deepEqual(errors, [], name + ': browser errors');
    console.log(
      'RENDERER_V4_R4_DYNAMIC_ARM',
      JSON.stringify({
        name,
        frames: states.map(({ state, data }) => ({ state, ...data })),
      }),
    );
    all.push({ name, states });
  } finally {
    await context.close();
  }
}

try {
  // Both arms use identical interaction policy and pinned Chromium backend.
  const common = 'rendererV4GpuCensus=1&rendererV4HeavyCameraNoDamping=1';
  await run('baseline', common);
  await run('shared-flat', common + '&rendererV4SharedFlatCaps=1');
  const baseline = all[0].states;
  const optimized = all[1].states;
  assert.deepEqual(
    baseline.map(({ state }) => state),
    optimized.map(({ state }) => state),
  );
  const comparisons = [];
  for (let i = 0; i < baseline.length; i++) {
    const expected = baseline[i],
      actual = optimized[i];
    for (const field of ['zCollapsed', 'zFrontScale', 'zBackScale', 'drawCalls', 'triangles']) {
      assert.equal(actual.data[field], expected.data[field], expected.state + ': ' + field);
    }
    const pixels = compareScreenshotPngPixels(expected.png, actual.png);
    comparisons.push({ state: expected.state, ...pixels });
    console.log('RENDERER_V4_R4_DYNAMIC_PARITY', JSON.stringify(comparisons.at(-1)));
    assert.equal(pixels.pixelIdentical, true, expected.state + ': exact pixel parity');
  }
  assert.ok(Number(optimized[0].data.sharedClonesAvoided) > 0, 'R4 sharing must actually occur');
  assert.ok(
    Number(optimized[0].data.bufferBytes) < Number(baseline[0].data.bufferBytes),
    'R4 should save source template arrays',
  );
  assert.equal(baseline[1].data.zCollapsed, 'false');
  assert.equal(optimized[1].data.zCollapsed, 'false');
  assert.equal(baseline[2].data.zFrontScale, '1.6');
  assert.equal(baseline[2].data.zBackScale, '0.6');
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        backend: 'software/hardware explicitly reported per arm',
        comparisons,
        arms: all.map(({ name, states }) => ({
          name,
          frames: states.map(({ state, data }) => ({ state, ...data })),
        })),
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
