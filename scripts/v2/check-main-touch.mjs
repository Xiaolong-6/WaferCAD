// Browser-generated touch/pointer events against the real Main controllers.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { waitForPaint } from '../test-helpers/ui.mjs';

export async function checkMainTouch(browser, base, output) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 960 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/app-v2-main.html`);
    await page.waitForFunction(() => window.WaferCadV2Main?.ready, null, { timeout: 120000 });
    const box = await page.locator('#mainCanvas').boundingBox();
    const x = Math.round(box.x + box.width * 0.5),
      y = Math.round(box.y + box.height * 0.55);
    const cdp = await context.newCDPSession(page);
    const dispatch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([id, px, py]) => ({ id, x: px, y: py, radiusX: 1, radiusY: 1 })),
      });
      await waitForPaint(page);
    };
    const snapshot = () => page.evaluate(() => window.WaferCadV2Main.snapshot());
    const setEnabled = async (key, enabled) => {
      const button = page.locator(`[data-action="tool:${key}:main"]`);
      if (((await button.getAttribute('aria-pressed')) === 'true') !== enabled)
        await button.click();
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
      await setEnabled('pan', pan);
      await setEnabled('zoom', zoom);
      await page.locator('[data-action="fit:main"]').click();
      const before = await snapshot();
      await singleDrag();
      const dragged = await snapshot();
      if (pan) {
        assert.ok(Math.abs(dragged.plan.panX - 24) <= 0.25);
        assert.ok(Math.abs(dragged.plan.panY - 16) <= 0.25);
      } else assert.deepEqual(dragged.plan, before.plan);
      assert.equal(dragged.plan.zoom, before.plan.zoom);
      await page.locator('[data-action="fit:main"]').click();
      await pinch();
      const pinched = await snapshot();
      if (zoom) assert.ok(pinched.plan.zoom > 1);
      else assert.equal(pinched.plan.zoom, 1);
      assert.deepEqual(pinched.section, before.section);
      assert.equal(pinched.scientificUnchanged, true);
      cases.push({ pan, zoom, dragged: dragged.plan, pinched: pinched.plan });
    }
    await page.locator('[data-action="fit:main"]').click();
    await page.locator('[data-action="roi"]').click();
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
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
    assert.equal((await snapshot()).roi, null, 'Pinch cancels an uncommitted one-finger ROI draft');
    await page.locator('[data-action="fit:main"]').click();
    await page.getByRole('button', { name: 'Square', exact: true }).click();
    await singleDrag(32, 16);
    const roi = (await snapshot()).roi;
    assert.equal(roi.type, 'rect');
    assert.ok(Math.abs(roi.b[0] - roi.a[0] - (roi.b[1] - roi.a[1])) <= 1e-12);
    await page.getByRole('button', { name: 'Slice', exact: true }).click();
    const beforeSlice = (await snapshot()).section;
    await singleDrag(48, 24);
    assert.notDeepEqual((await snapshot()).section, beforeSlice);
    assert.equal((await snapshot()).scientificUnchanged, true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(output, 'main-touch.png') });
    return { result: 'pass', cases, roiDraftCancelled: true, squareAndSliceSingleFinger: true };
  } finally {
    await context.close();
  }
}
