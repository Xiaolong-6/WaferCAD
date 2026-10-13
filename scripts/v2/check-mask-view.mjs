// Real Mask controllers + M2 reference, identical M3D file. No approved baselines are modified.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, waitForPaint } from '../test-helpers/ui.mjs';
import { checkMaskTouch } from './check-mask-touch.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-mask-review');
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
      const page = await context.newPage(),
        reference = await context.newPage(),
        errors = [];
      for (const target of [page, reference]) {
        target.on('pageerror', (error) => errors.push(error.message));
        target.on('dialog', async (dialog) => {
          errors.push(`Unexpected native dialog: ${dialog.type()}`);
          await dialog.dismiss();
        });
      }
      await reference.goto(`${base}/app-v2.html?example=m3d&domain=project&review=mask`);
      await reference.waitForFunction(() => window.WaferCadV2Shell?.ready);
      await page.goto(`${base}/app-v2-mask.html`);
      await page.waitForFunction(() => document.body.dataset.ready !== 'false', null, {
        timeout: 120000,
      });
      assert.equal(
        await page.locator('body').getAttribute('data-ready'),
        'true',
        await page.locator('#app-root').innerText(),
      );
      const snapshot = () => page.evaluate(() => window.WaferCadV2Mask.snapshot());
      const initial = await snapshot(),
        ref = await reference.evaluate(() => window.WaferCadV2Shell.snapshot());
      assert.equal(initial.hash, ref.hash);
      assert.equal(initial.source, ref.source);
      assert.deepEqual(initial.drawMask.shapes, ref.state.drawDraft);
      assert.equal(initial.caption, '2 drawn shapes · µm');
      assert.equal(
        initial.caption,
        await reference.locator('[data-slot="view.mask.readout"]').textContent(),
      );
      await page.locator('[data-action="draw-toggle"]').click();
      await reference.locator('[data-action="draw-toggle"]').click();
      await waitForPaint(page);
      await waitForPaint(reference);
      for (const [target, label] of [
        [page, 'mask'],
        [reference, 'm2'],
      ]) {
        await target.screenshot({
          path: resolve(output, `${label}-${width}-full.png`),
          fullPage: true,
        });
        await target
          .locator('#maskPanel')
          .screenshot({ path: resolve(output, `${label}-${width}.png`) });
      }
      const isolation = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((node) => node.id),
          header = document.querySelector('#maskPanel .p-view-head');
        return {
          duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
          legacyPanels: document.querySelectorAll('.view-panel').length,
          canvasCount: document.querySelectorAll('canvas').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
          headerOverflow: header.scrollWidth - header.clientWidth,
          imports: performance
            .getEntriesByType('resource')
            .map((item) => item.name)
            .filter((name) => /\/app\.(js|html)(\?|$)/.test(name)),
          strip: [...document.querySelectorAll('#maskDrawTools button')].map((node) => ({
            hint: node.getAttribute('aria-label'),
            title: node.title,
            help: node.dataset.help,
            text: node.textContent.trim(),
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
          stripOverflow:
            document.querySelector('#maskDrawTools').scrollWidth -
            document.querySelector('#maskDrawTools').clientWidth,
        };
      });
      assert.deepEqual(isolation.duplicateIds, []);
      assert.equal(isolation.legacyPanels, 0);
      assert.equal(isolation.canvasCount, 1);
      assert.equal(isolation.overflow, 0);
      assert.equal(isolation.headerOverflow, 0);
      assert.equal(isolation.stripOverflow, 0);
      assert.deepEqual(isolation.imports, []);
      assert.ok(isolation.strip.every((item) => item.help && !item.title));
      assert.deepEqual(
        isolation.strip.map((item) => item.hint),
        [
          'Select',
          'Rectangle',
          'Circle',
          'Polygon',
          'Ring',
          'Ring sector',
          'Delete selected',
          'Clear Draw shapes',
          'Draw settings',
        ],
      );
      assert.ok(
        isolation.strip.every(
          (item) => item.text === '' && item.width === 28 && item.height === 28,
        ),
      );
      assert.equal(await page.locator('[data-action="draw-delete"]').isDisabled(), true);
      assert.equal(await page.locator('[data-action="draw-settings"]').isDisabled(), true);
      const box = await page.locator('#maskCanvas').boundingBox();
      const drag = async (a, b) => {
        await page.mouse.move(...a);
        await page.mouse.down();
        await page.mouse.move(...b, { steps: 8 });
        await page.mouse.up();
        await waitForPaint(page);
      };
      const nav = [
        [box.x + box.width * 0.25, box.y + box.height * 0.7],
        [box.x + box.width * 0.25 + 24, box.y + box.height * 0.7 + 16],
      ];
      await drag(...nav);
      let current = await snapshot();
      assert.ok(Math.abs(current.plan.panX - 24) < 0.01, 'Mask pan moves 24 px in X');
      assert.ok(Math.abs(current.plan.panY - 16) < 0.01, 'Mask pan moves 16 px in Y');
      await page.locator('[data-action="tool:pan:mask"]').click();
      const beforeOff = await snapshot();
      await drag(...nav);
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.deepEqual((await snapshot()).plan, beforeOff.plan);
      await page.locator('[data-action="tool:pan:mask"]').click();
      await page.locator('[data-action="tool:zoom:mask"]').click();
      assert.equal(
        await page.locator('dialog[open], :popover-open:not([role="tooltip"])').count(),
        0,
      );
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -100);
      await waitForPaint(page);
      assert.ok((await snapshot()).plan.zoom > 1);
      await page.locator('[data-action="fit:mask"]').click();
      await page.locator('[data-action="draw-tool:select"]').click();
      const world = async (point) => {
        const view = await page.evaluate(() => window.WaferCadV2Mask.projection());
        return [box.x + view.cx + point[0] * view.s, box.y + view.cy - point[1] * view.s];
      };
      const selected = initial.drawMask.shapes[0],
        center = selected.a.map((v, i) => (v + selected.b[i]) / 2);
      await page.mouse.click(...(await world(center)));
      await page.waitForSelector('#maskDrawSettings');
      assert.equal((await snapshot()).drawUi.selected.id, selected.id);
      assert.equal(await page.locator('#maskDrawSettings').getAttribute('aria-modal'), 'false');
      assert.equal(await page.locator('#drawShapeCx').getAttribute('step'), '0.0001');
      await page.locator('#drawShapeCx').fill('9.5001');
      await page.locator('[data-action="draw-apply"]').click();
      current = await snapshot();
      const edited = current.drawMask.shapes.find((shape) => shape.id === selected.id);
      assert.ok(Math.abs((edited.a[0] + edited.b[0]) / 2 - 9.5001) < 1e-12);
      const floating = await page.locator('#maskDrawSettings').boundingBox();
      assert.ok(
        floating.x >= 7.75 &&
          floating.y >= 7.75 &&
          floating.x + floating.width <= width - 7.75 &&
          floating.y + floating.height <= 952.25,
      );
      await page.screenshot({
        path: resolve(output, `mask-settings-${width}.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#maskDrawSettings').count(), 0);
      assert.equal(await page.locator('#maskDrawTools').isVisible(), true);
      await page.locator('#maskDrawTools [data-action="draw-delete"]').click();
      assert.deepEqual(
        (await snapshot()).drawMask.shapes.map((shape) => shape.id),
        ['shape-2'],
      );
      assert.equal(await page.locator('[data-action="draw-delete"]').isDisabled(), true);
      const drawnTypes = [];
      for (const type of ['rect', 'circle', 'ring', 'ring-sector', 'polygon']) {
        await page.locator(`[data-action="draw-tool:${type}"]`).click();
        const a = await world([-12, -7]),
          b = await world([-6, -11]);
        if (type === 'polygon') {
          await page.mouse.click(...a);
          await page.mouse.click(...b);
          await page.mouse.click(...(await world([-4, -7])));
          await page.keyboard.press('Enter');
        } else await drag(a, b);
        const shape = (await snapshot()).drawMask.shapes.at(-1);
        assert.equal(shape.type, type);
        drawnTypes.push(shape.type);
        if (type === 'rect') {
          const view = await page.evaluate(() => window.WaferCadV2Mask.projection());
          assert.ok(Math.abs((shape.b[0] - shape.a[0]) * view.s - (b[0] - a[0])) <= 0.25);
        }
      }
      await page.locator('[data-action="draw-tool:polygon"]').click();
      await page.mouse.click(...(await world([-15, -4])));
      const pending = await snapshot();
      await page.locator('[data-action="draw-toggle"]').click();
      assert.equal(await page.locator('#maskDrawTools').isVisible(), true);
      const hidden = await snapshot();
      assert.equal(hidden.sourceMode, pending.sourceMode);
      assert.deepEqual(hidden.drawMask, pending.drawMask);
      assert.deepEqual(hidden.drawUi.polygonDraft, pending.drawUi.polygonDraft);
      assert.equal(hidden.drawUi.tool, 'polygon');
      await page.locator('[data-action="draw-toggle"]').click();
      assert.deepEqual((await snapshot()).drawUi.polygonDraft, pending.drawUi.polygonDraft);
      await page.locator('[data-action="mask-roi-toggle"]').click();
      assert.equal(await page.locator('#maskDrawTools').isVisible(), false);
      assert.equal(await page.locator('#maskRoiTools').isVisible(), true);
      assert.deepEqual((await snapshot()).drawUi.polygonDraft, pending.drawUi.polygonDraft);
      await page.locator('[data-action="draw-toggle"]').click();
      assert.equal(await page.locator('#maskDrawTools').isVisible(), true);
      assert.equal(await page.locator('#maskRoiTools').isVisible(), false);
      assert.equal((await snapshot()).drawOpen, true);
      assert.deepEqual((await snapshot()).drawUi.polygonDraft, pending.drawUi.polygonDraft);
      await page.keyboard.press('Escape');
      // Clear uses the real controller's existing confirmation flow.
      const beforeClear = (await snapshot()).drawMask;
      await page.locator('[data-action="draw-clear"]').click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.deepEqual((await snapshot()).drawMask, beforeClear);
      await page.locator('[data-action="mask-roi-toggle"]').click();
      assert.equal(await page.locator('#maskRoiTools').isVisible(), true);
      await page.locator('[data-action="mask-roi-tool:square"]').click();
      await drag(await world([-18, 7]), await world([-14, 3]));
      assert.equal((await snapshot()).maskRoi.type, 'square');
      await page.locator('[data-action="tool:pan:mask"]').click();
      assert.equal((await snapshot()).panEnabled, true);
      await page.locator('[data-action="mask-roi-tool:select"]').click();
      assert.equal((await snapshot()).panEnabled, false);
      await page.locator('[data-action="mask-roi-settings"]').click();
      await page.locator('#maskRoiSize').fill('4.0001');
      await page.locator('[data-action="roi-apply"]').click();
      assert.equal((await snapshot()).maskRoi.size, 4.0001);
      await page.screenshot({ path: resolve(output, `mask-roi-${width}.png`), fullPage: true });
      await page.locator('#clearMaskRoiBtn').click();
      assert.equal((await snapshot()).maskRoi, null);
      await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
      const beforeHideRoi = await snapshot();
      await page.locator('[data-action="mask-roi-toggle"]').click();
      assert.equal(await page.locator('#maskRoiTools').isVisible(), false);
      await page.locator('[data-action="mask-roi-toggle"]').click();
      assert.equal(await page.locator('#maskRoiTools').isVisible(), true);
      assert.deepEqual((await snapshot()).maskRoi, beforeHideRoi.maskRoi);
      assert.deepEqual((await snapshot()).drawMask, beforeHideRoi.drawMask);
      assert.equal((await snapshot()).sourceMode, beforeHideRoi.sourceMode);
      const sourceButton = page.locator('[data-action="mask-source"]');
      if (!(await sourceButton.isVisible()))
        await page.getByRole('button', { name: 'Mask more tools' }).click();
      await sourceButton.click();
      const beforeSource = (await snapshot()).drawMask;
      assert.equal((await snapshot()).sourceMode, 'file');
      assert.equal(
        await page.locator('[data-action="draw-toggle"]').getAttribute('aria-pressed'),
        'false',
      );
      assert.equal(await page.locator('#maskSourceSettings').count(), 0);
      assert.equal(await sourceButton.textContent(), '');
      await page.locator('[data-action="draw-toggle"]').click();
      assert.equal((await snapshot()).sourceMode, 'draw', 'Draw activates the Draw source');
      assert.deepEqual((await snapshot()).drawMask, beforeSource);
      await page.locator('[data-action="draw-toggle"]').click();
      assert.equal(
        (await snapshot()).sourceMode,
        'draw',
        'Draw remains active while its source is selected',
      );
      assert.equal(
        await page.locator('[data-action="draw-toggle"]').getAttribute('aria-pressed'),
        'true',
      );
      assert.deepEqual((await snapshot()).drawMask, beforeSource);
      const alignmentButton = page.locator('[data-action="mask-alignment-settings"]');
      if (!(await alignmentButton.isVisible()))
        await page.getByRole('button', { name: 'Mask more tools' }).click();
      await alignmentButton.click();
      await page.locator('#maskOffsetX').fill('0.0001');
      await page.locator('[data-action="alignment-apply"]').click();
      assert.equal((await snapshot()).maskTransform.x, 0.0001);
      assert.deepEqual((await snapshot()).drawMask, beforeSource);
      await page.getByRole('button', { name: 'Close Mask alignment', exact: true }).click();
      const exportButton = page.locator('[data-action="mask-export-menu"]');
      if (!(await exportButton.isVisible()))
        await page.getByRole('button', { name: 'Mask more tools' }).click();
      await exportButton.click();
      const downloads = [];
      for (const type of ['svg', 'gds', 'oas']) {
        const downloadEvent = page.waitForEvent('download');
        await page.locator(`[data-action="mask-export:${type}"]`).click();
        const download = await downloadEvent,
          bytes = await readFile(await download.path());
        assert.ok(bytes.length > 100);
        downloads.push({ type, bytes: bytes.length });
      }
      await page.keyboard.press('Escape');
      assert.equal((await snapshot()).scientificUnchanged, true);
      assert.deepEqual(errors, []);
      evidence.widths.push({
        width,
        hash: initial.hash,
        caption: initial.caption,
        isolation,
        floating,
        drawnTypes,
        downloads,
      });
      console.log(`Mask ${width}px: pass`);
    } finally {
      await context.close();
    }
  }
  evidence.touch = await checkMaskTouch(browser, base, output);
  evidence.result = 'pass';
  console.log('Mask four widths + touch: pass');
} catch (error) {
  evidence.result = 'fail';
  evidence.errors.push(error.stack);
  throw error;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(evidence, null, 2));
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Mask / M2 review</title><style>body{font:14px system-ui;margin:24px}section{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:32px}img{width:100%;border:1px solid #bbb}h2{grid-column:1/-1}</style><h1>Mask / M2 · same M3D example</h1><p>Local review artifacts, not approved baselines. Result: ${evidence.result}</p>${[1440, 1024, 768, 390].map((width) => `<section><h2>${width}px</h2><div>M2<img src="m2-${width}-full.png" alt="M2 ${width}px"></div><div>Real Mask<img src="mask-${width}-full.png" alt="Real Mask ${width}px"></div></section>`).join('')}<p><a href="report.json">Runtime evidence</a></p></html>`,
  );
}
