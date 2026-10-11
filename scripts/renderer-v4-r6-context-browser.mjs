// R6: browser-driven WebGL context loss/restoration and post-recovery redraw.
// This is software-WebGL functional evidence, not physical GPU VRAM or timing.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser, newUiContext, observePageErrors, waitForAppReady,
  waitForThreeReady, chooseConfirmation, closeFunctionPanel, baseUrl,
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
    await page.locator('#openProjectInput').setInputFiles(
      fileURLToPath(new URL('../site/examples/tio2-achromatic-metalens-four-meta-atoms.wafercad', import.meta.url)),
    );
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
      undefined, { timeout: 90000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 90000);
    const host = page.locator('#threeHost');
    const initial = await host.evaluate(node => ({ ...node.dataset }));
    assert.equal(initial.v4GpuResourceStatus, 'measured');
    assert.equal(initial.v4GpuResourceComplete, 'true');
    const before = await host.screenshot();
    const support = await page.locator('#threeHost canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      window.__wafercadR6Events = [];
      canvas.addEventListener('webglcontextlost', () => window.__wafercadR6Events.push('lost'));
      canvas.addEventListener('webglcontextrestored', () => window.__wafercadR6Events.push('restored'));
      ext.loseContext();
      return true;
    });
    assert.ok(support, 'WEBGL_lose_context unavailable: do not claim context recovery acceptance');
    await page.waitForFunction(() => window.__wafercadR6Events?.includes('lost'));
    events.push('lost');
    await page.locator('#threeHost canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      gl.getExtension('WEBGL_lose_context').restoreContext();
    });
    await page.waitForFunction(() => window.__wafercadR6Events?.includes('restored'));
    events.push('restored');
    // Trigger a real user-driven render after restoration instead of treating the event as success.
    const opacity = page.locator('#threeOpacityRange');
    const previous = await opacity.inputValue();
    const next = previous === '1' ? '0.5' : '1';
    await opacity.evaluate((node, value) => {
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, next);
    await page.waitForFunction(
      expected => document.getElementById('threeOpacityRange')?.value === expected
        && document.getElementById('threeHost')?.dataset.renderState === 'ready',
      next,
    );
    await opacity.evaluate((node, value) => {
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, previous);
    await waitForThreeReady(page, 90000);
    const final = await host.evaluate(node => ({ ...node.dataset }));
    assert.equal(final.v4GpuResourceStatus, 'measured');
    assert.equal(final.v4GpuResourceComplete, 'true');
    assert.equal(final.v4GpuResourceCrossVariantGeometries, '0');
    assert.equal(final.v4GpuResourceCrossVariantMaterials, '0');
    assert.ok(Number(final.v4GpuResourceSceneGroups) <= 2, 'scene-group cache bound');
    assert.ok(Number(final.v4GpuResourceEstimatedBufferBytes) > 0);
    const after = await host.screenshot();
    assert.deepEqual(after, before, 'restored image must have exact same-pose screenshot bytes');
    assert.deepEqual(errors, [], 'no unexpected page/console errors');
    const result = {
      backend: 'Chromium WebGL (inspect CI GPU adapter; not hardware certified)',
      events, geometryCount: Number(final.v4GpuResourceGeometries),
      retainedTypedArrayBytes: Number(final.v4GpuResourceEstimatedBufferBytes),
      imageBytes: after.length,
    };
    console.log('RENDERER_V4_R6_CONTEXT_RECOVERY', JSON.stringify(result));
    await writeFile(new URL('report.json', output), JSON.stringify(result, null, 2) + '\n');
  } finally { await context.close(); }
} finally { await browser.close(); }
