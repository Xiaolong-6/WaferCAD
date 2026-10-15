// Browser capability probe, not a production renderer or hardware acceptance.
// Test only: transfer a canvas, create Worker WebGL2, resize, and read pixels.
// Unsupported/blocked environments are explicit evidence, not a fallback pass.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const folder = 'test-results/p1-startup-cpu';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const probe = await page.evaluate(async () => {
    const started = performance.now();
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
      return { supported: false, reason: 'Worker or OffscreenCanvas unavailable' };
    }
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      return { supported: false, reason: 'Canvas transfer unsupported' };
    }
    const source = [
      'self.onmessage = ({ data }) => {',
      '  try {',
      '    const canvas = data.canvas;',
      '    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });',
      '    if (!gl) throw new Error("Worker WebGL2 context unavailable");',
      '    const pixel = new Uint8Array(4);',
      '    gl.viewport(0, 0, 4, 4);',
      '    gl.clearColor(1, 0, 0, 1);',
      '    gl.clear(gl.COLOR_BUFFER_BIT);',
      '    gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);',
      '    const firstPixel = Array.from(pixel);',
      '    canvas.width = 8;',
      '    canvas.height = 8;',
      '    gl.viewport(0, 0, 8, 8);',
      '    gl.clearColor(0, 1, 0, 1);',
      '    gl.clear(gl.COLOR_BUFFER_BIT);',
      '    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);',
      '    self.postMessage({ firstPixel, resizedPixel: Array.from(pixel),',
      '      renderer: String(gl.getParameter(gl.RENDERER) || ""),',
      '      loseContextExtension: Boolean(gl.getExtension("WEBGL_lose_context")) });',
      '  } catch (error) { self.postMessage({ error: String(error?.message || error) }); }',
      '};',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    let worker = null;
    try {
      worker = new Worker(url);
      const offscreen = canvas.transferControlToOffscreen();
      const result = await new Promise((resolve) => {
        let finished = false;
        const timeout = setTimeout(() => complete({ error: 'Worker probe timed out' }), 10000);
        function complete(value) {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          resolve(value);
        }
        worker.onmessage = (event) => complete(event.data || { error: 'Empty Worker message' });
        worker.onerror = (event) => complete({ error: event.message || 'Worker crashed' });
        try {
          worker.postMessage({ canvas: offscreen }, [offscreen]);
        } catch (error) {
          complete({ error: String(error?.message || error) });
        }
      });
      const firstCorrect = JSON.stringify(result.firstPixel) === '[255,0,0,255]';
      const resizedCorrect = JSON.stringify(result.resizedPixel) === '[0,255,0,255]';
      const pixelReadbackPassed = firstCorrect && resizedCorrect;
      const failureReason = result.error || (pixelReadbackPassed ? null : 'Pixel readback mismatch');
      return {
        supported: pixelReadbackPassed && !result.error,
        reason: failureReason,
        firstPixel: result.firstPixel || null,
        resizedPixel: result.resizedPixel || null,
        renderer: result.renderer || null,
        loseContextExtension: result.loseContextExtension ?? null,
        elapsedMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return { supported: false, reason: String(error?.message || error) };
    } finally {
      worker?.terminate();
      URL.revokeObjectURL(url);
    }
  });
  const report = {
    probe: 'p1-worker-webgl2-transfer-readback-v1',
    source: 'software Chromium; no physical GPU or Three.js renderer proof',
    chromium: browser.version(),
    ...probe,
  };
  await writeFile(folder + '/offscreen-feasibility.json', JSON.stringify(report, null, 2) + '\n');
  console.log('P1_OFFSCREEN_FEASIBILITY', JSON.stringify(report));
  // Capability-negative is an explicit diagnostic result, not a scientific failure.
} finally {
  await browser.close();
}
