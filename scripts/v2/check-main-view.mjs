// Main-only runtime + approved M2 Main contract reference. Review artifacts, never approved baselines.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, observePageErrors, waitForPaint } from '../test-helpers/ui.mjs';
import { checkMainTouch } from './check-main-touch.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-main-review');
await mkdir(output, { recursive: true });
const evidence = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  widths: [],
  errors: [],
};
const browser = await launchBrowser();
try {
  evidence.browser = browser.version();
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
      acceptDownloads: true,
    });
    try {
      const reference = await context.newPage();
      const page = await context.newPage();
      evidence.errors.push(...observePageErrors(reference), ...observePageErrors(page));
      const errors = [];
      for (const target of [reference, page])
        target.on('pageerror', (error) => errors.push(error.message));
      await reference.goto(`${base}/app-v2.html?example=m3d&domain=project&review=main`);
      await reference.waitForFunction(() => window.WaferCadV2Shell?.ready);
      await page.goto(`${base}/app-v2-main.html`);
      await page.waitForFunction(() => document.body.dataset.ready !== 'false', null, {
        timeout: 120000,
      });
      assert.equal(
        await page.locator('body').getAttribute('data-ready'),
        'true',
        await page.locator('#app-root').innerText(),
      );
      const real = await page.evaluate(() => window.WaferCadV2Main.snapshot());
      const ref = await reference.evaluate(() => window.WaferCadV2Shell.snapshot());
      assert.equal(real.hash, ref.hash);
      assert.equal(real.source, ref.source);
      assert.equal(
        real.caption,
        await reference.locator('[data-slot="view.main.readout"]').textContent(),
      );
      assert.equal(real.caption, '27 layers · 551 regions · µm');
      await waitForPaint(page);
      await waitForPaint(reference);
      for (const [target, label] of [
        [reference, 'm2'],
        [page, 'main'],
      ]) {
        await target.screenshot({
          path: resolve(output, `${label}-${width}-full.png`),
          fullPage: true,
        });
        await target
          .locator('#mainPanel')
          .screenshot({ path: resolve(output, `${label}-${width}.png`) });
      }
      const values = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
        const header = document.querySelector('#mainPanel .p-view-head');
        const buttons = ['fit:main', 'tool:pan:main', 'tool:zoom:main', 'roi'];
        return {
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          legacyPanels: document.querySelectorAll('.view-panel').length,
          canvasCount: document.querySelectorAll('canvas').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
          headerOverflow: header.scrollWidth - header.clientWidth,
          labels: buttons.map((action) =>
            document.querySelector(`#mainPanel [data-action="${action}"]`).textContent.trim(),
          ),
          headerHeight: header.getBoundingClientRect().height,
          calls: performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => /\/app\.(js|html)(\?|$)/.test(name)),
        };
      });
      assert.deepEqual(values.duplicateIds, []);
      assert.equal(values.legacyPanels, 0);
      assert.equal(values.canvasCount, 1);
      assert.equal(values.overflow, 0);
      assert.equal(values.headerOverflow, 0);
      assert.deepEqual(values.labels, ['', '', '', '']);
      assert.deepEqual(values.calls, []);
      const box = await page.locator('#mainCanvas').boundingBox();
      const clickExposedCanvas = async () => {
        const position = await page.locator('#mainCanvas').evaluate((canvas) => {
          const rect = canvas.getBoundingClientRect();
          for (const [fx, fy] of [
            [0.98, 0.9],
            [0.98, 0.7],
            [0.8, 0.9],
            [0.5, 0.9],
            [0.02, 0.8],
          ]) {
            const x = rect.width * fx,
              y = rect.height * fy;
            if (document.elementFromPoint(rect.left + x, rect.top + y) === canvas) return { x, y };
          }
          throw Error('No exposed Main canvas point for the persistent-editor interaction check');
        });
        await page.locator('#mainCanvas').click({ position });
      };
      const drag = async (x1, y1, x2, y2) => {
        await page.mouse.move(x1, y1);
        await page.mouse.down();
        await page.mouse.move(x2, y2, { steps: 8 });
        await page.mouse.up();
        await waitForPaint(page);
      };
      const before = await page.evaluate(() => window.WaferCadV2Main.snapshot());
      const panButton = page.locator('[data-action="tool:pan:main"]');
      const zoomButton = page.locator('[data-action="tool:zoom:main"]');
      const dragPan = () =>
        drag(
          box.x + box.width * 0.2,
          box.y + box.height * 0.2,
          box.x + box.width * 0.2 + 24,
          box.y + box.height * 0.2 + 16,
        );
      await panButton.click();
      assert.equal(await panButton.getAttribute('aria-pressed'), 'false');
      await dragPan();
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.deepEqual(
        await page.evaluate(() => window.WaferCadV2Main.snapshot().plan),
        before.plan,
        'Unselected Pan/Zoom must not move/scale the view',
      );
      await panButton.click();
      await dragPan();
      const pan = await page.evaluate(() => window.WaferCadV2Main.snapshot().plan);
      assert.ok(Math.abs(pan.panX - before.plan.panX - 24) < 0.01, 'Pan moves 24 px in X');
      assert.ok(Math.abs(pan.panY - before.plan.panY - 16) < 0.01, 'Pan moves 16 px in Y');
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.deepEqual(
        await page.evaluate(() => window.WaferCadV2Main.snapshot().plan),
        pan,
        'Pan alone must not enable wheel zoom',
      );
      await zoomButton.click();
      assert.equal(await panButton.getAttribute('aria-pressed'), 'true');
      assert.equal(await zoomButton.getAttribute('aria-pressed'), 'true');
      assert.equal(
        await page.locator('dialog[open], :popover-open').count(),
        0,
        'Zoom must not open a popup',
      );
      await dragPan();
      const both = await page.evaluate(() => window.WaferCadV2Main.snapshot().plan);
      assert.ok(Math.abs(both.panX - pan.panX - 24) < 0.01, 'Combined pan moves 24 px in X');
      assert.ok(Math.abs(both.panY - pan.panY - 16) < 0.01, 'Combined pan moves 16 px in Y');
      assert.equal(both.zoom, pan.zoom, 'Left drag pans without zooming');
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      const wheelZoom = await page.evaluate(() => window.WaferCadV2Main.snapshot().plan.zoom);
      assert.ok(wheelZoom > both.zoom);
      await panButton.click();
      assert.equal(
        await zoomButton.getAttribute('aria-pressed'),
        'true',
        'Turning off Pan must retain Zoom',
      );
      const zoomOnly = await page.evaluate(() => window.WaferCadV2Main.snapshot().plan);
      await dragPan();
      assert.deepEqual(
        await page.evaluate(() => window.WaferCadV2Main.snapshot().plan),
        zoomOnly,
        'Zoom alone must not respond to left dragging',
      );
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.ok(
        (await page.evaluate(() => window.WaferCadV2Main.snapshot().plan.zoom)) > wheelZoom,
      );
      await zoomButton.click();
      const zoomOff = await page.evaluate(() => window.WaferCadV2Main.snapshot().plan);
      await dragPan();
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.deepEqual(await page.evaluate(() => window.WaferCadV2Main.snapshot().plan), zoomOff);
      await page.locator('[data-action="fit:main"]').click();
      assert.deepEqual(await page.evaluate(() => window.WaferCadV2Main.snapshot().plan), {
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      const roiButton = page.locator('[data-action="roi"]');
      assert.equal(await page.locator('#mainRoiTools').isVisible(), false);
      await roiButton.click();
      assert.equal(await roiButton.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#mainRoiTools').isVisible(), true);
      const floating = await page.locator('#mainRoiTools button').evaluateAll((nodes) =>
        nodes.map((node) => ({
          label: node.getAttribute('aria-label'),
          text: node.textContent.trim(),
          title: node.title,
          help: node.dataset.help,
        })),
      );
      assert.deepEqual(
        floating.map((item) => item.label),
        ['Select', 'Slice', 'Slice settings', 'Rectangle', 'Square', 'Sector', 'ROI settings'],
      );
      assert.ok(floating.every((item) => item.text === '' && item.help && !item.title));
      assert.equal(await page.locator('#mainRoiTools .p-mask-tool-divider').count(), 2);
      assert.equal(
        await page
          .locator(
            '#mainPanel .p-view-head [data-action="settings:main"], #mainPanel .p-view-head [data-action="slice-coordinates"]',
          )
          .count(),
        0,
      );
      assert.equal(
        await page.locator('#mainPanel .p-view-head [data-action="export-menu"]').count(),
        1,
      );
      await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
      const projection = await page.evaluate(() => window.WaferCadV2Main.projection());
      const dx = Math.round(box.width * 0.2),
        dy = Math.round(box.height * 0.15);
      const x = Math.round(box.x + box.width * 0.3),
        y = Math.round(box.y + box.height * 0.2);
      await drag(x, y, x + dx, y + dy);
      const roi = await page.evaluate(() => window.WaferCadV2Main.snapshot().roi);
      assert.equal(roi.type, 'rect');
      const widthDelta = Math.abs((roi.b[0] - roi.a[0]) * projection.s - dx);
      const heightDelta = Math.abs((roi.b[1] - roi.a[1]) * projection.s - dy);
      assert.ok(
        widthDelta <= 0.25 && heightDelta <= 0.25,
        'Independent 0.25px Main ROI round-trip',
      );
      const more = page.locator('#mainPanel button[aria-label="Main more tools"]');
      const command = async (action) => {
        if (action === 'export:main:svg') await command('export-menu');
        const button = page.locator(`[data-action="${action}"]`);
        const overflow = !(await button.isVisible());
        if (overflow) await more.click();
        await button.click();
        return overflow ? more : button;
      };
      const owner = await command('settings:main');
      await page.locator('#mainRoiSettings').waitFor();
      assert.equal(await page.locator('#mainRoiSettings').getAttribute('aria-modal'), 'false');
      await clickExposedCanvas();
      assert.equal(await page.locator('#mainRoiSettings').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mainRoiSettings').count(), 0);
      assert.equal(await owner.evaluate((node) => document.activeElement === node), true);
      await command('settings:main');
      await page.locator('[data-action="clear-roi"]').click();
      assert.equal(await page.evaluate(() => window.WaferCadV2Main.snapshot().roi), null);
      assert.equal(await page.locator('#mainRoiSettings').count(), 0);
      if (width === 1440) {
        for (const [shape, label] of [
          ['square', 'Square'],
          ['sector', 'Sector'],
        ]) {
          await page.getByRole('button', { name: label, exact: true }).click();
          await drag(x, y, x + dx, y);
          assert.equal(
            await page.evaluate(() => window.WaferCadV2Main.snapshot().roi.type),
            shape === 'square' ? 'rect' : shape,
          );
          if (shape === 'square') {
            const square = await page.evaluate(() => window.WaferCadV2Main.snapshot().roi);
            assert.ok(Math.abs(square.b[0] - square.a[0] - (square.b[1] - square.a[1])) <= 1e-12);
          }
          await command('settings:main');
          await page.locator('#roiAnchorSelect').selectOption('top-left');
          await page.locator(shape === 'square' ? '#roiWidth' : '#roiRadius').fill('4');
          await page.getByRole('button', { name: 'Apply', exact: true }).click();
          const edited = await page.evaluate(() => window.WaferCadV2Main.snapshot().roi);
          if (shape === 'square') {
            assert.equal(edited.b[0] - edited.a[0], 4);
            assert.equal(edited.b[1] - edited.a[1], 4);
          } else assert.equal(edited.r, 4);
          assert.equal(await page.locator('#mainRoiSettings').isVisible(), true);
          const download = page.waitForEvent('download');
          await command('export:main:svg');
          assert.match((await download).suggestedFilename(), /\.svg$/);
          await page.keyboard.press('Escape');
          await command('settings:main');
          assert.equal(await page.locator('#roiAnchorSelect').inputValue(), 'top-left');
          await page.locator('[data-action="clear-roi"]').click();
        }
      }
      await page.getByRole('button', { name: 'Slice', exact: true }).click();
      await drag(x, y, x + dx, y + dy);
      assert.equal(await page.evaluate(() => window.WaferCadV2Main.snapshot().tool), 'select');
      assert.equal(await page.locator('#mainRoiTools').isVisible(), true);
      await command('slice-coordinates');
      assert.equal(await page.locator('#mainSliceSettings').getAttribute('aria-modal'), 'false');
      assert.equal(await page.locator('#sectionAx').getAttribute('step'), '0.0001');
      await page.locator('#sectionAx').fill('3.00014');
      await page.locator('#sectionAx').press('Tab');
      assert.equal(
        await page.evaluate(() => window.WaferCadV2Main.snapshot().section.a[0]),
        3.0001,
      );
      await page.keyboard.press('Escape');
      const endpoint = page.locator('[data-endpoint="a"]');
      const handle = await endpoint.boundingBox();
      assert.ok(Math.abs(handle.width - handle.height) <= 0.25, 'Slice endpoint stays circular');
      const currentProjection = await page.evaluate(() => window.WaferCadV2Main.projection());
      const section = await page.evaluate(() => window.WaferCadV2Main.snapshot().section);
      assert.ok(
        Math.abs(
          handle.x +
            handle.width / 2 -
            (box.x + currentProjection.cx + section.a[0] * currentProjection.s),
        ) <= 0.25,
      );
      assert.ok(
        Math.abs(
          handle.y +
            handle.height / 2 -
            (box.y + currentProjection.cy - section.a[1] * currentProjection.s),
        ) <= 0.25,
      );
      await drag(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
        handle.x + handle.width / 2 + 10,
        handle.y + handle.height / 2,
      );
      assert.ok(
        (await page.evaluate(() => window.WaferCadV2Main.snapshot().section.a[0])) > section.a[0],
      );
      assert.equal(
        await page.locator('#mainRoiTools').isVisible(),
        true,
        'ROI tools stay open after canvas edits',
      );
      await page.screenshot({ path: resolve(output, `main-tools-${width}.png`), fullPage: true });
      await command('settings:main');
      await command('slice-coordinates');
      assert.equal(await page.locator('.v2-main-floating').count(), 2);
      await clickExposedCanvas();
      assert.equal(await page.locator('.v2-main-floating').count(), 2);
      const floatingBoxes = await page.locator('.v2-main-floating').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
          };
        }),
      );
      assert.ok(
        floatingBoxes.every(
          (rect) =>
            rect.left >= 8 &&
            rect.right <= rect.width - 8 &&
            rect.top >= 8 &&
            rect.bottom <= rect.height - 8,
        ),
      );
      const header = await page.locator('#mainRoiSettings > header').boundingBox();
      await drag(header.x + 20, header.y + 16, header.x + 30, header.y + 24);
      assert.equal(await page.locator('#mainRoiSettings').isVisible(), true);
      await page.screenshot({
        path: resolve(output, `main-floating-${width}.png`),
        fullPage: true,
      });
      await roiButton.click();
      assert.equal(await page.locator('.v2-main-floating').count(), 0);
      assert.equal(await page.locator('#mainRoiTools').isVisible(), false);
      assert.equal(await roiButton.getAttribute('aria-pressed'), 'false');
      await page.locator('[data-action="maximize:main"]').click();
      await page.locator('[data-action="maximize:main"]').click();
      assert.equal(await page.locator('#mainCanvas').count(), 1);
      assert.equal(
        await page.evaluate(() => window.WaferCadV2Main.snapshot().scientificUnchanged),
        true,
      );
      assert.deepEqual(errors, []);
      evidence.widths.push({
        width,
        ...values,
        roiWidthPixelDelta: widthDelta,
        roiHeightPixelDelta: heightDelta,
        pan,
        scientificUnchanged: true,
        source: real.source,
        hash: real.hash,
      });
    } finally {
      await context.close();
    }
  }
  evidence.touch = await checkMainTouch(browser, base, output);
  evidence.result = 'pass';
} catch (error) {
  evidence.result = 'fail';
  evidence.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(evidence, null, 2));
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Main / M2 review</title><style>body{font:14px system-ui}section{display:flex;gap:12px}figure{margin:0;width:50%}img{width:100%}</style><h1>M3D: M2 reference / real Main</h1>${[1440, 1024, 768, 390].map((width) => `<h2>${width}px</h2><section><figure><figcaption>M2 reference</figcaption><a href="m2-${width}-full.png"><img src="m2-${width}.png"></a></figure><figure><figcaption>Real Main</figcaption><a href="main-${width}-full.png"><img src="main-${width}.png"></a></figure></section>`).join('')}`,
  );
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}
