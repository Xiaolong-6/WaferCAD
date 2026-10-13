// Real user sequences on one project owner and the original Section compositor.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, waitForPaint } from '../test-helpers/ui.mjs';
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-section-review');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  widths: [],
  errors: [],
};
const browser = await launchBrowser();
try {
  report.browser = browser.version();
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      acceptDownloads: true,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', async (d) => {
        errors.push(d.type());
        await d.dismiss();
      });
      await page.goto(`${base}/app.html?start=example&example=m3d`);
      await page.waitForFunction(() => document.body.dataset.ready !== 'false', null, {
        timeout: 120000,
      });
      assert.equal(
        await page.locator('body').getAttribute('data-ready'),
        'true',
        await page.locator('body').innerText(),
      );
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const initial = await snapshot();
      assert.equal(initial.sharedIdentity, true);
      assert.equal(initial.model.layers.length, 27);
      assert.equal(initial.model.regions.length, 551);
      assert.deepEqual(
        await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .map((i) => i.name)
            .filter((n) => /\/app\.(js|html)(\?|$)/.test(n)),
        ),
        [],
      );
      const command = async (action) => {
        const target = page.locator(`[data-action="${action}"]`);
        if (!(await target.isVisible())) {
          const panel = action.includes('mask')
            ? 'mask'
            : action.includes('main') || action === 'slice-coordinates'
              ? 'main'
              : 'section';
          await page
            .locator(
              `#${panel}Panel button[aria-label="${{ main: 'Main', mask: 'Mask', section: 'Section' }[panel]} more tools"]`,
            )
            .click();
        }
        await target.click();
        await waitForPaint(page);
      };
      // Floating Mask actions must still reach the same ROI controller inside the shared shell.
      await page.locator('[data-action="view:mask"]').click();
      await command('mask-roi-toggle');
      assert.equal(await page.locator('#maskRoiTools').isVisible(), true);
      await page.locator('[data-action="mask-roi-tool:square"]').click();
      const maskBox = await page.locator('#maskCanvas').boundingBox();
      await page.mouse.move(maskBox.x + maskBox.width * 0.3, maskBox.y + maskBox.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(maskBox.x + maskBox.width * 0.6, maskBox.y + maskBox.height * 0.6, {
        steps: 8,
      });
      await page.mouse.up();
      await command('mask-roi-settings');
      await page.locator('#maskRoiSize').fill('8');
      await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
      assert.equal((await snapshot()).maskRoi.size, 8);
      assert.deepEqual((await snapshot()).roi, initial.roi);
      await page.locator('#clearMaskRoiBtn').click();
      await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
      await page.locator('[data-action="view:main"]').click();
      // Slice input uses the Main controller; inspect the real Section's reslice after changing A/B.
      await command('roi');
      await command('slice-coordinates');
      await page.locator('#sectionAx').fill('0');
      await page.locator('#sectionAx').press('Tab');
      await page.locator('#sectionAy').fill('-5');
      await page.locator('#sectionAy').press('Tab');
      await page.locator('#sectionBx').fill('20');
      await page.locator('#sectionBx').press('Tab');
      await page.locator('#sectionBy').fill('5');
      await page.locator('#sectionBy').press('Tab');
      const edited = await snapshot();
      assert.deepEqual(edited.section, { a: [0, -5], b: [20, 5] });
      assert.deepEqual(edited.planViews.mask, initial.planViews.mask);
      await page.locator('#mainSliceSettings button[aria-label="Close Section line"]').click();
      if (width <= 820) await page.locator('[data-action="mobile-section"]').click();
      else await command('maximize:section');
      await waitForPaint(page);
      const sectionCanvas = page.locator('#sectionCanvas');
      assert.ok(Number(await sectionCanvas.getAttribute('data-x-px-per-um')) > 0);
      const span = Number(
        (await page.locator('[data-slot="view.section.readout"]').innerText()).split(' ')[0],
      );
      assert.ok(
        Math.abs(span - Math.hypot(20, 10)) < 0.0001,
        'Real Section compositor must use the edited physical A–B span',
      );
      assert.ok(
        Math.abs(Number(await sectionCanvas.getAttribute('data-section-viewport-zoom')) - 1) < 1e-9,
      );
      const fingerprint = () => sectionCanvas.evaluate((c) => c.toDataURL());
      const slicedImage = await fingerprint();
      await command('zbreak-settings');
      // The visual geometry of the ruler is an acceptance contract. A custom
      // class must preserve the shared wc-button base; otherwise both handles
      // become normal-flow buttons at the top, despite passing state tests.
      const layout = await page.evaluate(() => {
        const ruler = document.getElementById('sectionCollapseRuler');
        const upper = document.getElementById('sectionCollapseTopHandle');
        const lower = document.getElementById('sectionCollapseBottomHandle');
        const canvas = document.getElementById('sectionCanvas');
        const rulerBox = ruler.getBoundingClientRect();
        const upperBox = upper.getBoundingClientRect();
        const lowerBox = lower.getBoundingClientRect();
        const lo = Number(canvas.dataset.zMinUm);
        const hi = Number(canvas.dataset.zMaxUm);
        const upperZ = Number(upper.getAttribute('aria-valuenow'));
        const lowerZ = Number(lower.getAttribute('aria-valuenow'));
        return {
          upperAbsolute: getComputedStyle(upper).position === 'absolute',
          lowerAbsolute: getComputedStyle(lower).position === 'absolute',
          rulerHeight: rulerBox.height,
          upperY: upperBox.top + upperBox.height / 2 - rulerBox.top,
          lowerY: lowerBox.top + lowerBox.height / 2 - rulerBox.top,
          expectedUpperY: ((hi - upperZ) / (hi - lo)) * rulerBox.height,
          expectedLowerY: ((hi - lowerZ) / (hi - lo)) * rulerBox.height,
          hatch: getComputedStyle(document.getElementById('sectionCollapseWindow'))
            .backgroundImage,
        };
      });
      assert.equal(layout.upperAbsolute, true, 'Upper handle must use absolute ruler positioning');
      assert.equal(layout.lowerAbsolute, true, 'Lower handle must use absolute ruler positioning');
      assert.ok(layout.rulerHeight >= 130);
      assert.ok(layout.upperY < layout.lowerY, 'Upper/Lower handle locations must be distinct');
      assert.ok(Math.abs(layout.upperY - layout.expectedUpperY) < 2, 'Upper handle Z mapping');
      assert.ok(Math.abs(layout.lowerY - layout.expectedLowerY) < 2, 'Lower handle Z mapping');
      assert.match(layout.hatch, /repeating-linear-gradient/);
      await page.screenshot({
        path: resolve(output, `section-zbreak-${width}.png`),
        fullPage: true,
      });
      await page.locator('#section-collapse-enabled').uncheck();
      const toggled = await snapshot();
      assert.equal(toggled.sectionCollapse.enabled, false);
      assert.equal(await sectionCanvas.getAttribute('data-section-collapse-enabled'), 'false');
      assert.notEqual(await fingerprint(), slicedImage);
      await page.locator('#section-collapse-enabled').check();
      const zEditor = page.locator('#sectionZSettings');
      assert.equal(await zEditor.locator('#sectionCollapseFrontScale').isVisible(), false);
      await zEditor.locator('.v2-z-advanced > summary').click();
      await page.locator('#sectionCollapseScaleLinked').uncheck();
      assert.equal(await zEditor.locator('#sectionCollapseFrontScale').isVisible(), true);
      await page.locator('#sectionCollapseFrontScale').fill('2');
      await page.locator('#sectionCollapseFrontScale').press('Tab');
      assert.equal((await snapshot()).sectionCollapse.frontScale, 2);
      await page.locator('#sectionZSettings [aria-label="Close Z Break"]').click();
      await command('tool:zoom:section');
      let box = await sectionCanvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.wheel(0, -160);
      await waitForPaint(page);
      assert.ok((await snapshot()).sectionViewport.zoom > 1);
      const beforeDragZoom = (await snapshot()).sectionViewport.zoom;
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5 - 24, { steps: 5 });
      await page.mouse.up();
      assert.equal(
        (await snapshot()).sectionViewport.zoom,
        beforeDragZoom,
        'Zoom only uses wheel/pinch',
      );
      await command('tool:pan:section');
      assert.equal(
        await page.locator('[data-action="tool:zoom:section"]').getAttribute('aria-pressed'),
        'true',
      );
      box = await sectionCanvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.3 + 24, box.y + box.height * 0.5 + 12, {
        steps: 5,
      });
      await page.mouse.up();
      await waitForPaint(page);
      assert.notEqual((await snapshot()).sectionViewport.panX, 0);
      await command('fit:section');
      assert.deepEqual((await snapshot()).sectionViewport, { zoom: 1, panX: 0, panY: 0 });
      await command('legend');
      await command('detail');
      box = await sectionCanvas.boundingBox();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.65, { steps: 8 });
      await page.mouse.up();
      await waitForPaint(page);
      const detail = await snapshot();
      assert.ok(detail.sectionDetailRoi);
      assert.deepEqual(detail.roi, initial.roi);
      assert.deepEqual(detail.maskRoi, initial.maskRoi);
      assert.equal(await page.locator('#sectionDetailInset').isVisible(), true);
      assert.ok(
        await page
          .locator('#sectionDetailInsetCanvas')
          .evaluate((c) => c.width > 100 && c.height > 100),
      );
      assert.equal((await snapshot()).sectionDetailRoi.shape, 'rect');
      assert.equal(await page.locator('#sectionDetailShapeBtn').count(), 0);
      const roiBox = await page.locator('#sectionDetailRoiOverlay').boundingBox();
      await page.mouse.move(roiBox.x + roiBox.width / 2, roiBox.y + roiBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(roiBox.x + roiBox.width / 2 + 12, roiBox.y + roiBox.height / 2 + 8, {
        steps: 5,
      });
      await page.mouse.up();
      assert.notDeepEqual((await snapshot()).sectionDetailRoi, detail.sectionDetailRoi);
      const movedRoi = (await snapshot()).sectionDetailRoi;
      // Inset starts at top-right; use the visible opposite handle on narrow screens.
      const handle = await page.locator('[data-detail-handle="nw"]').boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 - 12, handle.y + handle.height / 2 - 8, {
        steps: 5,
      });
      await page.mouse.up();
      assert.ok((await snapshot()).sectionDetailRoi.width > movedRoi.width);
      await page.screenshot({ path: resolve(output, `section-${width}.png`), fullPage: true });
      await command('detail');
      assert.equal((await snapshot()).sectionDetailRoi, null);
      await command('section-export-menu');
      assert.equal(await page.locator('.v2-section-floating button:disabled').count(), 1);
      const download = page.waitForEvent('download');
      await page.locator('[data-action="export:section:svg"]').click();
      assert.ok((await download).suggestedFilename().endsWith('.svg'));
      assert.deepEqual(
        (await snapshot()).model,
        initial.model,
        'View actions must preserve the full scientific model',
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      report.widths.push({
        width,
        sharedIdentity: true,
        realSection: true,
        sliceResliced: true,
        detailIndependent: true,
        scientificUnchanged: true,
      });
      console.log(`Section ${width}: PASS`);
    } finally {
      await context.close();
    }
  }
  const touchContext = await browser.newContext({
    viewport: { width: 1024, height: 960 },
    hasTouch: true,
  });
  try {
    const page = await touchContext.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/app.html?start=example&example=m3d`);
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    await page.locator('[data-action="maximize:section"]').click();
    const initial = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const box = await page.locator('#sectionCanvas').boundingBox(),
      x = box.x + box.width * 0.4,
      y = box.y + box.height * 0.5;
    const cdp = await touchContext.newCDPSession(page);
    const dispatch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y })),
      });
      await waitForPaint(page);
    };
    await page.locator('[data-action="tool:pan:section"]').click();
    await dispatch('touchStart', [[1, x, y]]);
    await dispatch('touchMove', [[1, x + 24, y + 16]]);
    await dispatch('touchEnd', []);
    assert.ok(
      (await page.evaluate(() => window.WaferCadV2Workstation.snapshot())).sectionViewport.panX > 0,
    );
    await page.locator('[data-action="tool:zoom:section"]').click();
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
    const after = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.ok(after.sectionViewport.zoom > 1);
    assert.deepEqual(after.model, initial.model);
    assert.deepEqual(after.planViews, initial.planViews);
    assert.deepEqual(errors, []);
    report.touch = { pan: true, pinchZoom: true, scientificUnchanged: true };
    console.log('Section touch: PASS');
  } finally {
    await touchContext.close();
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
