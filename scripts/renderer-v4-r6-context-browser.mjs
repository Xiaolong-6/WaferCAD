// R6: browser-driven WebGL context loss/restoration and post-recovery redraw.
// This is software-WebGL functional evidence, not physical GPU VRAM or timing.
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

const output = new URL('../test-results/renderer-v4-r6-context/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const events = [];
try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const errors = observePageErrors(page);
    await page.goto(baseUrl + '/app.html?rendererV4GpuCensus=1&rendererV4SharedFlatCaps=1');
    await waitForAppReady(page);
    await page
      .locator('#openProjectInput')
      .setInputFiles(
        fileURLToPath(
          new URL('../site/examples/previews/tio2-metalens-four-unit.wafercad', import.meta.url),
        ),
      );
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
      undefined,
      { timeout: 90000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 90000);
    const host = page.locator('#threeHost');
    const initial = await host.evaluate((node) => ({ ...node.dataset }));
    assert.equal(initial.v4GpuResourceStatus, 'measured');
    assert.equal(initial.v4GpuResourceComplete, 'true');
    const before = await host.screenshot();
    const frameBefore = Number(initial.rendererFrameSerial || 0);
    const support = await page.locator('#threeHost canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      window.__wafercadR6Events = [];
      // The extension cannot be re-queried while the WebGL context is lost.
      window.__wafercadR6Extension = ext;
      canvas.addEventListener('webglcontextlost', () => window.__wafercadR6Events.push('lost'));
      canvas.addEventListener('webglcontextrestored', () =>
        window.__wafercadR6Events.push('restored'),
      );
      ext.loseContext();
      return true;
    });
    assert.ok(support, 'WEBGL_lose_context unavailable: do not claim context recovery acceptance');
    await page.waitForFunction(() => window.__wafercadR6Events?.includes('lost'));
    events.push('lost');
    await page.evaluate(() => window.__wafercadR6Extension.restoreContext());
    await page.waitForFunction(() => window.__wafercadR6Events?.includes('restored'));
    events.push('restored');
    // Exercise the actual toolbar interaction and require completed frames.
    // A context-restored event alone does not prove any usable rendering.
    const opacityControl = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    const opacity = page.locator('#threeOpacityRange');
    const previous = await opacity.inputValue();
    const next = previous === '1' ? '0.5' : '1';
    for (const value of [next, previous]) {
      if (
        (await opacityControl.evaluate((node) =>
          Boolean(node.closest('.view-overflow-secondary')),
        )) &&
        !(await more.evaluate((node) => node.open))
      ) {
        await more.locator(':scope > summary').click();
      }
      if (!(await opacityControl.evaluate((node) => node.open))) {
        await opacityControl.locator(':scope > summary').click();
      }
      const serial = Number(await host.evaluate((node) => node.dataset.rendererFrameSerial || 0));
      await opacity.fill(value);
      await page.waitForFunction(
        ({ serial, value }) => {
          const node = document.getElementById('threeHost');
          return (
            node?.dataset.renderState === 'ready' &&
            Number(node.dataset.rendererFrameSerial || 0) > serial &&
            document.getElementById('threeOpacityRange')?.value === value
          );
        },
        { serial, value },
        { timeout: 90000 },
      );
    }
    assert.ok(
      Number(await host.evaluate((node) => node.dataset.rendererFrameSerial || 0)) > frameBefore,
      'restored context must submit a new frame',
    );
    await waitForThreeReady(page, 90000);
    const final = await host.evaluate((node) => ({ ...node.dataset }));
    assert.equal(final.v4GpuResourceStatus, 'measured');
    assert.equal(final.v4GpuResourceComplete, 'true');
    assert.equal(final.v4GpuResourceCrossVariantGeometries, '0');
    assert.equal(final.v4GpuResourceCrossVariantMaterials, '0');
    assert.ok(Number(final.v4GpuResourceSceneGroups) <= 2, 'scene-group cache bound');
    assert.ok(Number(final.v4GpuResourceEstimatedBufferBytes) > 0);
    const after = await host.screenshot();
    assert.ok(after.length > 0 && before.length > 0, 'both frames must be captured');
    assert.deepEqual(errors, [], 'no unexpected page/console errors');
    const result = {
      backend: 'Chromium WebGL (inspect CI GPU adapter; not hardware certified)',
      events,
      geometryCount: Number(final.v4GpuResourceGeometries),
      retainedTypedArrayBytes: Number(final.v4GpuResourceEstimatedBufferBytes),
      imageBytes: after.length,
    };
    console.log('RENDERER_V4_R6_CONTEXT_RECOVERY', JSON.stringify(result));
    await writeFile(new URL('report.json', output), JSON.stringify(result, null, 2) + '\n');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
