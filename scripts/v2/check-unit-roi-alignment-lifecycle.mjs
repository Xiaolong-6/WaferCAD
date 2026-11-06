// Real v2 Mask ROI/Alignment editor and persistent project unit lifecycle.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

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
    await selectScientificView(page, 'mask', 1440);
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
      // The canvas source may be sub-grid while the editor exposes a 0.1 nm
      // draft. The intended target is the edited displayed coordinate, not
      // original canvas center + 1 nm (which differs by display rounding).
      assert.ok(
        Math.abs(changed.maskRoi.c[0] - xEdited) < 1e-9,
        shape + ' edited X equals the requested physical coordinate',
      );
      assert.notEqual(
        changed.maskRoi.c[0],
        created.maskRoi.c[0],
        shape + ' intentional edit changes canonical X',
      );
      assert.equal(
        changed.maskRoi.c[1],
        created.maskRoi.c[1],
        shape + ' X edit preserves sub-grid Y',
      );
      if (shape === 'square') {
        assert.equal(changed.maskRoi.size, created.maskRoi.size);
        assert.equal(changed.maskRoi.rotation, created.maskRoi.rotation);
      } else {
        assert.equal(changed.maskRoi.r, created.maskRoi.r);
      }
      await checkImmutable(created, shape + ' intentional ROI edit');
      await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
      report.cases.push({ type: 'roi-' + shape, units: ['nm', 'mm', 'um'] });
    }

    const alignmentTrigger = page.locator('[data-action="mask-alignment-settings"]');
    const alignmentDialog = page.locator('#maskAlignmentSettings');
    const openAlignment = async () => {
      await alignmentTrigger.click();
      await alignmentDialog.waitFor({ state: 'visible' });
    };
    const applyAlignment = async () => {
      await alignmentDialog.getByRole('button', { name: 'Apply', exact: true }).click();
      await alignmentDialog.waitFor({ state: 'detached' });
    };
    await openAlignment();
    for (const [id, value] of [
      ['maskOffsetX', '1.2346'],
      ['maskOffsetY', '-0.125'],
      ['maskScale', '1.25'],
      ['maskRotation', '31.5'],
    ]) {
      await page.locator('#' + id).fill(value);
    }
    await applyAlignment();
    const aligned = await snapshot();
    assert.deepEqual(aligned.maskTransform, { x: 1.2346, y: -0.125, scale: 1.25, rotation: 31.5 });
    await unit('nm');
    await openAlignment();
    assert.ok(Math.abs(Number(await page.locator('#maskOffsetX').inputValue()) - 1234.6) < 1e-8);
    await unit('um');
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
    await applyAlignment();
    assert.deepEqual(
      (await snapshot()).maskTransform,
      aligned.maskTransform,
      'Alignment untouched Apply must not quantize physical offsets',
    );
    await openAlignment();
    await page.locator('#maskOffsetX').fill(String(offsetX + 0.001));
    await applyAlignment();
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

    // Use a real GDS source to verify drag previews do not modify canonical geometry.
    await page.locator('#gdsInput').setInputFiles('site/samples/klayout/gds-basic-instances.gds');
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().layout.elements.length > 0,
    );
    await page.locator('.p-nav [data-action="domain:mask"]').click();
    assert.equal(
      await page
        .locator('[data-slot="panel.mask"] summary')
        .filter({ hasText: 'Transform' })
        .count(),
      0,
      'There must be only one Alignment editor',
    );
    const committedBeforeDrag = await snapshot();
    await openAlignment();
    const viewScale = await page.evaluate(() => {
      const v = window.WaferCadV2Mask.projection();
      return v.s;
    });
    const start = await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      for (const fraction of [0.7, 0.4, 0.2]) {
        const x = Math.round(rect.left + rect.width * fraction);
        const y = Math.round(rect.top + rect.height * 0.7);
        if (document.elementFromPoint(x, y) === node) return [x, y];
      }
      return null;
    });
    assert.ok(start, 'The floating editor leaves the Mask canvas available to drag');
    const [x0, y0] = start;
    const drag = async () => {
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      await page.mouse.move(x0 + 48, y0 - 24, { steps: 8 });
      await page.mouse.up();
      await waitForPaint(page);
    };
    await drag();
    const previewX = Number(await page.locator('#maskOffsetX').inputValue());
    const previewY = Number(await page.locator('#maskOffsetY').inputValue());
    assert.ok(Math.abs(previewX - 48 / viewScale) < 0.00011, 'Drag X in physical µm');
    assert.ok(Math.abs(previewY - 24 / viewScale) < 0.00011, 'Drag Y in physical µm');
    assert.deepEqual(
      (await snapshot()).maskTransform,
      committedBeforeDrag.maskTransform,
      'Pointer preview must not mutate the committed alignment',
    );
    await page.locator('[data-action="alignment-cancel"]').click();
    assert.deepEqual((await snapshot()).maskTransform, committedBeforeDrag.maskTransform);
    await openAlignment();
    await drag();
    await page.keyboard.press('Escape');
    await alignmentDialog.waitFor({ state: 'detached' });
    assert.deepEqual((await snapshot()).maskTransform, committedBeforeDrag.maskTransform);
    await openAlignment();
    await drag();
    await page.screenshot({ path: resolve(out, 'alignment-draft.png') });
    await applyAlignment();
    const committedAfterDrag = await snapshot();
    assert.ok(Math.abs(committedAfterDrag.maskTransform.x - 48 / viewScale) < 1e-9);
    assert.ok(Math.abs(committedAfterDrag.maskTransform.y - 24 / viewScale) < 1e-9);
    assert.equal(committedAfterDrag.maskTransform.scale, committedBeforeDrag.maskTransform.scale);
    assert.equal(
      committedAfterDrag.maskTransform.rotation,
      committedBeforeDrag.maskTransform.rotation,
    );
    await checkImmutable(committedBeforeDrag, 'pointer alignment');
    report.cases.push({ type: 'alignment-pointer', result: 'pass' });

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
