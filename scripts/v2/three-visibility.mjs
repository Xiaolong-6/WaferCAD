// Verify the captured compositor image, not merely a submitted WebGL draw count.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function captureVisibleThree(page, path, { fullPage = true } = {}) {
  const measure = () =>
    page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return {
          x: box.x + window.scrollX,
          y: box.y + window.scrollY,
          width: box.width,
          height: box.height,
        };
      };
      return {
        canvas: rect('#threeHost canvas'),
        host: rect('#threeHost'),
        container: rect('#threePanel .v2-view-stage-container'),
        viewportWidth: innerWidth,
        environment: {
          coarse: window.matchMedia('(pointer: coarse)').matches,
          medium: window.matchMedia('(max-width: 1180px) and (min-width: 821px)').matches,
          viewportHeight: innerHeight,
          visualScale: window.visualViewport?.scale,
          fontStatus: document.fonts.status,
          panelWidth: getComputedStyle(document.querySelector('.p-workbench')).getPropertyValue(
            '--p-panel',
          ),
        },
      };
    });
  const dimensions = await measure();
  // Chromium's captureBeyondViewport changes pointer:coarse to fine in touch emulation.
  // Capture the actual touch viewport; keep full-page coverage for narrow desktop layouts.
  if (!fullPage)
    assert.ok(
      dimensions.canvas.y + dimensions.canvas.height <= dimensions.environment.viewportHeight,
      'The complete 3D canvas must fit the captured touch viewport',
    );
  const screenshot = await page.screenshot({ path, fullPage });
  const afterCapture = await measure();
  await writeFile(
    path.replace(/\.png$/, '.visibility.json'),
    JSON.stringify({ fullPage, dimensions, afterCapture }, null, 2),
  );
  const { canvas, host, container } = dimensions;
  assert.ok(canvas.width > 0 && canvas.height > 0, '3D canvas must have positive dimensions');
  for (const edge of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(canvas[edge] - host[edge]) <= 0.25, `3D canvas ${edge} must match its host`);
  assert.ok(host.height <= container.height + 0.25, '3D host must fit its stage container');
  for (const target of ['canvas', 'host', 'container'])
    for (const edge of ['x', 'y', 'width', 'height'])
      assert.ok(
        Math.abs(afterCapture[target][edge] - dimensions[target][edge]) <= 0.25,
        `3D ${target} ${edge} must stay stable across capture`,
      );
  const coloredPixels = await page.evaluate(
    async ({ png, canvas, viewportWidth }) => {
      const response = await fetch(`data:image/png;base64,${png}`);
      const bitmap = await createImageBitmap(await response.blob());
      const scale = bitmap.width / viewportWidth;
      const image = document.createElement('canvas');
      image.width = Math.ceil(canvas.width);
      image.height = Math.ceil(canvas.height);
      const context = image.getContext('2d', { willReadFrequently: true });
      context.drawImage(
        bitmap,
        canvas.x * scale,
        canvas.y * scale,
        canvas.width * scale,
        canvas.height * scale,
        0,
        0,
        image.width,
        image.height,
      );
      bitmap.close();
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
        // The fixtures have colored materials. Exclude neutral background and pure RGB axes.
        if (pixels[i + 3] > 0 && low > 20 && high < 240 && high - low > 15) count++;
      }
      return count;
    },
    { png: screenshot.toString('base64'), canvas, viewportWidth: dimensions.viewportWidth },
  );
  if (coloredPixels < 64) {
    // Strict visual rejection is unchanged. Preserve independent canvas
    // evidence so a full-page compositor crop is distinguishable from an
    // empty WebGL frame without changing the approved screenshot baseline.
    const renderer = await page.locator('#threeHost').evaluate((host) => {
      const canvas = host.querySelector('canvas');
      const gl = canvas?.getContext('webgl2');
      return {
        renderState: host.dataset.renderState,
        renderPhase: host.dataset.renderPhase,
        renderQuality: host.dataset.renderQuality,
        frameSerial: host.dataset.rendererFrameSerial,
        drawCalls: host.dataset.rendererDrawCalls,
        triangles: host.dataset.rendererDrawTriangles,
        sceneGeneration: host.dataset.sceneGeneration,
        cameraWorld: host.dataset.rendererCameraWorld,
        cameraProjection: host.dataset.rendererCameraProjection,
        canvasBacking: canvas ? [canvas.width, canvas.height] : null,
        framebuffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null,
        contextLost: gl?.isContextLost() ?? null,
      };
    });
    await page.locator('#threeHost canvas').screenshot({
      path: path.replace(/\.png$/, '-canvas.png'),
    });
    await writeFile(
      path.replace(/\.png$/, '.failure.json'),
      JSON.stringify({ fullPage, coloredPixels, dimensions, afterCapture, renderer }, null, 2),
    );
  }
  assert.ok(coloredPixels >= 64, `3D capture must show material pixels; found ${coloredPixels}`);
  return { fullPage, ...dimensions, afterCapture, coloredPixels };
}
