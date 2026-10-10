import assert from 'node:assert/strict';
import { launchBrowser, newUiContext, observePageErrors } from './test-helpers/ui.mjs';
import { installWebglFrameProbe } from './test-helpers/webgl-frame-probe.mjs';

const browser = await launchBrowser();
try {
  const context = await newUiContext(browser);
  await context.addInitScript(installWebglFrameProbe);
  const page = await context.newPage();
  const errors = observePageErrors(page);
  await page.route('http://probe.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="threeHost"></div>',
    }),
  );
  await page.goto('http://probe.test/');
  const result = await page.evaluate(async () => {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js');
    const host = document.getElementById('threeHost');
    Object.assign(host.dataset, {
      renderState: 'ready',
      sceneVariant: 'transparent',
      renderQuality: 'quality',
    });
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 3;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: '#2288cc',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, 625);
    mesh.userData.waferCadPresentation = { kind: 'sidewall' };
    mesh.name = 'probe-plane';
    for (let i = 0; i < 625; i++) mesh.setMatrixAt(i, new THREE.Matrix4());
    mesh.onBeforeRender = () => window.__waferCadWebglProbe.owner(mesh);
    scene.add(mesh);
    const images = [],
      states = [];
    for (const rasterDiscard of [false, true, false]) {
      window.__waferCadWebglProbe.arm({ rasterDiscard });
      await new Promise((resolve) =>
        requestAnimationFrame(() => {
          renderer.render(scene, camera);
          host.dataset.rendererFrameSerial = String(states.length + 1);
          resolve();
        }),
      );
      const frame = window.__waferCadWebglProbe.frames().at(-1);
      while (frame.timerStatus === 'pending')
        await new Promise((resolve) => setTimeout(resolve, 20));
      states.push({
        ...frame,
        threeCalls: renderer.info.render.calls,
        threeTriangles: renderer.info.render.triangles,
      });
      // Copy immediately after completion, before the next framebuffer swap.
      images.push(renderer.domElement.toDataURL());
    }
    material.dispose();
    geometry.dispose();
    renderer.dispose();
    return {
      states,
      normalParity: images[0] === images[2],
      discardedImageDifferent: images[0] !== images[1],
    };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.normalParity, true, 'normal image restored exactly after discard');
  assert.equal(result.discardedImageDifferent, true, 'discard image is visibly incomplete');
  for (const frame of result.states) {
    assert.equal(frame.drawCalls, 2);
    assert.equal(frame.triangles, 2500);
    assert.equal(frame.threeCalls, frame.drawCalls);
    assert.equal(frame.threeTriangles, frame.triangles);
    assert.equal(frame.glError, 0);
    assert.equal(frame.priorRasterDiscard, false);
    assert.equal(frame.owners[0].kind, 'sidewall');
    assert.equal(frame.owners[0].triangles, 2500);
    if (frame.timerStatus !== 'valid') assert.equal(frame.gpuMs, null);
  }
  console.log('WEBGL_FRAME_PROBE_SMOKE_OK', JSON.stringify(result));
} finally {
  await browser.close();
}
