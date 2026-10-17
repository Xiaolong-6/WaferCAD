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
// Production desktop uses persistent four-view docking; older single-view
// controls may be absent. Never toggle OFF a view that is already visible.
async function showScientificView(page, view, { maximize = false } = {}) {
  const selector = view === 'three' ? '#threeHost' : '#sectionCanvas';
  const singleView = page.locator(`[data-action="view:${view}"]`).first();
  if (await singleView.isVisible()) {
    await singleView.click();
  } else {
    const dock = page.locator(`[data-action="dock:view:${view}"]`).first();
    if (await dock.isVisible()) {
      if (!(await page.locator(selector).isVisible())) await dock.click();
      if (maximize) {
        const layout = await page.evaluate(
          () => window.WaferCadV2Workstation?.snapshot()?.ui?.desktopLayout,
        );
        if (layout?.maximized !== view) {
          const button = page.locator(`[data-action="maximize:${view}"]`).first();
          assert.ok(await button.isVisible(), 'Visible ' + view + ' dock lacks maximize action');
          await button.click();
        }
      }
    } else if (view === 'section') {
      const sectionDock = page.locator('[data-action="section"]').first();
      assert.ok(await sectionDock.isVisible(), 'No Section view navigation is available');
      if ((await sectionDock.getAttribute('aria-pressed')) !== 'true') {
        await sectionDock.click();
      }
    } else {
      throw new Error('No visible 3D view navigation control in the current Workstation');
    }
  }
  await page.locator(selector).waitFor({ state: 'visible', timeout: 30000 });
}
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
  await showScientificView(page, 'three');
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
  // The production four-view dock may start without Section displayed.
  await showScientificView(page, 'section');
  // Capture the physical top-device Section before reclaiming the dock.
  const hemtSectionShot = await page.locator('#sectionCanvas').screenshot({ type: 'png' });
  await writeFile(new URL('hemt-active-section.png', directory), hemtSectionShot);
  const sectionDock = page.locator('[data-action="section"]').first();
  if ((await sectionDock.count()) && (await sectionDock.getAttribute('aria-pressed')) === 'true') {
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
  await showScientificView(page, 'section');
  await waitForPaint(page);
  // Audit actual XY/Z material occupancy from the persisted browser project,
  // not only material layer names or colors. A metallic-looking cylinder can
  // still be an unfilled via; a colored pad is not an electrical net.
  const geometry = await page.evaluate(async () => {
    const { pointInMulti } = await import('./vector-geometry.js');
    const model = window.WaferCadV2Workstation.snapshot().model;
    const byName = new Map(model.layers.map((layer) => [layer.name, layer.id]));
    const names = {
      oxide: 'TSV SiO2 local oxide surrogate 0.5 um (inferred)',
      globalFront: 'Interposer front exposed-surface SiO2 0.5 um (inferred)',
      globalBack: 'Interposer back exposed-surface SiO2 0.5 um (inferred)',
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
            (segment) => segment.layerId === layerId && segment.z0 < z && segment.z1 > z,
          ),
      );
    }
    const viaCenters = [-1450, 1450].flatMap((x) => [-950, 950].map((y) => [x, y]));
    const viaZ = [-150, -50, 50, 150, 250, 350, 450, 550];
    const missingDoubleSidedMetal = [
      { name: 'Interposer front Ti sputter 0.2 um', z: 600.6 },
      { name: 'Interposer back Ti sputter 0.2 um', z: -200.6 },
      { name: 'Interposer front Cu sputter 0.5 um', z: 601.0 },
      { name: 'Interposer back Cu sputter 0.5 um', z: -201.0 },
    ].filter(({ name, z }) => !hasLayer([2000, 0], z, byName.get(name)));
    const missingAuAndNiPaAu = [
      ...['front', 'back'].map((face) => ({
        name: 'Interposer ' + face + ' Au plate 0.5 um (inferred)',
        xy: [2000, 0],
        z: face === 'front' ? 601.45 : -201.45,
      })),
      ...['front', 'back'].flatMap((face) =>
        viaCenters.map((xy) => ({
          name: 'TSV ' + face + ' NiPaAu composite 0.5 um (inferred)',
          xy,
          z: face === 'front' ? 602.65 : -201.45,
        })),
      ),
    ].filter(({ name, xy, z }) => !hasLayer(xy, z, byName.get(name)));
    const missingCuCore = viaCenters.flatMap(([x, y]) =>
      viaZ.filter((z) => !hasLayer([x, y], z, ids.fill)).map((z) => [x, y, z]),
    );
    const missingLocalOxideRims = viaCenters.filter(
      ([x, y]) => !hasLayer([x + 43, y], 600.75, ids.oxide),
    );
    const exteriorOxideLocations = [
      [2000, 0],
      [2500, 1800],
      [500, 0],
      [150, 1000],
      [-400, 500],
    ];
    const missingGlobalFrontOxide = exteriorOxideLocations.filter(
      (xy) => !hasLayer(xy, 600.25, ids.globalFront),
    );
    const missingGlobalBackOxide = exteriorOxideLocations.filter(
      (xy) => !hasLayer(xy, -200.25, ids.globalBack),
    );
    const gsgPadCenters = [-1250, 1250].flatMap((x) => [-95, 0, 95].map((y) => [x, y]));
    const gsgDieId = byName.get('GSG chip substrate surrogate (100 um inferred)');
    const missingGsgPads = gsgPadCenters.filter((xy) => !hasLayer(xy, 706.95, ids.pad));
    const missingGsgDieCenters = [-1250, 1250]
      .map((x) => [x, 0])
      .filter((xy) => !hasLayer(xy, 650, gsgDieId));
    // Figure 2(f) connects the HEMT and the independently mounted GSG Pad
    // chips with Au wire bonds. TSV Cu is a separate vertical interconnection.
    // These material samples validate components, NOT a particular circuit net.
    const hasOxideLayer = model.layers.some((layer) => /SiO(?:2|₂)/i.test(layer.name));
    const hasNiPaAuLayer = model.layers.some((layer) => /NiPaAu/i.test(layer.name));
    return {
      materialLayerIdsFound: Object.values(ids).every(Boolean) && Boolean(gsgDieId),
      viaCoreSamples: viaCenters.length * viaZ.length,
      gsgGoldSamples: gsgPadCenters.length,
      missingCuCore,
      missingDoubleSidedMetal,
      missingAuAndNiPaAu,
      missingLocalOxideRims,
      missingGlobalFrontOxide,
      missingGlobalBackOxide,
      missingGsgPads,
      missingGsgDieCenters,
      sourceProcessLayersPresent: {
        siliconOxide: hasOxideLayer,
        nickelPalladiumGold: hasNiPaAuLayer,
      },
    };
  });
  assert.equal(geometry.materialLayerIdsFound, true, 'Loaded project lacks TSV or GSG metal');
  assert.deepEqual(geometry.missingCuCore, [], 'Browser-loaded TSV cores have real voids');
  assert.deepEqual(geometry.missingDoubleSidedMetal, [], 'Front/back sputtered metal missing');
  assert.deepEqual(geometry.missingAuAndNiPaAu, [], 'Missing Au or TSV NiPaAu physical material');
  assert.deepEqual(
    geometry.missingLocalOxideRims,
    [],
    'Browser-loaded TSV SiO2 rim geometry missing',
  );
  assert.deepEqual(geometry.missingGlobalFrontOxide, [], 'Full front surface SiO2 missing');
  assert.deepEqual(geometry.missingGlobalBackOxide, [], 'Full backside SiO2 missing');
  assert.deepEqual(geometry.missingGsgPads, [], 'Browser-loaded GSG gold contacts are absent');
  assert.deepEqual(
    geometry.missingGsgDieCenters,
    [],
    'Browser-loaded independent GSG substrates are absent',
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
    localizedOxideRimSamples: 4,
    gsgGoldOccupancySamples: geometry.gsgGoldSamples,
    sourceProcessLayersPresent: geometry.sourceProcessLayersPresent,
    physicalSeedThicknessUm: { Ti: 0.2, Cu: 0.5 },
    inferredCuFillUm: 35,
    electricalContactContinuityVerified: false,
    paperContourParityVerified: false,
  };
  assert.deepEqual(historyErrors, [], 'TSV inspection emitted browser errors');
  // Figure 2(e): the two distinct GSG chip solids require a package-scale
  // view. The default fluid half-cut intentionally hides these outer chips.
  const packageStep = page.locator('#snapshotList .history-step-wrap').filter({
    has: page.locator('.history-bookmark-row', {
      hasText: '07 HEMT and dual GSG die upper package inspection',
    }),
  });
  await packageStep.first().waitFor({ state: 'attached', timeout: 120000 });
  assert.equal(await packageStep.count(), 1, 'Three-chip package Bookmark missing');
  const packageGroup = packageStep.locator('.history-bookmarks-group');
  if (!(await packageGroup.evaluate((details) => details.open))) {
    await packageGroup.locator('.history-bookmarks-summary').click();
  }
  const packageBookmark = packageGroup.locator('.history-bookmark-row', {
    hasText: '07 HEMT and dual GSG die upper package inspection',
  });
  await packageBookmark.locator('.snapshot-more-trigger').click();
  await packageBookmark
    .locator('.snapshot-more-popover button', { hasText: 'Restore bookmark' })
    .click();
  await page.waitForFunction(
    () => {
      const state = window.WaferCadV2Workstation?.snapshot();
      return (
        state?.roi?.a?.[0] === -1600 &&
        state?.roi?.b?.[0] === 1600 &&
        state?.model?.layers?.some(
          (layer) => layer.name === 'GSG chip substrate surrogate (100 um inferred)',
        )
      );
    },
    null,
    { timeout: 120000 },
  );
  await showScientificView(page, 'three', { maximize: true });
  // The TSV inspection just enabled the Section dock, halving the remaining
  // 3D canvas and visually clipping the rightmost GSG die. Reclaim the dock
  // before judging the complete package footprint in the real renderer.
  const packageSectionDock = page.locator('[data-action="section"]').first();
  if (
    (await packageSectionDock.count()) &&
    (await packageSectionDock.getAttribute('aria-pressed')) === 'true'
  ) {
    await packageSectionDock.click();
  }
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  // Capture evidence BEFORE checking the assembly wire contract. Without
  // this diagnostic a failed renderer leaves only a two-minute timeout, making
  // it impossible to distinguish lost Bookmark state from a stale 3D scene.
  await waitForPaint(page);
  const inspectWireState = () =>
    page.evaluate(() => {
      const state = window.WaferCadV2Workstation?.snapshot();
      const host = document.getElementById('threeHost');
      return {
        snapshotWireCount: state?.assemblyWires?.length ?? null,
        snapshotWireIds: state?.assemblyWires?.map((wire) => wire.id) || [],
        historyNodeCount: state?.snapshotBranches?.nodes?.length ?? null,
        modelRevision: state?.model?.revision ?? null,
        roi: state?.roi,
        hostPresent: !!host,
        rendererDataset: host ? { ...host.dataset } : null,
      };
    });
  const diagnostic = await inspectWireState();
  await writeFile(
    new URL('three-chip-wire-diagnostic.json', directory),
    JSON.stringify(diagnostic, null, 2) + '\n',
  );
  const precontractShot = await page.locator('#threeHost').screenshot({ type: 'png' });
  await writeFile(new URL('three-chip-precontract.png', directory), precontractShot);
  try {
    await page.waitForFunction(
      () => {
        const dataset = document.getElementById('threeHost')?.dataset;
        // The public Workstation inspection snapshot intentionally omits
        // project-level assemblyWires. Assert the actual WebGL scene build
        // rather than a field absent from that diagnostics projection.
        return (
          dataset?.renderState === 'ready' &&
          dataset?.assemblyWireBuiltCount === '2' &&
          dataset?.assemblyWireEndcapCount === '4'
        );
      },
      null,
      { timeout: 20000 },
    );
  } catch (error) {
    throw new Error(
      'Three-chip Au wire material/renderer contract failed: ' +
        JSON.stringify({ before: diagnostic, after: await inspectWireState() }),
      { cause: error },
    );
  }
  const packageCanvas = await page.locator('#threeHost').boundingBox();
  assert.ok(
    packageCanvas && packageCanvas.height >= 340,
    'Package 3D canvas is too short for a valid package screenshot',
  );
  const threeChipShot = await page.locator('#threeHost').screenshot({ type: 'png' });
  await writeFile(new URL('three-chip-upper-package.png', directory), threeChipShot);
  report.views.threeChipUpperPackage = {
    bytes: threeChipShot.length,
    viewportPixels: [Math.round(packageCanvas.width), Math.round(packageCanvas.height)],
    bookmarkRestored: true,
    independentGsgDieBodies: 2,
    separateGsgAuContacts: 6,
    wireBondGeometryVerified: true,
    wireBondCount: 2,
    closedEndcapSurfaces: 4,
    wireBondDiameterUmInferred: 12,
  };
  // PR #229 / #250 integration: exercise actual workstation controls, not a
  // synthetic standalone renderer. The same saved package and camera must
  // survive four border/opacity presentations without rebuilding material.
  const packageBorders = page.locator('[data-action="borders:three"]:visible').first();
  const packageOpacity = page.locator('[data-action="opacity:three"]:visible').first();
  assert.ok(await packageBorders.isVisible(), 'Package 3D border control is unavailable');
  assert.ok(await packageOpacity.isVisible(), 'Package 3D opacity control is unavailable');
  const scientificState = () =>
    page.evaluate(() => {
      const state = window.WaferCadV2Workstation.snapshot();
      return {
        revision: state.model.revision,
        processRevision: state.model.processRevision,
        regionCount: state.model.regions.length,
        layerCount: state.model.layers.length,
        camera: state.threeCamera,
        roi: state.roi,
        section: state.section,
      };
    });
  const invariant = await scientificState();
  const combinations = [];
  for (const opacityValue of [1, 0.5]) {
    // Use the production opacity slider's input handler. Directly mutating
    // threeOpacity would bypass the real Workstation render transaction.
    await packageOpacity.click();
    await page.locator('#threeOpacityRange').evaluate((slider, next) => {
      slider.value = String(next);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, opacityValue);
    await page.keyboard.press('Escape');
    // Wait for the opacity render to commit before sampling the frame serial.
    // The first border state can already be selected, requiring no extra frame.
    await page.waitForFunction(
      (opacityValue) => {
        const host = document.getElementById('threeHost');
        return (
          host?.dataset.renderState === 'ready' &&
          host.dataset.sceneVariant === (opacityValue === 1 ? 'opaque' : 'transparent')
        );
      },
      opacityValue,
      { timeout: 120000 },
    );
    for (const borders of [false, true]) {
      const previousSerial = Number(
        await page.locator('#threeHost').getAttribute('data-renderer-frame-serial'),
      );
      const pressed = (await packageBorders.getAttribute('aria-pressed')) === 'true';
      const changed = pressed !== borders;
      if (changed) await packageBorders.click();
      await page.waitForFunction(
        ({ previousSerial, borders, opacityValue, changed }) => {
          const host = document.getElementById('threeHost');
          const button = document.querySelector('[data-action="borders:three"]');
          const expectedOutline = borders ? 'structural-depth' : 'off';
          return (
            host?.dataset.renderState === 'ready' &&
            Number(host.dataset.rendererFrameSerial || 0) >=
              previousSerial + (changed ? 1 : 0) &&
            host.dataset.sceneVariant === (opacityValue === 1 ? 'opaque' : 'transparent') &&
            host.dataset.outlineVisibility === expectedOutline &&
            host.dataset.assemblyWireBuiltCount === '2' &&
            host.dataset.assemblyWireEndcapCount === '4' &&
            button?.getAttribute('aria-pressed') === String(borders)
          );
        },
        { previousSerial, borders, opacityValue, changed },
        { timeout: 120000 },
      );
      await waitForPaint(page);
      assert.deepEqual(
        await scientificState(),
        invariant,
        '3D presentation controls mutated saved material/process geometry',
      );
      const filename =
        'three-chip-' +
        (opacityValue === 1 ? 'opaque' : 'transparent') +
        '-borders-' +
        (borders ? 'on' : 'off') +
        '.png';
      const screenshot = await page.locator('#threeHost').screenshot({ type: 'png' });
      await writeFile(new URL(filename, directory), screenshot);
      const diagnostic = await page.locator('#threeHost').evaluate((host) => ({
        outlineVisibility: host.dataset.outlineVisibility,
        renderState: host.dataset.renderState,
        sceneVariant: host.dataset.sceneVariant,
        frameSerial: Number(host.dataset.rendererFrameSerial),
        wireCount: Number(host.dataset.assemblyWireBuiltCount),
        endcapCount: Number(host.dataset.assemblyWireEndcapCount),
        drawTriangles: Number(host.dataset.rendererDrawTriangles),
      }));
      assert.ok(diagnostic.drawTriangles > 0, 'Package 3D rendered no physical triangles');
      combinations.push({
        filename,
        opacity: opacityValue,
        borders,
        bytes: screenshot.length,
        diagnostic,
        screenshot,
      });
    }
    const pair = combinations.slice(-2);
    assert.ok(
      !pair[0].screenshot.equals(pair[1].screenshot),
      'Border ON/OFF generated identical rendered PNGs for the same package camera',
    );
  }
  report.views.threeChipPresentationMatrix = {
    packageGeometryStable: true,
    sameCameraAndBookmark: true,
    combinations: combinations.map(({ screenshot, ...details }) => details),
  };
  assert.deepEqual(historyErrors, [], 'Three-chip presentation matrix emitted browser errors');
  assert.deepEqual(historyErrors, [], 'Three-chip Bookmark restore emitted browser errors');
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
    twoIndependentGsgDieBodiesModeled: geometry.missingGsgDieCenters.length === 0,
    hemtToGsgWireBondGeometryModeled: true,
    wireBondLoopDimensionsInferred: true,
    completeInterposerAuNiPaAuMetallizationModeled: false,
    hemtBacksideViaMetallizationModeled: false,
    sourceProcessLayersPresent: geometry.sourceProcessLayersPresent,
    doubleSidedTiCuGeometryVerified: geometry.missingDoubleSidedMetal.length === 0,
    inferredAuAndNiPaAuGeometryVerified: geometry.missingAuAndNiPaAu.length === 0,
    localizedOxideGeometryVerified: geometry.missingLocalOxideRims.length === 0,
    sampledCentralAndPeripheralFrontBackOxideVerified:
      geometry.missingGlobalFrontOxide.length === 0 && geometry.missingGlobalBackOxide.length === 0,
    frontBackExposedOxideGeometryVerified:
      geometry.missingGlobalFrontOxide.length === 0 && geometry.missingGlobalBackOxide.length === 0,
    wholeOutsideSurfaceOxideVerified: false,
    oxideInsulationScientificVerification: false,
    electricalContinuityVerified: false,
    fig1aContourAndAppearanceVerified: false,
  };
  report.note =
    'Captured separate coolant, TSV, HEMT and assembly views; physical materials and two inferred 3D Au wire tubes are checked in the real browser. Paper Fig. 2(f) wire count/net assignments, backside HEMT via metallization, dielectric isolation and complete interposer routing remain unverified. Browser geometry pass is not Fig. 1(a) paper-silhouette acceptance.';
  await writeFile(
    new URL('visual-acceptance.json', directory),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
