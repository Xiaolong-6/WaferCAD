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
  // Keep a separate model-only crop: the full-page capture is dominated by
  // History and Section panels, making the two diversion bends hard to judge.
  const manifoldDetail = await page.locator('#threeHost').screenshot({ type: 'png' });
  await writeFile(new URL('preassembly-manifold-threehost.png', directory), manifoldDetail);
  assert.deepEqual(historyErrors, [], 'Restoring a Bookmark emitted browser errors');
  report.views.preassemblyManifold = {
    viewport: [1000, 640],
    bytes: manifoldShot.length,
    detailBytes: manifoldDetail.length,
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

  // The fluid port section runs along X=30; the off-axis electrical TSVs
  // require a DIFFERENT physical plane. Restore the last full-interposer
  // Bookmark instead of representing both as one fictitious A-A cut.
  const tsvStep = page.locator('#snapshotList .history-step-wrap').filter({
    has: page.locator('.history-bookmark-row', {
      hasText: '06 Integrated GaN HEMT',
    }),
  });
  await tsvStep.first().waitFor({ state: 'attached', timeout: 120000 });
  assert.equal(await tsvStep.count(), 1, 'Full-interposer TSV Bookmark missing');
  const tsvGroup = tsvStep.locator('.history-bookmarks-group');
  if (!(await tsvGroup.evaluate((details) => details.open))) {
    await tsvGroup.locator('.history-bookmarks-summary').click();
  }
  const tsvBookmark = tsvGroup.locator('.history-bookmark-row', {
    hasText: '06 Integrated GaN HEMT',
  });
  await tsvBookmark.locator('.snapshot-more-trigger').click();
  await tsvBookmark
    .locator('.snapshot-more-popover button', { hasText: 'Restore bookmark' })
    .click();
  await page.waitForFunction(
    () => {
      const s = window.WaferCadV2Workstation?.snapshot();
      return (
        s?.roi == null &&
        s?.section?.a?.[0] === -1800 &&
        s?.section?.a?.[1] === 950 &&
        s?.section?.b?.[0] === 1800 &&
        s?.section?.b?.[1] === 950
      );
    },
    null,
    { timeout: 120000 },
  );
  const sectionButton = page.locator('[data-action="section"]').first();
  if ((await sectionButton.getAttribute('aria-pressed')) !== 'true') {
    await sectionButton.click();
  }
  await page.locator('#sectionCanvas').waitFor({ state: 'visible', timeout: 120000 });
  await waitForPaint(page);
  // Audit actual XY/Z material occupancy from the persisted browser project,
  // not only material layer names or colors. A metallic-looking cylinder can
  // still be an unfilled via; a colored pad is not an electrical net.
  const geometry = await page.evaluate(async () => {
    const { pointInMulti } = await import('./vector-geometry.js');
    const model = window.WaferCadV2Workstation.snapshot().model;
    const byName = new Map(model.layers.map((layer) => [layer.name, layer.id]));
    const names = {
      ti: 'TSV Ti conformal seed surrogate 0.2 um',
      cu: 'TSV Cu conformal seed surrogate 0.5 um',
      fill: 'TSV Cu electrofill surrogate 35 um',
      pad: 'GSG Au pads surrogate 0.5 um',
    };
    const ids = Object.fromEntries(
      Object.entries(names).map(([key, name]) => [key, byName.get(name) || null]),
    );
    function hasLayer(point, z, layerId) {
      return model.regions.some(
        (region) =>
          pointInMulti(point, region.geom) &&
          region.stack.some(
            (segment) =>
              segment.layerId === layerId && segment.z0 < z && segment.z1 > z,
          ),
      );
    }
    const viaCenters = [-1450, 1450].flatMap((x) => [-950, 950].map((y) => [x, y]));
    const viaZ = [-150, -50, 50, 150, 250, 350, 450, 550];
    const missingCuCore = viaCenters.flatMap(([x, y]) =>
      viaZ.filter((z) => !hasLayer([x, y], z, ids.fill)).map((z) => [x, y, z]),
    );
    const gsgPadCenters = [-1250, 1250].map((x) => [x, 0]);
    const missingGsgPads = gsgPadCenters.filter((xy) => !hasLayer(xy, 600.25, ids.pad));
    // These two unmetalized positions separate representative TSVs from
    // their nearby GSG pads. They demonstrate a known missing *route* without
    // pretending that a point sample proves complete electrical isolation.
    const unmodeledRoutePoints = [-1450, 1450].map((x) => [x, -500]);
    const unexpectedlyMetallizedRoutePoints = unmodeledRoutePoints.filter((xy) =>
      hasLayer(xy, 600.25, ids.pad),
    );
    return {
      materialLayerIdsFound: Object.values(ids).every(Boolean),
      viaCoreSamples: viaCenters.length * viaZ.length,
      missingCuCore,
      missingGsgPads,
      unmodeledRoutePoints,
      unexpectedlyMetallizedRoutePoints,
      missingSourceProcessMaterials: ['SiO2', 'NiPaAu'].filter(
        (name) => !model.layers.some((layer) => layer.name.includes(name)),
      ),
    };
  });
  assert.equal(geometry.materialLayerIdsFound, true, 'Loaded project lacks TSV or GSG metal');
  assert.deepEqual(geometry.missingCuCore, [], 'Browser-loaded TSV cores have real voids');
  assert.deepEqual(geometry.missingGsgPads, [], 'Browser-loaded GSG pads are absent');
  assert.deepEqual(
    geometry.unexpectedlyMetallizedRoutePoints,
    [],
    'Previously absent Au routing changed; re-audit Fig. 1(a) connectivity',
  );
  const tsvSectionShot = await page.locator('#sectionCanvas').screenshot({ type: 'png' });
  await writeFile(new URL('tsv-transverse-section.png', directory), tsvSectionShot);

  // A package-scale 409 px Section cannot resolve a 70 um TSV and its
  // 200/500 nm films. Use the actual Section pan/zoom interaction for
  // a second, explicitly magnified view, without altering physical Z.
  const sectionCanvas = page.locator('#sectionCanvas');
  const zoomControl = page.locator('[data-action="tool:zoom:section"]');
  if ((await zoomControl.getAttribute('aria-pressed')) !== 'true') {
    await zoomControl.click();
  }
  const bounds = await sectionCanvas.boundingBox();
  assert.ok(bounds, 'Missing physical Section bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.15, bounds.y + bounds.height * 0.49);
  await page.mouse.wheel(0, -900);
  await page.waitForFunction(
    () => (window.WaferCadV2Workstation?.snapshot().sectionViewport?.zoom || 1) >= 2,
    null,
    { timeout: 30000 },
  );
  await waitForPaint(page);
  const tsvDetail = await sectionCanvas.screenshot({ type: 'png' });
  await writeFile(new URL('tsv-transverse-zoomed.png', directory), tsvDetail);
  const sectionZoom = await page.evaluate(
    () => window.WaferCadV2Workstation.snapshot().sectionViewport.zoom,
  );
  report.views.tsvTransverse = {
    bytes: tsvSectionShot.length,
    detailBytes: tsvDetail.length,
    detailSectionZoom: sectionZoom,
    plane: 'Y = 950 um; X = -1800 to 1800 um',
    distinctFromCoolantSection: true,
    copperFilledGeometry: geometry.missingCuCore.length === 0,
    copperCoreOccupancySamples: geometry.viaCoreSamples,
    unmodeledAuRouteProbePoints: geometry.unmodeledRoutePoints,
    missingSourceProcessMaterials: geometry.missingSourceProcessMaterials,
    physicalSeedThicknessUm: { Ti: 0.2, Cu: 0.5 },
    inferredCuFillUm: 35,
    electricalContactContinuityVerified: false,
    paperContourParityVerified: false,
  };
  assert.deepEqual(historyErrors, [], 'TSV inspection emitted browser errors');
  await context.close();

  // pass applies strictly to rendering, saved-state restoration and sampled
  // material geometry. A nonempty screenshot does not pass the paper comparison.
  report.pass = true;
  report.passScope = 'render, bookmark restore and explicit material occupancy only';
  report.scientificFigureAcceptance = {
    status: 'open',
    reference: 'Lian et al. (2022), Fig. 1(a), Fig. 2(c-f), DOI 10.1038/s41378-022-00462-3',
    verifiedIdealizedCopperCoreSamples: geometry.viaCoreSamples,
    trueDualWaferBondModeled: false,
    completeAuNiPaAuTSVToChipRoutingModeled: false,
    oxideInsulationModeled: !geometry.missingSourceProcessMaterials.includes('SiO2'),
    electricalContinuityVerified: false,
    fig1aContourAndAppearanceVerified: false,
  };
  report.note =
    'Captured separate real coolant, TSV and HEMT views. Cu cores have actual XY/Z occupancy; sampled Au routing gaps and source-process omissions remain explicit. Browser smoke pass does not constitute Fig. 1(a) scientific visual acceptance.';
  await writeFile(
    new URL('visual-acceptance.json', directory),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
