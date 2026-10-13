// Real v2 Mask ROI/Alignment editor and persistent project unit lifecycle.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const out = resolve('test-results/ui-v2-unit-lifecycle');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const report = { result: 'running', cases: [] };

try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty');
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const original = await snapshot();
    await page.locator('.p-nav [data-action="domain:mask"]').click();
    const canvas = page.locator('#maskCanvas');
    const bounds = await canvas.boundingBox();
    assert.ok(bounds && bounds.width > 50 && bounds.height > 50);
    const point = (fx, fy) => [bounds.x + bounds.width * fx, bounds.y + bounds.height * fy];
    const unit = async (key) => {
      await page.locator('#xyUnitSelect').evaluate((node, selected) => {
        node.value = selected;
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }, key);
      await waitForPaint(page);
    };
    const checkImmutable = async (before, label) => {
      const after = await snapshot();
      assert.deepEqual(after.model, before.model, label + ' canonical model');
      assert.deepEqual(after.drawMask, before.drawMask, label + ' Draw geometry and IDs');
      assert.deepEqual(after.workflow.steps, before.workflow.steps, label + ' History');
      assert.deepEqual(after.workflow.branches, before.workflow.branches, label + ' Variants');
    };
    await page.locator('[data-action="mask-roi-toggle"]').click();
    for (const shape of ['square', 'circle']) {
      await page.locator('[data-action="mask-roi-tool:' + shape + '"]').click();
      await page.mouse.move(...point(0.31, 0.33));
      await page.mouse.down();
      await page.mouse.move(...point(0.43, 0.45), { steps: 9 });
      await page.mouse.up();
      await waitForPaint(page);
      const created = await snapshot();
      assert.equal(created.maskRoi?.type, shape);
      await page.locator('[data-action="mask-roi-settings"]').click();
      await page.locator('#maskRoiX').waitFor({ state: 'visible' });
      const initialX = Number(await page.locator('#maskRoiX').inputValue());
      const angle = shape === 'square' ? await page.locator('#maskRoiRotation').inputValue() : null;
      for (const [key, factor] of [
        ['nm', 1000],
        ['mm', 0.001],
        ['um', 1],
      ]) {
        await unit(key);
        const draft = Number(await page.locator('#maskRoiX').inputValue());
        assert.ok(
          Math.abs(draft - initialX * factor) < Math.max(1e-8, Math.abs(initialX * factor) * 1e-11),
          shape + ' draft unit ' + key,
        );
        assert.deepEqual(
          (await snapshot()).maskRoi,
          created.maskRoi,
          shape + ' unit change is non-mutating',
        );
        await checkImmutable(created, shape + ' unit ' + key);
        if (shape === 'square') {
          assert.equal(await page.locator('#maskRoiRotation').inputValue(), angle);
        }
      }
      await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
      assert.deepEqual(
        (await snapshot()).maskRoi,
        created.maskRoi,
        shape + ' untouched Apply is exact no-op',
      );
      await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
      assert.deepEqual(
        (await snapshot()).maskRoi,
        created.maskRoi,
        shape + ' repeated Apply is exact no-op',
      );
      const xEdited = initialX + 0.001;
      await page.locator('#maskRoiX').fill(String(xEdited));
      await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
      const changed = await snapshot();
      assert.ok(
        Math.abs(changed.maskRoi.c[0] - created.maskRoi.c[0] - 0.001) < 1e-8,
        shape + ' intentional 1 nm edit commits',
      );
      await checkImmutable(created, shape + ' intentional ROI edit');
      await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
      report.cases.push({ type: 'roi-' + shape, units: ['nm', 'mm', 'um'] });
    }

    await page.locator('[data-action="mask-alignment-settings"]').click();
    await page.locator('#maskOffsetX').waitFor({ state: 'visible' });
    for (const [id, value] of [
      ['maskOffsetX', '1.2346'],
      ['maskOffsetY', '-0.125'],
      ['maskScale', '1.25'],
      ['maskRotation', '31.5'],
    ]) {
      await page.locator('#' + id).fill(value);
    }
    await page.locator('[data-action="alignment-apply"]').click();
    const aligned = await snapshot();
    const offsetX = Number(await page.locator('#maskOffsetX').inputValue());
    const scale = await page.locator('#maskScale').inputValue();
    const angle = await page.locator('#maskRotation').inputValue();
    for (const [key, factor] of [
      ['nm', 1000],
      ['mm', 0.001],
      ['um', 1],
    ]) {
      await unit(key);
      assert.ok(
        Math.abs(Number(await page.locator('#maskOffsetX').inputValue()) - offsetX * factor) < 1e-8,
        'Alignment X draft unit ' + key,
      );
      assert.equal(
        await page.locator('#maskScale').inputValue(),
        scale,
        'Alignment scale is dimensionless',
      );
      assert.equal(
        await page.locator('#maskRotation').inputValue(),
        angle,
        'Alignment angle is dimensionless',
      );
      assert.deepEqual((await snapshot()).maskTransform, aligned.maskTransform);
      assert.deepEqual((await snapshot()).maskRoi, aligned.maskRoi);
      await checkImmutable(aligned, 'alignment unit ' + key);
    }
    await page.locator('[data-action="alignment-apply"]').click();
    assert.deepEqual(
      (await snapshot()).maskTransform,
      aligned.maskTransform,
      'Alignment untouched Apply must not quantize physical offsets',
    );
    await page.locator('#maskOffsetX').fill(String(offsetX + 0.001));
    await page.locator('[data-action="alignment-apply"]').click();
    const changed = await snapshot();
    assert.ok(Math.abs(changed.maskTransform.x - aligned.maskTransform.x - 0.001) < 1e-10);
    assert.equal(
      changed.maskTransform.y,
      aligned.maskTransform.y,
      'Editing X cannot quantize untouched Alignment Y',
    );
    assert.equal(changed.maskTransform.scale, aligned.maskTransform.scale);
    assert.equal(changed.maskTransform.rotation, aligned.maskTransform.rotation);
    await checkImmutable(aligned, 'alignment intentional edit');
    report.cases.push({ type: 'alignment', units: ['nm', 'mm', 'um'] });

    // Explicit Project Save, browser reload and persistent Recovery must not
    // depend on whichever display unit was active while the editor was open.
    await page.locator('.p-nav [data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () =>
        /Saved .* locally/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const beforeReload = await snapshot();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(restored.model, beforeReload.model, 'Reload model');
    assert.deepEqual(restored.maskRoi, beforeReload.maskRoi, 'Reload Mask ROI');
    assert.deepEqual(restored.maskTransform, beforeReload.maskTransform, 'Reload Alignment');
    assert.deepEqual(restored.drawMask, beforeReload.drawMask, 'Reload Draw IDs');
    assert.deepEqual(restored.workflow.steps, beforeReload.workflow.steps, 'Reload History');
    assert.deepEqual(restored.workflow.branches, beforeReload.workflow.branches, 'Reload Variants');
    assert.deepEqual(restored.model, original.model, 'Unit editor never changes physical model');
    assert.deepEqual(errors, []);
    report.cases.push({ type: 'explicit-save-reload', result: 'pass' });
    report.result = 'pass';
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.error = error.stack;
  throw error;
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
