// Independent headless screenshots from the real WaferCAD Workstation. A
// successful process replay alone does not prove that buried channels are
// visible or the initial inspection camera produces an intelligible view.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  baseUrl,
  gotoWelcome,
  installPinnedThreeRoute,
  observePageErrors,
  waitForPaint,
  canvasInkFraction,
} from './test-helpers/ui.mjs';

const id = 'gan-hemt-microchannel-2022';
const directory = new URL('../test-results/gan-microchannel/visual/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const report = { example: id, views: {}, source: 'Real WaferCAD browser rendering' };
try {
  for (const view of ['main', 'mask', 'section', 'three']) {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 640 },
      deviceScaleFactor: 1,
    });
    await installPinnedThreeRoute(context);
    const page = await context.newPage();
    const errors = observePageErrors(page);
    await page.goto(`${baseUrl}/app.html?preview=1&example=${id}&view=${view}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
      null,
      { timeout: 120000 },
    );
    const selector =
      view === 'three' ? '#threeHost' : '#' + (view === 'section' ? 'section' : view) + 'Canvas';
    await page.locator(selector).waitFor({ state: 'visible', timeout: 120000 });
    if (view === 'three') {
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
    } else {
      await page.waitForFunction(
        (id) => {
          const canvas = document.getElementById(id);
          return canvas && canvas.width > 100 && canvas.height > 100;
        },
        selector.slice(1),
        { timeout: 120000 },
      );
    }
    await waitForPaint(page);
    // An implicit Section Z-break can hide almost the entire stepped coolant
    // geometry while still producing a nonblank canvas. This is a hard view
    // contract for this microchannel example, independent of palette.
    if (view === 'section') {
      assert.equal(
        await page.locator('#sectionCanvas').getAttribute('data-section-collapse-enabled'),
        'false',
        'Default Section hid the four-level cooling channel inside a Z-break',
      );
    }
    const inkFraction = view === 'three' ? null : await canvasInkFraction(page, selector);
    if (inkFraction != null) {
      assert.ok(inkFraction > 0.003, view + ' rendered a near-empty canvas');
    }
    const screenshot = await page.screenshot({ type: 'png' });
    await writeFile(new URL(view + '.png', directory), screenshot);
    assert.deepEqual(errors, [], view + ' emitted browser errors');
    report.views[view] = {
      viewport: [1000, 640],
      bytes: screenshot.length,
      canvasInkFraction: inkFraction,
      renderState:
        view === 'three'
          ? await page.locator('#threeHost').getAttribute('data-render-state')
          : 'canvas-paint',
    };
    await context.close();
  }
  // The first scientific inspection Bookmark has its own camera/ROI/Section.
  // Capture it through the real History UI, rather than only verifying a
  // serialized state or the opaque final-device cutaway.
  const context = await browser.newContext({
    viewport: { width: 1000, height: 640 },
    deviceScaleFactor: 1,
  });
  await installPinnedThreeRoute(context);
  const page = await context.newPage();
  const historyErrors = observePageErrors(page);
  await gotoWelcome(page);
  const example = page.locator(`.welcome-example-card[data-example-id="${id}"]`);
  assert.equal(await example.count(), 1, 'GaN HEMT full-project Example missing from Welcome');
  await example.locator('.welcome-example-title-link').click();
  await page.waitForURL(/\\/app\\.html(?:\\?.*)?$/, { timeout: 120000 });
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' &&
      window.WaferCadV2Workstation?.snapshot().source.endsWith(
        '/gan-hemt-microchannel-2022.wafercad',
      ),
    null,
    { timeout: 120000 },
  );
  await page.locator('[data-action="domain:history"]').click();
  const step = page.locator('#snapshotList .history-step-wrap', {
    hasText: 'Open twin six-branch coolant diversion manifolds',
  });
  assert.equal(await step.count(), 1, 'Manifold Step is missing from the real History');
  const group = step.locator('.history-bookmarks-group');
  await group.locator('summary').click();
  const bookmark = group.locator('.history-bookmark-row', {
    hasText: '01 Four-level open microchannels',
  });
  assert.equal(await bookmark.count(), 1, 'Pre-assembly inspection Bookmark is not listed');
  await bookmark.locator('.snapshot-more-trigger').click();
  await bookmark.locator('.snapshot-more-popover button', { hasText: 'Restore bookmark' }).click();
  await page.locator('[data-action="view:three"]').click();
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  const inspection = await page.evaluate(() => {
    const state = window.WaferCadV2Workstation.snapshot();
    return {
      roi: state.roi,
      section: state.section,
      hasAttachedSiC: state.model.layers.some((layer) =>
        layer.name.startsWith('GaN HEMT SiC substrate'),
      ),
    };
  });
  assert.deepEqual(inspection.roi, { type: 'rect', a: [-500, -520], b: [500, 520] });
  assert.deepEqual(inspection.section, { a: [30, -500], b: [30, 500] });
  assert.equal(inspection.hasAttachedSiC, false, 'Pre-assembly manifold is obscured by the die');
  const manifoldShot = await page.screenshot({ type: 'png' });
  await writeFile(new URL('preassembly-manifold.png', directory), manifoldShot);
  assert.deepEqual(historyErrors, [], 'Restoring a Bookmark emitted browser errors');
  report.views.preassemblyManifold = {
    viewport: [1000, 640],
    bytes: manifoldShot.length,
    renderState: await page.locator('#threeHost').getAttribute('data-render-state'),
    savedRoiAndSectionRestored: true,
    attachedSiCPresent: false,
  };
  await context.close();

  report.pass = true;
  report.note =
    'Four final views and the first History Bookmark have real-browser captures. Source contour parity still needs a separate visual audit.';
  await writeFile(
    new URL('visual-acceptance.json', directory),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
