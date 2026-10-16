// Isolated feasibility proof for moving *actual Three.js rendering* off main.
// This does not use production model geometry or alter the shipping renderer.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const folder = 'test-results/p1-startup-cpu';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const result = await page.evaluate(async () => {
    const started = performance.now();
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
      return { supported: false, reason: 'Worker or OffscreenCanvas unavailable' };
    }

    // Reuse the exact Three.js version loaded by the production import map.
    // Import maps are document-scoped; module Workers need an absolute URL.
    const mapElement = document.querySelector('script[type="importmap"]');
    const moduleUrl = JSON.parse(mapElement?.textContent || '{}')?.imports?.three;
    if (!/^https:\/\//.test(moduleUrl || '')) {
      return { supported: false, reason: 'Production Three.js module URL unavailable' };
    }

    // The exact same pure render function runs on both sides of the thread
    // boundary. It renders geometry and verifies resize, not just gl.clear().
    const draw = (THREE, canvas) => {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 2;
      const geometry = new THREE.PlaneGeometry(1.5, 1.5);
      const material = new THREE.MeshBasicMaterial({ color: 0xe02010, toneMapped: false });
      scene.add(new THREE.Mesh(geometry, material));
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const sample = (x, y) => {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
      };
      try {
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x101020, 1);
        renderer.setSize(16, 16, false);
        renderer.render(scene, camera);
        const center = sample(8, 8);
        const background = sample(1, 1);
        const drawCalls = renderer.info.render.calls;
        renderer.setSize(32, 16, false);
        renderer.render(scene, camera);
        const resizedCenter = sample(16, 8);
        const resizedBackground = sample(1, 1);
        return {
          center,
          background,
          resizedCenter,
          resizedBackground,
          drawCalls,
          resizedDrawCalls: renderer.info.render.calls,
          renderer: String(gl.getParameter(gl.RENDERER) || ''),
        };
      } finally {
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      }
    };

    let worker = null;
    let blobUrl = null;
    try {
      const THREE = await import(moduleUrl);
      const mainCanvas = document.createElement('canvas');
      const onMain = draw(THREE, mainCanvas);
      const canvas = document.createElement('canvas');
      const offscreen = canvas.transferControlToOffscreen();
      const source = [
        'const draw = ' + draw.toString() + ';',
        'self.onmessage = async ({ data }) => {',
        '  try {',
        '    const THREE = await import(data.moduleUrl);',
        '    self.postMessage({ result: draw(THREE, data.canvas) });',
        '  } catch (error) {',
        '    self.postMessage({ error: String(error?.stack || error) });',
        '  }',
        '};',
      ].join('\n');
      blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      worker = new Worker(blobUrl, { type: 'module' });
      const workerMessage = await new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => finish({ error: 'Worker Three.js timed out' }), 20000);
        function finish(value) {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          resolve(value);
        }
        worker.onmessage = (event) => finish(event.data || { error: 'Empty worker response' });
        worker.onerror = (event) => finish({ error: event.message || 'Worker crashed' });
        worker.onmessageerror = () => finish({ error: 'Unreadable worker response' });
        try {
          worker.postMessage({ canvas: offscreen, moduleUrl }, [offscreen]);
        } catch (error) {
          finish({ error: String(error) });
        }
      });
      const onWorker = workerMessage.result || null;
      const samePixels =
        onWorker &&
        ['center', 'background', 'resizedCenter', 'resizedBackground'].every(
          (key) => JSON.stringify(onMain[key]) === JSON.stringify(onWorker[key]),
        );
      const geometryVisible = JSON.stringify(onMain.center) !== JSON.stringify(onMain.background);
      const sceneDrawn =
        onMain.drawCalls === 1 &&
        onMain.resizedDrawCalls === 1 &&
        onWorker?.drawCalls === 1 &&
        onWorker?.resizedDrawCalls === 1;
      return {
        supported: Boolean(samePixels && geometryVisible && sceneDrawn),
        reason:
          workerMessage.error ||
          (!samePixels || !geometryVisible || !sceneDrawn ? 'Three.js scene parity failed' : null),
        moduleUrl,
        main: onMain,
        worker: onWorker,
        elapsedMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return { supported: false, reason: String(error?.stack || error) };
    } finally {
      worker?.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  });
  const report = {
    probe: 'p1-worker-three-minimal-scene-v1',
    limitation: 'A detached synthetic plane in software Chromium, not WaferCAD production geometry',
    chromium: browser.version(),
    ...result,
  };
  const output = folder + '/worker-three-feasibility.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('P1_WORKER_THREE_FEASIBILITY', JSON.stringify(report));
  // Unsupported is evidence for design selection, not a release-acceptance pass.
} finally {
  await browser.close();
}
