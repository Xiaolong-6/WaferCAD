// Shared-geometry 80×80 array: camera interaction may never mutate 6400 physical instances.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage, showWorkstationView, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=example&example=metalens-array', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snap();
    assert.equal(initial.sharedIdentity, true);
    assert.equal(initial.model.array.instances.length, 6400, '80×80 physical array');
    assert.equal(initial.model.array.templates.length, 49, '49 shared physical templates');
    assert.ok(initial.model.array.templates.some((t) => t.model.regions.length > 0));
    assert.equal(initial.workflow.writable, true);

    for (const view of ['mask', 'main']) {
      await showWorkstationView(page, view);
      const canvas = page.locator('#' + view + 'Canvas');
      assert.ok(await canvas.isVisible());
      const physicalSize = await canvas.evaluate((c) => [c.width, c.height]);
      assert.ok(physicalSize[0] > 100 && physicalSize[1] > 100);
    }

    await showWorkstationView(page, 'three');
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 180000 },
    );
    await waitForPaint(page);
    const host = page.locator('#threeHost');
    assert.ok(Number(await host.getAttribute('data-renderer-draw-calls')) > 0);
    assert.ok(Number(await host.getAttribute('data-renderer-draw-triangles')) > 0);
    const canvas = host.locator('canvas');
    assert.equal(await canvas.count(), 1);

    const first = await snap();
    const distance = (camera) =>
      Math.hypot(...camera.position.map((value, i) => value - camera.target[i]));
    const bounds = await canvas.boundingBox();
    assert.ok(bounds && bounds.width > 10 && bounds.height > 10);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, -170);
    await page.waitForFunction(
      (initialDistance) => {
        const camera = window.WaferCadV2Workstation.snapshot().threeCamera;
        const now = Math.hypot(...camera.position.map((value, i) => value - camera.target[i]));
        return Math.abs(now - initialDistance) > 1e-6;
      },
      distance(first.threeCamera),
      { timeout: 15000 },
    );
    const afterZoom = await snap();
    assert.ok(distance(afterZoom.threeCamera) < distance(first.threeCamera));
    assert.deepEqual(afterZoom.model, initial.model, '3D camera changes cannot mutate templates');
    assert.equal(afterZoom.workflow.steps.length, initial.workflow.steps.length);

    const border = page.locator('#threePanel [data-action="borders:three"]');
    const beforeBorder = (await snap()).threeDisplay.borders;
    await border.click();
    assert.equal((await snap()).threeDisplay.borders, !beforeBorder);
    await border.click();
    assert.equal((await snap()).threeDisplay.borders, beforeBorder);
    assert.deepEqual((await snap()).model, initial.model, 'Borders do not mutate array instances');
    assert.deepEqual(errors, []);
    console.log('v2 80x80 array: physical instances, 3D frame, zoom and display isolation PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
