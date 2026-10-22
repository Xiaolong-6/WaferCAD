import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { waitForPaint } from '../test-helpers/ui.mjs';

export async function checkMaskTouch(browser, base, output) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 960 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/app-v2-mask.html`);
    await page.waitForFunction(() => window.WaferCadV2Mask?.ready, null, { timeout: 120000 });
    const box = await page.locator('#maskCanvas').boundingBox();
    const x = Math.round(box.x + box.width * 0.5),
      y = Math.round(box.y + box.height * 0.7);
    const cdp = await context.newCDPSession(page);
    const dispatch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([id, px, py]) => ({ id, x: px, y: py, radiusX: 1, radiusY: 1 })),
      });
      await waitForPaint(page);
    };
    const snapshot = () => page.evaluate(() => window.WaferCadV2Mask.snapshot());
    const enabled = async (key, value) => {
      const node = page.locator(`[data-action="tool:${key}:mask"]`);
      if (((await node.getAttribute('aria-pressed')) === 'true') !== value) {
        if (!(await node.isVisible()))
          await page.getByRole('button', { name: 'Mask more tools', exact: true }).click();
        await node.click();
        await waitForPaint(page);
      }
    };
    const singleDrag = async (dx = 24, dy = 16) => {
      await dispatch('touchStart', [[1, x, y]]);
      await dispatch('touchMove', [[1, x + dx, y + dy]]);
      await dispatch('touchEnd', []);
    };
    const pinch = async () => {
      await dispatch('touchStart', [[1, x - 20, y]]);
      await dispatch('touchStart', [
        [1, x - 20, y],
        [2, x + 20, y],
      ]);
      await dispatch('touchMove', [
        [1, x - 40, y],
        [2, x + 40, y],
      ]);
      await dispatch('touchEnd', []);
    };
    const cases = [];
    for (const [pan, zoom] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      await enabled('pan', pan);
      await enabled('zoom', zoom);
      await page.locator('[data-action="fit:mask"]').click();
      const before = await snapshot();
      await singleDrag();
      const dragged = await snapshot();
      if (pan) {
        assert.ok(Math.abs(dragged.plan.panX - 24) <= 0.25);
        assert.ok(Math.abs(dragged.plan.panY - 16) <= 0.25);
      } else assert.deepEqual(dragged.plan, before.plan);
      assert.equal(dragged.plan.zoom, before.plan.zoom);
      await page.locator('[data-action="fit:mask"]').click();
      await pinch();
      const pinched = await snapshot();
      if (zoom) assert.ok(pinched.plan.zoom > 1);
      else assert.equal(pinched.plan.zoom, 1);
      assert.deepEqual(pinched.drawMask, before.drawMask);
      assert.equal(pinched.scientificUnchanged, true);
      cases.push({ pan, zoom, dragged: dragged.plan, pinched: pinched.plan });
    }
    await page.locator('[data-action="fit:mask"]').click();
    await page.locator('[data-action="draw-toggle"]').click();
    const targets = await page.locator('#maskDrawTools button').evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
    );
    assert.ok(targets.every((target) => target.width >= 40 && target.height >= 40));
    const before = await snapshot();
    await page.locator('[data-action="draw-tool:rect"]').click();
    await dispatch('touchStart', [[1, x, y]]);
    await dispatch('touchMove', [[1, x + 20, y + 10]]);
    await dispatch('touchStart', [
      [1, x + 20, y + 10],
      [2, x + 60, y + 10],
    ]);
    await dispatch('touchMove', [
      [1, x, y + 10],
      [2, x + 80, y + 10],
    ]);
    await dispatch('touchEnd', []);
    assert.deepEqual(
      (await snapshot()).drawMask,
      before.drawMask,
      'Pinch cancels uncommitted Draw geometry',
    );
    await page.locator('[data-action="fit:mask"]').click();
    await page.locator('[data-action="draw-tool:rect"]').click();
    const view = await page.evaluate(() => window.WaferCadV2Mask.projection());
    await singleDrag(32, 16);
    const rect = (await snapshot()).drawMask.shapes.at(-1);
    assert.equal(rect.type, 'rect');
    assert.ok(Math.abs((rect.b[0] - rect.a[0]) * view.s - 32) <= 0.25);
    assert.ok(Math.abs((rect.b[1] - rect.a[1]) * view.s - 16) <= 0.25);
    await page.screenshot({ path: resolve(output, 'mask-touch.png'), fullPage: true });
    assert.deepEqual(errors, []);
    return { cases, targets, rectangle: rect, errors };
  } finally {
    await context.close();
  }
}
