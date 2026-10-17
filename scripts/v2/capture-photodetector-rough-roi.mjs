// Real Workstation-only inspection: exercise Main ROI and Section Z-break UI.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { waitForPaint } from '../test-helpers/ui.mjs';

export async function capturePhotodetectorRoughRoi(page, output, width) {
  assert.ok(width > 820, 'Rough ROI inspection requires the desktop Workstation');
  const modelBefore = await page.evaluate(() =>
    JSON.stringify(window.WaferCadV2Workstation.snapshot().model),
  );
  const maximize = async (name) => {
    await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
    await page.locator(`button[data-action="maximize:${name}"]`).click();
    await waitForPaint(page);
  };

  // Use the same user interactions as the Main/3D synchronization regression.
  await maximize('main');
  await page.locator('#mainPanel [data-action="roi"]').click();
  await page.locator('[data-action="roi-tool:rect"]').click();
  const box = await page.locator('#mainCanvas').boundingBox();
  assert.ok(box?.width > 100 && box?.height > 100, 'Main canvas must be measurable');
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await page.locator('[data-action="settings:main"]').click();
  for (const [id, value] of [
    ['roiX', '0'],
    ['roiY', '0'],
    ['roiWidth', '16'],
    ['roiHeight', '16'],
  ]) {
    await page.locator(`#${id}`).fill(value);
  }
  await page.locator('#mainRoiSettings').getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Close Main ROI settings', exact: true }).click();
  const roi = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().roi);
  assert.equal(roi?.type, 'rect', 'Actual Main ROI must be rectangular');
  assert.ok(
    Math.abs(roi.b[0] - roi.a[0] - 16) < 1e-6 &&
      Math.abs(roi.b[1] - roi.a[1] - 16) < 1e-6,
    'Main ROI must be exactly 16 x 16 physical um',
  );

  // Use the existing Z-break editor, not direct state writes or synthetic shaders.
  await page.locator('.p-desktop-dock-actions [data-action="dock:overview"]').click();
  await page.locator('#sectionPanel [data-action="zbreak-settings"]').click();
  await page.locator('#section-collapse-enabled').setChecked(true);
  const zRange = await page.evaluate(() => {
    const model = window.WaferCadV2Workstation.snapshot().model;
    const levels = model.regions.flatMap((region) =>
      region.stack.flatMap((layer) => [layer.z0, layer.z1]),
    );
    return { bottom: Math.min(...levels) + 3, top: Math.max(...levels) - 3 };
  });
  assert.ok(zRange.top > zRange.bottom, 'Z-break must preserve the front and rear caps');
  for (const [id, value] of [
    ['sectionCollapseTopInput', zRange.top],
    ['sectionCollapseBottomInput', zRange.bottom],
  ]) {
    const input = page.locator(`#${id}`);
    await input.fill(String(value));
    await input.press('Tab');
    assert.equal(
      await input.evaluate((node) => node.validationMessage),
      '',
      'Z-break coordinate must remain physically valid',
    );
  }
  await page.getByRole('button', { name: 'Close Z Break', exact: true }).click();

  await maximize('three');
  await page.locator('#threePanel [data-action="fit:three"]').click();
  await page.waitForFunction(
    () => {
      const host = document.getElementById('threeHost');
      const canvas = host?.querySelector('canvas');
      return (
        host?.dataset.renderState === 'ready' &&
        host.dataset.renderPhase === 'complete' &&
        host.dataset.zCollapseEnabled === 'true' &&
        canvas?.dataset.roughMeshMode === 'detailed' &&
        Number(canvas.dataset.roughTriangleCount) > 0
      );
    },
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  assert.equal((await page.locator('#threeStats').innerText()).trim(), 'ROI');
  const modelAfter = await page.evaluate(() =>
    JSON.stringify(window.WaferCadV2Workstation.snapshot().model),
  );
  assert.equal(modelAfter, modelBefore, 'Presentation-only inspection must not change geometry');
  const filename = `photodetector-rough-roi-${width}.png`;
  await page.screenshot({ path: resolve(output, filename) });
  await page.locator('#threePanel').screenshot({
    path: resolve(output, `photodetector-rough-roi-${width}-panel.png`),
  });
  const native = await page.evaluate(() => {
    const host = document.getElementById('threeHost');
    const canvas = host.querySelector('canvas');
    return {
      mode: canvas.dataset.roughMeshMode,
      triangles: Number(canvas.dataset.roughTriangleCount),
      renderer: host.dataset.renderState,
      zBreakEnabled: host.dataset.zCollapseEnabled,
      roiReadout: document.getElementById('threeStats')?.textContent?.trim(),
    };
  });
  return { screenshot: filename, roi, zBreak: zRange, native, modelUnchanged: true };
}
