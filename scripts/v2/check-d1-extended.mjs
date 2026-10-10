// M3 D1 extended real-interaction gate (separate from the already passing core gate).
// This script deliberately fails loudly on Mask ROI/Section/portal regressions.
// It does not authorize a visual baseline, hardware GPU claim or D2 migration.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint, chooseConfirmation } from '../test-helpers/ui.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const site = resolve(repo, 'site');
const fixtures = {
  m3d: 'm3d-selfpowered-heterogeneous-ic',
  photodetector: 'photodetector-literature',
};
const fixture = process.env.WAFERCAD_D1_FIXTURE || '';
assert.ok(!fixture || fixtures[fixture], 'Known extended real-view fixture');
const output = resolve(repo, `test-results/ui-v2-d1-extended${fixture ? `-${fixture}` : ''}`);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const evidence = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  fixture: fixture || 'Base',
  widths: [],
  errors: [],
  result: 'running',
  scope:
    'Mask ROI actual drag, Section detail pixel alignment, Z Break Escape/focus and original owner identity',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/build-info.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ commit: evidence.sha }));
    }
    const filename = resolve(site, `.${decodeURIComponent(url.pathname)}`);
    if (!filename.startsWith(`${site}${sep}`)) return res.writeHead(403).end();
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});

let browser;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
try {
  browser = await launchBrowser();
  evidence.chromium = browser.version();
  const { context, page } = await newUiPage(browser);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    page.on('pageerror', (error) => evidence.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') evidence.errors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${base}/app-v2-real.html`);
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' || document.body.dataset.ready === 'error',
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator('body').getAttribute('data-ready'),
      'true',
      'Real v2 app must bootstrap',
    );

    if (fixture) {
      const filename = `${fixtures[fixture]}.wafercad`;
      await page
        .locator('#openProjectInput')
        .setInputFiles(resolve(site, 'examples/previews', filename));
      await chooseConfirmation(page);
      await page.waitForFunction(
        (name) => document.getElementById('statusText').textContent === `Opened ${name}.`,
        filename,
        { timeout: 120000 },
      );
    }
    await page.waitForFunction(
      () =>
        document.querySelector('#threeHost canvas') &&
        document.querySelector('#threeHost').dataset.renderPhase === 'complete',
      null,
      { timeout: 120000 },
    );

    // Store the actual objects so a seemingly identical replacement still fails identity.
    await page.evaluate(() => {
      window.d1ExtendedTrace = [];
      for (const type of ['click', 'toggle'])
        document.addEventListener(
          type,
          (event) => {
            if (!event.target.closest?.('.view-panel')) return;
            window.d1ExtendedTrace.push({
              type,
              width: innerWidth,
              target: event.target.id || event.target.className,
              open: event.target.open,
              editor: document.getElementById('maskRoiEditor').open,
            });
            if (window.d1ExtendedTrace.length > 60) window.d1ExtendedTrace.shift();
          },
          true,
        );
      window.d1ExtendedOwners = new Map([
        ...['main', 'mask', 'three', 'section'].map((name) => [
          `view.${name}.stage`,
          window.WaferCadV2RealBridge.getSlot(`view.${name}.stage`),
        ]),
        ['maskRoiEditor', document.getElementById('maskRoiEditor')],
        ['sectionCollapseEditor', document.getElementById('sectionCollapseEditor')],
        ['sectionDetailRoiOverlay', document.getElementById('sectionDetailRoiOverlay')],
      ]);
      if ([...window.d1ExtendedOwners.values()].some((node) => !node))
        throw Error('Missing real native ROI/Section owner');
    });

    async function clickControl(panel, selector) {
      await waitForPaint(page);
      const item = page.locator(selector);
      if (!(await item.isVisible())) {
        const more = page.locator(`${panel} .view-more-control > summary`);
        if (!(await more.isVisible())) throw Error(`Control is not visible: ${selector}`);
        await more.click();
        await waitForPaint(page);
      }
      await item.click();
      await waitForPaint(page);
    }

    async function drag(canvas, sx, sy, ex, ey) {
      const bounds = await page.locator(canvas).boundingBox();
      assert.ok(bounds && bounds.width > 100 && bounds.height > 100, `${canvas} must be visible`);
      const from = { x: bounds.x + sx * bounds.width, y: bounds.y + sy * bounds.height };
      const to = { x: bounds.x + ex * bounds.width, y: bounds.y + ey * bounds.height };
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, from);
      assert.equal(hit, canvas.slice(1), `Real pointer must hit ${canvas}`);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      return { bounds, from, to };
    }

    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.locator('[data-action="view:mask"]').click();
      await waitForPaint(page);
      await clickControl('#maskPanel', '#maskZoomFit');
      await clickControl('#maskPanel', '#maskRoiEditor > summary');
      await page.waitForFunction(() => document.getElementById('maskRoiEditor').open);
      await page.locator('#maskRoiEditor .mask-roi-tool[data-tool="rect"]').click();
      await page.waitForFunction(() => !document.querySelector('#maskPanel details[open]'));
      await waitForPaint(page);
      const maskDrag = await drag('#maskCanvas', 0.43, 0.43, 0.56, 0.53);
      await page.waitForFunction(() =>
        document.getElementById('statusText').textContent.startsWith('Mask ROI created.'),
      );
      const mask = await page.evaluate(() => ({
        sizeUm: Number(document.getElementById('maskRoiSize').value),
        unit: document.getElementById('maskRoiUnitLabel').textContent,
        sizeFieldHidden: document.getElementById('maskRoiFields').hidden,
      }));
      assert.equal(mask.unit, 'µm', 'Mask ROI physical storage remains micrometres');
      assert.ok(mask.sizeUm > 0 && !mask.sizeFieldHidden, 'Real Mask ROI must become editable');

      // Base fit has identity mask transform and no imported layout bounds:
      // independent pixel/mm check; complex imported masks need additional transform fixtures.
      if (!fixture) {
        const base = await page.evaluate(() => ({
          widthUm: Number(document.getElementById('baseWidth').value),
          heightUm: Number(document.getElementById('baseHeight').value),
        }));
        const s = Math.min(
          (maskDrag.bounds.width - 68) / base.widthUm,
          (maskDrag.bounds.height - 68) / base.heightUm,
        );
        mask.errorPx = Math.abs(
          mask.sizeUm * s -
            Math.max(
              Math.abs(maskDrag.to.x - maskDrag.from.x),
              Math.abs(maskDrag.to.y - maskDrag.from.y),
            ),
        );
        assert.ok(
          mask.errorPx <= 0.25,
          `Mask ROI physical→pixel mismatch: ${JSON.stringify(mask)}`,
        );
      }
      await page.screenshot({ path: resolve(output, `mask-${width}.png`), fullPage: true });

      await page.locator('[data-action="view:main"]').click();
      if (width > 820) {
        // Single's dock already includes Section; toggling it here would hide it.
        await page.locator('[data-action="mode:single"]').click();
      } else {
        await page.locator('[data-action="mobile-section"]').click();
      }
      await waitForPaint(page);
      await clickControl('#sectionPanel', '#sectionDetailRoiBtn');
      const sectionDrag = await drag('#sectionCanvas', 0.36, 0.38, 0.58, 0.57);
      await page.waitForFunction(
        () =>
          !document.getElementById('sectionDetailRoiOverlay').hidden &&
          !document.getElementById('sectionDetailInset').hidden,
      );
      const section = await page.evaluate(() => {
        const canvas = document.getElementById('sectionCanvas').getBoundingClientRect();
        const overlay = document.getElementById('sectionDetailRoiOverlay').getBoundingClientRect();
        return {
          errorsPx: {
            x: Math.abs(overlay.x - (canvas.x + 0.36 * canvas.width)),
            y: Math.abs(overlay.y - (canvas.y + 0.38 * canvas.height)),
            width: Math.abs(overlay.width - 0.22 * canvas.width),
            height: Math.abs(overlay.height - 0.19 * canvas.height),
          },
          zoom: document.getElementById('sectionDetailZoom').textContent,
        };
      });
      const worstSectionError = Math.max(...Object.values(section.errorsPx));
      assert.ok(
        worstSectionError <= 0.25,
        `Real Section detail ROI DOMRect mismatch: ${JSON.stringify(section)}`,
      );
      assert.match(section.zoom, /^×/, 'Section detail inset must report magnification');

      await clickControl('#sectionPanel', '#sectionCollapseAxisBtn');
      assert.equal(
        await page.locator('#sectionCollapseEditor').evaluate((node) => node.open),
        true,
        'Z Break editor opens as the original native dialog',
      );
      const zMode = await page
        .locator('#sectionCollapseEditor')
        .evaluate((node) => (node.matches(':modal') ? 'modal' : 'inline'));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('sectionCollapseEditor').open);
      assert.equal(
        await page
          .locator('#sectionCollapseAxisBtn')
          .evaluate((node) => document.activeElement === node),
        true,
        'Escape restores Z Break trigger focus after native modal/inline dismissal',
      );
      assert.equal(
        await page
          .locator('#sectionCollapseEditor')
          .evaluate((node) => node.parentElement.id === 'sectionCollapseOverlay'),
        true,
        'Native Z Break editor is returned to its original owner',
      );
      await clickControl('#sectionPanel', '#sectionCollapseAxisBtn');
      await page.locator('#sectionCollapseClose').click();
      await page.waitForFunction(() => !document.getElementById('sectionCollapseEditor').open);
      assert.equal(
        await page.locator('#sectionCollapseEditor').evaluate((node) => node.parentElement.id),
        'sectionCollapseOverlay',
        'Explicit Close returns native owner',
      );
      assert.equal(
        await page
          .locator('#sectionCollapseAxisBtn')
          .evaluate((node) => document.activeElement === node),
        true,
        'Explicit Close restores Z Break focus',
      );
      await clickControl('#sectionPanel', '#sectionCollapseAxisBtn');
      await page.mouse.click(1, 1);
      await page.waitForFunction(() => !document.getElementById('sectionCollapseEditor').open);
      assert.equal(
        await page.locator('#sectionCollapseEditor').evaluate((node) => node.parentElement.id),
        'sectionCollapseOverlay',
        'Outside dismissal returns native owner',
      );
      // Verify independent physical Base dimensions in real Section 1:1 X:Z.
      // Scientific view inputs are the source; no image/baseline tolerance change.
      if (!fixture) {
        await clickControl('#sectionPanel', '#sectionCollapseAxisBtn');
        if (await page.locator('#sectionCollapseEnabled').isChecked())
          await page.locator('#sectionCollapseEnabled').uncheck();
        await page.locator('#sectionCollapseClose').click();
        const scaleSelect = page.locator('#sectionScaleModeBtn');
        if (!(await scaleSelect.isVisible()))
          await page.locator('#sectionPanel .view-more-control > summary').click();
        await scaleSelect.selectOption('physical');
        await waitForPaint(page);
        const physical = await page.evaluate(() => {
          const canvas = document.getElementById('sectionCanvas');
          const d = canvas.dataset;
          const input = (id) => Number(document.getElementById(id).value);
          const span = Math.hypot(
            input('sectionBx') - input('sectionAx'),
            input('sectionBy') - input('sectionAy'),
          );
          const z = Number(d.sectionZ1Um) - Number(d.sectionZ0Um);
          const rect = canvas.getBoundingClientRect();
          const scale = Math.min((rect.width - 37) / span, (rect.height - 32) / z);
          return {
            span,
            z,
            base: input('baseThickness'),
            collapsed: d.sectionCollapseEnabled,
            mode: d.scaleMode,
            errors: [
              Math.abs((Number(d.xPxPerUm) - scale) * span),
              Math.abs((Number(d.zPxPerUm) - scale) * z),
              Math.abs(Number(d.sectionPlotLeft) - (27 + (rect.width - 37 - span * scale) / 2)),
              Math.abs(Number(d.sectionFrameTop) - (10 + (rect.height - 32 - z * scale) / 2)),
            ],
          };
        });
        assert.equal(physical.mode, 'physical');
        assert.equal(physical.collapsed, 'false');
        assert.ok(
          physical.z >= physical.base,
          'Physical Base stack must span its specified thickness',
        );
        assert.ok(
          Math.max(...physical.errors) <= 0.25,
          `Independent Section physical projection mismatch: ${JSON.stringify(physical)}`,
        );
        section.physical = physical;
      }
      const owners = await page.evaluate(() => {
        for (const [key, original] of window.d1ExtendedOwners) {
          const current = key.startsWith('view.')
            ? window.WaferCadV2RealBridge.getSlot(key)
            : document.getElementById(key);
          if (current !== original || !current.isConnected)
            throw Error(`D1 owner replaced: ${key}`);
        }
        const all = [...document.querySelectorAll('[id]')].map((node) => node.id);
        if (new Set(all).size !== all.length) throw Error('Duplicate IDs');
        return window.d1ExtendedOwners.size;
      });
      evidence.widths.push({
        width,
        mask,
        maskDrag,
        sectionDrag,
        section,
        worstSectionError,
        zMode,
        owners,
        overflow: await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - innerWidth),
        ),
      });
      assert.equal(evidence.widths.at(-1).overflow, 0);
      await page.screenshot({ path: resolve(output, `section-${width}.png`), fullPage: true });
      await page.locator('#sectionDetailCloseBtn').click();
      // D1 real Section Fit/Pan/Zoom: assert transformed physical raster metrics,
      // the original scientific canvas, and a final full-view fit. Not CSS zoom.
      const sectionMore = page.locator('#sectionPanel .view-more-control');
      if (await sectionMore.evaluate((node) => node.open))
        await sectionMore.locator(':scope > summary').click();
      const measureSection = () => page.evaluate(() => {
        const c = document.getElementById('sectionCanvas');
        const d = c.dataset;
        return {
          x: Number(d.sectionPlotLeft), y: Number(d.sectionFrameTop),
          sx: Number(d.xPxPerUm), sz: Number(d.zPxPerUm),
          zoom: Number(d.sectionViewportZoom),
          panX: Number(d.sectionViewportPanX), panY: Number(d.sectionViewportPanY),
          owner: window.WaferCadV2RealBridge.getSlot('view.section.stage') === c,
          physical: [document.getElementById('sectionAx').value,
            document.getElementById('sectionAy').value,
            document.getElementById('sectionBx').value,
            document.getElementById('sectionBy').value],
        };
      });
      await clickControl('#sectionPanel', '[data-action="v2-section-fit"]');
      const fitBefore = await measureSection();
      assert.equal(fitBefore.zoom, 1);
      await clickControl('#sectionPanel', '[data-action="v2-section-pan"]');
      const panDrag = await drag('#sectionCanvas', 0.4, 0.4, 0.5, 0.5);
      const fitAfterPan = await measureSection();
      const dx = panDrag.to.x - panDrag.from.x, dy = panDrag.to.y - panDrag.from.y;
      assert.ok(Math.abs(fitAfterPan.x - fitBefore.x - dx) <= 0.25);
      assert.ok(Math.abs(fitAfterPan.y - fitBefore.y - dy) <= 0.25);
      assert.ok(Math.abs(fitAfterPan.sx - fitBefore.sx) <= 1e-9);
      assert.ok(Math.abs(fitAfterPan.sz - fitBefore.sz) <= 1e-9);
      await clickControl('#sectionPanel', '[data-action="v2-section-zoom"]');
      const zoomDrag = await drag('#sectionCanvas', 0.4, 0.4, 0.4, 0.32);
      const fitAfterZoom = await measureSection();
      const zoomRatio = Math.exp((zoomDrag.from.y - zoomDrag.to.y) * 0.009);
      assert.ok(Math.abs(fitAfterZoom.zoom - zoomRatio) <= 1e-9);
      assert.ok(Math.abs(fitAfterZoom.sx / fitAfterPan.sx - zoomRatio) <= 1e-9);
      assert.ok(Math.abs(fitAfterZoom.sz / fitAfterPan.sz - zoomRatio) <= 1e-9);
      assert.deepEqual(fitAfterZoom.physical, fitBefore.physical);
      assert.equal(fitAfterZoom.owner, true);
      await clickControl('#sectionPanel', '[data-action="v2-section-zoom"]');
      await clickControl('#sectionPanel', '[data-action="v2-section-fit"]');
      const fitRestored = await measureSection();
      assert.equal(fitRestored.zoom, 1);
      assert.equal(fitRestored.panX, 0);
      assert.equal(fitRestored.panY, 0);
      evidence.widths.at(-1).sectionGesture = { fitBefore, fitAfterPan, fitAfterZoom, fitRestored };
    }

    // A maximized desktop Section must exercise the inline path as well as
    // the short-dock modal path above; keep the same editor object in both.
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.locator('[data-action="view:main"]').click();
    await page.locator('[data-action="mode:single"]').click();
    await clickControl('#sectionPanel', '#sectionMaxBtn');
    await clickControl('#sectionPanel', '#sectionCollapseAxisBtn');
    assert.equal(
      await page.locator('#sectionCollapseEditor').evaluate((node) => node.matches(':modal')),
      false,
      'Tall desktop Section uses original inline dialog',
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sectionCollapseEditor').open);
    assert.equal(
      await page
        .locator('#sectionCollapseAxisBtn')
        .evaluate((node) => document.activeElement === node),
      true,
      'Inline Escape restores native trigger focus',
    );
    assert.equal(
      await page
        .locator('#sectionCollapseEditor')
        .evaluate(
          (node) =>
            node === window.d1ExtendedOwners.get('sectionCollapseEditor') &&
            node.parentElement.id === 'sectionCollapseOverlay',
        ),
      true,
    );
    evidence.inlineDialog = 'original editor retained; Escape/focus pass';
    // Shared native overlay owner: a view change dismisses its old More
    // without cloning controls or leaving an invisible menu intercepting input.
    assert.equal(
      await page.evaluate(() => typeof window.WaferCadV2ActiveOverlays?.adoptNativeViews),
      'function',
    );
    await page.locator('[data-action="view:main"]').click();
    await page.locator('#mainPanel .view-more-control > summary').click();
    assert.equal(await page.locator('#mainPanel .view-more-control').evaluate((d) => d.open), true);
    await page.locator('[data-action="view:mask"]').click();
    await page.waitForFunction(() => !document.querySelector('#mainPanel .view-more-control').open);
    assert.equal(await page.locator('#mainPanel .view-more-control').evaluate((d) => d.open), false);
    await page.locator('#maskPanel .view-more-control > summary').click();
    assert.equal(await page.locator('#maskPanel .view-more-control').evaluate((d) => d.open), true);
    await page.locator('[data-action="view:main"]').click();
    await page.waitForFunction(() => !document.querySelector('#maskPanel .view-more-control').open);
    evidence.nativeOverlayViewChange = 'native Main/Mask owners close after host hide';
    assert.deepEqual(evidence.errors, [], 'No page/console exceptions in extended D1');
    evidence.result = 'pass';
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (evidence.result !== 'pass') {
      await page
        .screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
        .catch(() => {});
      evidence.failureState = await page
        .evaluate(() => ({
          active: document.activeElement?.id,
          trace: window.d1ExtendedTrace,
          details: [...document.querySelectorAll('.view-panel details')].map((node) => ({
            id: node.id,
            open: node.open,
            visible: node.checkVisibility(),
          })),
        }))
        .catch(() => null);
    }
    await context.close();
  }
} catch (error) {
  evidence.result = 'fail';
  evidence.failure = error.message;
  throw error;
} finally {
  await writeFile(resolve(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser?.close();
  await new Promise((done) => server.close(done));
}
