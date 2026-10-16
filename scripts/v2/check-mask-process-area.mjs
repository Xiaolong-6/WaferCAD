// Scientific invariant: Process/Mask ROI applies only within the selected physical footprint.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage, showWorkstationView, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=example&example=photodetector-literature');
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snap();
    const command = async (action) => {
      const button = page.locator('[data-action="' + action + '"]');
      if (!(await button.isVisible()))
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      await button.click();
      await waitForPaint(page);
    };
    await showWorkstationView(page, 'mask');
    await command('mask-roi-toggle');
    await page.locator('[data-action="mask-roi-tool:square"]').click();
    const bounds = await page.locator('#maskCanvas').boundingBox();
    assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
    await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6, {
      steps: 8,
    });
    await page.mouse.up();
    await command('mask-roi-settings');
    for (const [id, value] of [
      ['maskRoiX', '0'],
      ['maskRoiY', '0'],
      ['maskRoiSize', '1'],
    ])
      await page.locator('#' + id).fill(value);
    await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
    await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
    const scoped = await snap();
    assert.equal(scoped.maskRoi.size, 1);
    assert.deepEqual(scoped.model, before.model, 'Editing ROI cannot modify physical layers');
    await page.locator('[data-action="domain:project"]').click();
    for (const unit of ['nm', 'mm', 'um']) {
      await page.locator('#xyUnitSelect').selectOption(unit);
      assert.deepEqual((await snap()).maskRoi, scoped.maskRoi, 'Units preserve canonical Mask ROI');
      assert.deepEqual((await snap()).model, before.model, 'Units preserve physical model');
    }

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#faceToggleBtn').selectOption('front');
    await page.locator('#layerName').fill('Scoped mask geometry film');
    await page.locator('#operationThickness').fill('0.125');
    await page.locator('#applyOperationBtn').click();
    const branch = page.getByRole('button', { name: 'Create Variant & apply', exact: true });
    if (await branch.isVisible()) await branch.click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().model.layers.some(
          (layer) => layer.name === 'Scoped mask geometry film',
        ),
      null,
      { timeout: 120000 },
    );
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy);
    const deposited = await snap();
    const layer = deposited.model.layers.find((item) => item.name === 'Scoped mask geometry film');
    assert.ok(layer);
    const coverage = await page.evaluate(async (id) => {
      const { geometryArea } = await import('./model.js');
      const { pointInMulti } = await import('./vector-geometry.js');
      const regions = window.WaferCadV2Workstation.snapshot().model.regions.filter((region) =>
        region.stack.some((segment) => segment.layerId === id),
      );
      return {
        area: regions.reduce((sum, region) => sum + geometryArea(region.geom), 0),
        thicknesses: regions.flatMap((region) =>
          region.stack
            .filter((segment) => segment.layerId === id)
            .map((segment) => segment.z1 - segment.z0),
        ),
        inside: regions.some((region) => pointInMulti([0.4, 0], region.geom)),
        outside: regions.some((region) => pointInMulti([0.75, 0], region.geom)),
      };
    }, layer.id);
    assert.ok(Math.abs(coverage.area - 1) < 1e-10, 'Deposit must have exactly 1 µm² mask area');
    assert.ok(coverage.thicknesses.length > 0);
    assert.ok(coverage.thicknesses.every((t) => Math.abs(t - 0.125) < 1e-12));
    assert.equal(coverage.inside, true, 'Inside Mask is deposited');
    assert.equal(coverage.outside, false, 'Outside Mask is never deposited');
    assert.deepEqual(deposited.maskRoi, scoped.maskRoi);
    assert.equal(deposited.workflow.steps.length, before.workflow.steps.length + 1);
    assert.deepEqual(errors, []);
    console.log('v2 Mask/Process geometry: physical area, thickness, isolation, History PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
