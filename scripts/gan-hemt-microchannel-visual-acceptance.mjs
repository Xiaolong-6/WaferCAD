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
  await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 120000 });
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
  // The History UI synthesizes an etch label from material and depth,
  // so the Recipe's verbose operation label is not visible on the row.
  // Identify this Step through its unique persisted inspection Bookmark.
  const step = page.locator('#snapshotList .history-step-wrap').filter({
    has: page.locator('.history-bookmark-row', {
      hasText: '01 Four-level open microchannels',
    }),
  });
  await step.first().waitFor({ state: 'attached', timeout: 120000 });
  assert.equal(await step.count(), 1, 'Manifold Bookmark is missing from the real History');
  const group = step.locator('.history-bookmarks-group');
  await group.locator('.history-bookmarks-summary').click();
  const bookmark = group.locator('.history-bookmark-row', {
    hasText: '01 Four-level open microchannels',
  });
  assert.equal(await bookmark.count(), 1, 'Pre-assembly inspection Bookmark is not listed');
  await bookmark.locator('.snapshot-more-trigger').click();
  await bookmark.locator('.snapshot-more-popover button', { hasText: 'Restore bookmark' }).click();
  // The restore callback refreshes the model and inspection view asynchronously.
  // Wait for the *physical* Bookmark state rather than merely for a ready 3D host
  // that could still describe the final assembled device.
  await page.waitForFunction(
    () => {
      const state = window.WaferCadV2Workstation?.snapshot();
      return (
        state?.roi?.a?.[0] === -500 &&
        state?.roi?.a?.[1] === -520 &&
        state?.roi?.b?.[0] === 500 &&
        state?.roi?.b?.[1] === 520 &&
        !state.model.layers.some((layer) => layer.name.startsWith('GaN HEMT SiC substrate'))
      );
    },
    null,
    { timeout: 120000 },
  );
  // The desktop dock may already show 3D; single-view controls are hidden there.
  // Never toggle an already-visible dock panel off just to satisfy this audit.
  if (!(await page.locator('#threeHost').isVisible())) {
    const single = page.locator('[data-action="view:three"]:visible');
    const dock = page.locator('[data-action="dock:view:three"]:visible');
    if (await single.count()) await single.click();
    else if (await dock.count()) await dock.click();
    else throw new Error('No accessible 3D view selector in the active workstation layout.');
  }
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
  // The source Fig. 1(a) upper HEMT is a distinct inspection problem from
  // the fluid network: use the saved device Bookmark and verify real layers.
  const hemtStep = page.locator('#snapshotList .history-step-wrap').filter({
    has: page.locator('.history-bookmark-row', {
      hasText: '05 HEMT active AlGaN/SiN',
    }),
  });
  await hemtStep.first().waitFor({ state: 'attached', timeout: 120000 });
  assert.equal(await hemtStep.count(), 1, 'HEMT device inspection Bookmark missing');
  const hemtGroup = hemtStep.locator('.history-bookmarks-group');
  await hemtGroup.locator('.history-bookmarks-summary').click();
  const hemtBookmark = hemtGroup.locator('.history-bookmark-row', {
    hasText: '05 HEMT active AlGaN/SiN',
  });
  await hemtBookmark.locator('.snapshot-more-trigger').click();
  await hemtBookmark
    .locator('.snapshot-more-popover button', { hasText: 'Restore bookmark' })
    .click();
  await page.waitForFunction(
    () => {
      const s = window.WaferCadV2Workstation?.snapshot();
      return (
        s?.section?.a?.[0] === -440 &&
        s?.section?.b?.[0] === 440 &&
        s?.model?.layers?.some((layer) => layer.name.startsWith('AlGaN barrier surrogate')) &&
        s?.model?.layers?.some((layer) => layer.name.startsWith('SiN isolation/passivation'))
      );
    },
    null,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  // Capture the physical top-device Section before reclaiming the dock.
  const hemtSectionShot = await page.locator('#sectionCanvas').screenshot({ type: 'png' });
  await writeFile(new URL('hemt-active-section.png', directory), hemtSectionShot);
  const sectionDock = page.locator('[data-action="section"]').first();
  if ((await sectionDock.getAttribute('aria-pressed')) === 'true') {
    await sectionDock.click();
  }
  await waitForPaint(page);
  const hemtShot = await page.locator('#threeHost').screenshot({ type: 'png' });
  await writeFile(new URL('hemt-active.png', directory), hemtShot);
  report.views.hemtActive = {
    viewport: [1000, 640],
    bytes: hemtShot.length,
    sectionBytes: hemtSectionShot.length,
    savedActiveSectionRestored: true,
    physicalAlGaNAndSiNPresent: true,
    screenshotScope: 'expanded 3D host',
  };
  assert.deepEqual(historyErrors, [], 'HEMT Bookmark inspection emitted browser errors');
  await context.close();

  report.pass = true;
  report.note =
    'Four final views, fluid-network Bookmark and HEMT device Bookmark have real-browser captures. Scientific image parity still needs visual review.';
  await writeFile(
    new URL('visual-acceptance.json', directory),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
