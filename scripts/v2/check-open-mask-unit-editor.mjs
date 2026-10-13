// Production v2 unit transitions with an actual open Mask Draw editor.
// No approved visual baselines or Kernel geometry are changed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-unit-editor');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = { result: 'running', cases: [] };

try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/app.html?start=empty`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const baseModel = (await snapshot()).model;
    await page.locator('.p-nav [data-action="domain:mask"]').click();
    await page.locator('[data-action="draw-toggle"]').click();
    await page.locator('[data-action="draw-tool:rect"]').click();
    const canvas = page.locator('#maskCanvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds?.width > 50 && bounds?.height > 50);
    const point = (fx, fy) => [bounds.x + bounds.width * fx, bounds.y + bounds.height * fy];
    await page.mouse.move(...point(0.45, 0.45));
    await page.mouse.down();
    await page.mouse.move(...point(0.55, 0.55), { steps: 8 });
    await page.mouse.up();
    await waitForPaint(page);

    const baseline = await snapshot();
    const shape = baseline.drawMask.shapes.at(-1);
    assert.equal(shape?.type, 'rect');
    await page.locator('[data-action="draw-tool:select"]').click();
    await page.mouse.click(...point(0.5, 0.5));
    await page.locator('#drawShapeCx').waitFor();
    const first = Number(await page.locator('#drawShapeCx').inputValue());
    const beforeShapes = (await snapshot()).drawMask.shapes;
    for (const [unit, multiplier] of [
      ['nm', 1000],
      ['mm', 0.001],
      ['um', 1],
    ]) {
      await page.locator('#xyUnitSelect').evaluate((element, selected) => {
        element.value = selected;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, unit);
      await waitForPaint(page);
      assert.ok(
        Math.abs(Number(await page.locator('#drawShapeCx').inputValue()) - first * multiplier) <
          1e-9,
        `Open Mask editor center remains physical when changed to ${unit}`,
      );
      assert.deepEqual((await snapshot()).drawMask.shapes, beforeShapes);
      assert.deepEqual((await snapshot()).model, baseModel);
    }
    await page.locator('[data-action="draw-apply"]').click();
    const committed = await snapshot();
    assert.equal(committed.drawMask.shapes.at(-1).id, shape.id);
    assert.deepEqual(
      committed.drawMask.shapes,
      beforeShapes,
      'Applying unchanged display values preserves exact canonical Mask coordinates',
    );
    assert.deepEqual(committed.model, baseModel);
    await page.locator('[data-action="draw-apply"]').click();
    assert.deepEqual(
      (await snapshot()).drawMask.shapes,
      beforeShapes,
      'repeated Apply without edits does not accumulate rounding error',
    );
    const beforeCenter = (shape.a[0] + shape.b[0]) / 2;
    await page.locator('#drawShapeCx').fill(String(Number(await page.locator('#drawShapeCx').inputValue()) + 0.01));
    await page.locator('[data-action="draw-apply"]').click();
    const afterEdit = await snapshot();
    const moved = afterEdit.drawMask.shapes.find((entry) => entry.id === shape.id);
    assert.ok(moved, 'intentional edit retains its stable shape ID');
    assert.ok(
      Math.abs((moved.a[0] + moved.b[0]) / 2 - beforeCenter - 0.01) <= 0.0001,
      'deliberate 10 nm edit commits within the 0.1 nm input grid',
    );
    assert.deepEqual(afterEdit.model, baseModel);
    assert.deepEqual(errors, []);
    report.cases.push({ width: 1440, kind: 'rect', units: ['nm', 'mm', 'um'] });
    report.result = 'pass';
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.error = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
