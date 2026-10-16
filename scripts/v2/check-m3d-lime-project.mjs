// Browser acceptance for the not-yet-promoted M3D-LIME local project fixture.
// Uses the production v2 Workstation and the actual Recipe worker.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { readProjectFile, PROJECT_LENGTH_QUANTUM_UM } from '../../site/project-io.js';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
import { captureVisibleThree } from './three-visibility.mjs';
import { parseGDS, flattenGDS } from '../../site/gds.js';
import { parseOAS } from '../../site/oasis.js';
await loadGeometryKernel();
const { pointInMulti } = await import('../../site/vector-geometry.js');

function assertModelPersistence(actual, expected, path = 'model') {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path}: type`);
    assert.ok(
      Math.abs(actual - expected) <= PROJECT_LENGTH_QUANTUM_UM + 1e-8,
      `${path}: numeric persistence drift ${actual} vs ${expected}`,
    );
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: array type`);
    assert.equal(actual.length, expected.length, `${path}: topology length`);
    for (let index = 0; index < expected.length; index++)
      assertModelPersistence(actual[index], expected[index], `${path}[${index}]`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${path}: object type`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}: keys`);
    for (const key of Object.keys(expected))
      assertModelPersistence(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, `${path}: canonical value`);
}

// Mask export must preserve all lithography polygons and their physical
// coordinates, not simply produce a parseable nonempty file. Rectangles may
// reverse winding or repeat closure points, so compare layer-scoped XY bounds.
function assertMaskExportTopology(actualElements, sourceElements, format) {
  function fingerprint(elements) {
    return elements
      .filter((element) => element.kind === 'polygon')
      .map((element) => {
        const points = element.points;
        assert.ok(points.length >= 4, format + ': malformed polygon');
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(
          (value) => Math.round(value * 1000),
        );
        return [element.layer, element.datatype, ...bounds].join(':');
      })
      .sort();
  }
  assert.deepEqual(
    fingerprint(actualElements),
    fingerprint(sourceElements),
    format + ': mask changed layer IDs, polygon counts, or nanometre-grid dimensions',
  );
}

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/m3d-lime/browser');
await mkdir(output, { recursive: true });
const expected = await readProjectFile(
  new Blob([await readFile('site/examples/m3d-lime-rram-cntfet.wafercad')]),
);
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const errors = [];
const browserMessages = [];
const report = { pass: false, test: 'v2 open / 3D / Run All / project roundtrip' };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (['warning', 'error'].includes(message.type())) {
    browserMessages.push(message.text());
  }
});
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  await page.locator('[data-action="domain:project"]').click();
  await page
    .locator('#openProjectInput')
    .setInputFiles('site/examples/m3d-lime-rram-cntfet.wafercad');
  const openConfirmation = page.getByRole('button', { name: 'Open project', exact: true });
  if (await openConfirmation.isVisible()) await openConfirmation.click();
  // Poll the lightweight completion status, not a multi-megabyte Workstation
  // snapshot on every animation frame while import and renderer startup run.
  await page.waitForFunction(
    () => {
      const message =
        document.querySelector('[data-slot="status.message"]')?.textContent?.trim() || '';
      return (
        /^Opened m3d-lime-rram-cntfet\.wafercad\./.test(message) || /^Open failed:/.test(message)
      );
    },
    null,
    { timeout: 120000, polling: 500 },
  );
  const importStatus = (await page.locator('[data-slot="status.message"]').textContent()).trim();
  assert.match(importStatus, /^Opened m3d-lime-rram-cntfet\.wafercad\./, importStatus);
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const initial = await snapshot();
  assert.deepEqual(initial.model, expected.model, 'v2 project import changed canonical geometry');
  assert.equal(initial.layout.combos.length, 11, 'v2 lost inferred Mask layers');
  assert.ok(initial.model.layers.some((layer) => layer.name === 'Digital Ta2O5 RSL 10nm'));
  assert.deepEqual(initial.roi, { type: 'rect', a: [-45, -35], b: [-35, -11] });
  assert.deepEqual(initial.section, { a: [-44, -24], b: [-35, -24] });
  // Save the actual paper-local Section, not just a 3D camera screenshot.
  // Its displayed Z:X scale is evidence, never a physical thickness claim.
  const sectionPanel = page.locator('#sectionPanel');
  if (!(await sectionPanel.isVisible())) await page.locator('[data-action="section"]').click();
  await waitForPaint(page);
  const sectionView = await page.locator('#sectionCanvas').evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    xPxPerUm: Number(canvas.dataset.xPxPerUm),
    zPxPerUm: Number(canvas.dataset.zPxPerUm),
  }));
  assert.ok(
    sectionView.width > 100 &&
      sectionView.height > 100 &&
      sectionView.xPxPerUm > 0 &&
      sectionView.zPxPerUm > 0,
    'Real Section must have physical X/Z scale before morphology inspection',
  );
  const sectionPng = await sectionPanel.screenshot({
    path: resolve(output, 'section-local-before-runall.png'),
    animations: 'disabled',
  });
  assert.ok(sectionPng.length > 8000, 'Local Section capture is unexpectedly small');
  report.sectionEvidence = {
    ...sectionView,
    displayZToXRatio: sectionView.zPxPerUm / sectionView.xPxPerUm,
    screenshotBytes: sectionPng.length,
  };
  // Nanometre-scale ALD films are barely visible in the 9um whole-stack view.
  // Enlarge the real Section panel before inspection, keeping Section A-B fixed.
  await page.locator('#sectionPanel [data-action="maximize:section"]').click();
  await waitForPaint(page);
  const maximizedCanvas = await page.locator('#sectionCanvas').boundingBox();
  assert.ok(
    maximizedCanvas &&
      maximizedCanvas.width > sectionView.width * 1.5 &&
      maximizedCanvas.height > sectionView.height * 1.5,
    'Maximized Section must provide a larger physical morphology inspection surface',
  );
  report.sectionEvidence.maximizedCanvas = {
    width: maximizedCanvas.width,
    height: maximizedCanvas.height,
  };
  // Capture an inspection-only zoom without altering the physical Section A-B.
  // Pan and Zoom are both enabled by default in v2. Clicking an already
  // pressed Zoom control disables wheel zoom, so only enable it when needed.
  const zoomControl = page.locator('#sectionPanel [data-action="tool:zoom:section"]');
  if ((await zoomControl.getAttribute('aria-pressed')) !== 'true') await zoomControl.click();
  assert.equal(await zoomControl.getAttribute('aria-pressed'), 'true');
  const sectionBox = await page.locator('#sectionCanvas').boundingBox();
  assert.ok(sectionBox, 'Section canvas must be measurable for zoom evidence');
  await page.mouse.move(
    sectionBox.x + sectionBox.width * 0.56,
    sectionBox.y + sectionBox.height * 0.22,
  );
  await page.mouse.wheel(0, -540);
  await waitForPaint(page);
  const magnification = await page
    .locator('#sectionCanvas')
    .evaluate((canvas) => Number(canvas.dataset.sectionViewportZoom));
  assert.ok(magnification > 1.5, 'Local Section inspection zoom did not take effect');
  const enlargedPng = await sectionPanel.screenshot({
    path: resolve(output, 'section-local-zoomed-before-runall.png'),
    animations: 'disabled',
  });
  assert.ok(enlargedPng.length > 8000, 'Magnified Section evidence is unexpectedly small');
  report.sectionEvidence.inspectionZoom = magnification;
  report.sectionEvidence.zoomedScreenshotBytes = enlargedPng.length;
  // Make distinct nano-stack inspections; the 9um overview cannot resolve
  // an 8nm switching film. Use genuine Section gestures, a physical 1:1 XZ
  // scale and no Z break. None of these actions edits the saved device.
  await page.locator('#sectionPanel [data-action="fit:section"]').click();
  const sectionCanvas = page.locator('#sectionCanvas');
  const previousScaleMode = await sectionCanvas.getAttribute('data-scale-mode');
  if (previousScaleMode !== 'physical')
    await page.locator('#sectionPanel [data-action="scale:section"]').click();
  await page.locator('#sectionPanel [data-action="zbreak-settings"]').click();
  const collapseToggle = page.locator('#section-collapse-enabled');
  const previouslyCollapsed = await collapseToggle.isChecked();
  if (previouslyCollapsed) await collapseToggle.uncheck();
  await page.locator('#sectionZSettings [aria-label="Close Z Break"]').click();
  await waitForPaint(page);
  assert.equal(await sectionCanvas.getAttribute('data-scale-mode'), 'physical');
  assert.equal(await sectionCanvas.getAttribute('data-section-collapse-enabled'), 'false');

  report.nanoSectionEvidence = [];
  for (const target of [
    {
      label: 'analog-rram',
      material: 'CIM HfAlOx RSL 8nm',
      physicalXUm: -40.7,
      inspectionMaskLayer: 12,
      inspectionEdge: 'right',
      thicknessUm: 0.008,
    },
    {
      label: 'digital-rram',
      material: 'Digital Ta2O5 RSL 10nm',
      physicalXUm: -38.5,
      inspectionMaskLayer: 19,
      inspectionEdge: 'left',
      thicknessUm: 0.01,
    },
    {
      label: 'cntfet-pd-gate-step',
      material: 'CNT drain Pd 45nm',
      physicalXUm: -39.145,
      inspectionXUm: -39.145,
      inspectionMaskLayer: 18,
      thicknessUm: 0.01125,
    },
  ]) {
    const layer = expected.model.layers.find((item) => item.name === target.material);
    assert.ok(layer, target.material + ': source layer missing');
    const region = expected.model.regions.find((item) =>
      pointInMulti([target.physicalXUm, expected.section.a[1]], item.geom),
    );
    const film = region?.stack.find((part) => part.layerId === layer.id);
    assert.ok(film, target.material + ': missing from actual Section intersection');
    const actualThicknessUm = film.z1 - film.z0;
    assert.ok(
      Math.abs(actualThicknessUm - target.thicknessUm) < 1e-9,
      target.material + ': source film thickness changed',
    );
    const physicalZUm = (film.z0 + film.z1) / 2;
    // A film-center crop yields only uniform horizontal stripes. Anchor the
    // physical 1:1 close-up to its inferred lithographic edge instead.
    const sectionYUm = expected.section.a[1];
    const sourceMask = expected.layout.elements.find((element) => {
      if (element.kind !== 'polygon') return false;
      if (element.layer !== target.inspectionMaskLayer) return false;
      const xs = element.points.map((point) => point[0]);
      const ys = element.points.map((point) => point[1]);
      return (
        Math.min(...xs) < target.physicalXUm &&
        target.physicalXUm < Math.max(...xs) &&
        Math.min(...ys) < sectionYUm &&
        sectionYUm < Math.max(...ys)
      );
    });
    assert.ok(sourceMask, target.material + ': inferred inspection mask is missing');
    const maskXs = sourceMask.points.map((point) => point[0]);
    const inspectionXUm =
      target.inspectionXUm ??
      (target.inspectionEdge === 'left' ? Math.min(...maskXs) : Math.max(...maskXs));
    // Confirm a real lateral structure change on the model, rather than
    // treating a Mask edge or a successful screenshot as morphology evidence.
    const stacksAt = (x) =>
      expected.model.regions
        .filter((item) => pointInMulti([x, sectionYUm], item.geom))
        .map((item) => JSON.stringify(item.stack));
    assert.notDeepEqual(
      stacksAt(inspectionXUm - 0.06),
      stacksAt(inspectionXUm + 0.06),
      target.material + ': no physical lateral transition at the inferred mask edge',
    );
    await page.locator('#sectionPanel [data-action="fit:section"]').click();
    await waitForPaint(page);
    const initialPosition = await sectionCanvas.evaluate(
      (canvas, { x, z, startX, spanX }) => {
        const d = canvas.dataset;
        const scaleX = Number(d.xPxPerUm);
        const scaleZ = Number(d.zPxPerUm);
        assertFinite(scaleX, scaleZ);
        return {
          x: Number(d.sectionPlotLeft) + (x - startX) * scaleX,
          y: Number(d.sectionFrameTop) + (Number(d.sectionZ1Um) - z) * scaleZ,
          width: canvas.getBoundingClientRect().width,
          height: canvas.getBoundingClientRect().height,
          spanX,
        };
        function assertFinite(sx, sz) {
          if (!(sx > 0 && sz > 0)) throw Error('Section has invalid physical axes');
        }
      },
      {
        x: inspectionXUm,
        z: physicalZUm,
        startX: expected.section.a[0],
        spanX: expected.section.b[0] - expected.section.a[0],
      },
    );
    assert.ok(
      initialPosition.x > 20 &&
        initialPosition.x < initialPosition.width - 20 &&
        initialPosition.y > 20 &&
        initialPosition.y < initialPosition.height - 20,
      target.material + ': actual physical film is outside Section canvas',
    );
    const bounds = await sectionCanvas.boundingBox();
    assert.ok(bounds, 'Nanoscale Section canvas must be visible');
    const startX = bounds.x + initialPosition.x;
    const startY = bounds.y + initialPosition.y;
    const panButton = page.locator('#sectionPanel [data-action="tool:pan:section"]');
    if ((await panButton.getAttribute('aria-pressed')) !== 'true') await panButton.click();
    const nanoZoomButton = page.locator('#sectionPanel [data-action="tool:zoom:section"]');
    if ((await nanoZoomButton.getAttribute('aria-pressed')) !== 'true')
      await nanoZoomButton.click();
    await page.mouse.move(startX, startY);
    await page.mouse.wheel(0, -2000);
    await waitForPaint(page);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + initialPosition.width / 2,
      bounds.y + initialPosition.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await waitForPaint(page);
    const evidence = await sectionCanvas.evaluate(
      (canvas, { x, z, startX }) => {
        const d = canvas.dataset;
        const xScale = Number(d.xPxPerUm);
        const zScale = Number(d.zPxPerUm);
        return {
          xPxPerUm: xScale,
          zPxPerUm: zScale,
          viewportZoom: Number(d.sectionViewportZoom),
          centerX: Number(d.sectionPlotLeft) + (x - startX) * xScale,
          centerY: Number(d.sectionFrameTop) + (Number(d.sectionZ1Um) - z) * zScale,
          width: canvas.getBoundingClientRect().width,
          height: canvas.getBoundingClientRect().height,
        };
      },
      { x: inspectionXUm, z: physicalZUm, startX: expected.section.a[0] },
    );
    assert.ok(evidence.viewportZoom >= 16, 'Nanoscale Section zoom is insufficient');
    assert.ok(
      Math.abs(evidence.xPxPerUm - evidence.zPxPerUm) < 1e-6,
      'Nanoscale evidence must use physical 1:1 XZ scale',
    );
    assert.ok(
      evidence.zPxPerUm * actualThicknessUm >= 8,
      target.material + ': thin film projects below eight pixels',
    );
    assert.ok(
      Math.abs(evidence.centerX - evidence.width / 2) < 25 &&
        Math.abs(evidence.centerY - evidence.height / 2) < 25,
      target.material + ': selected material is not centered',
    );
    const png = await sectionPanel.screenshot({
      path: resolve(output, 'section-' + target.label + '-nanoscale.png'),
      animations: 'disabled',
    });
    assert.ok(png.length > 8000, 'Nanoscale Section evidence is unexpectedly small');
    report.nanoSectionEvidence.push({
      material: target.material,
      physicalXUm: target.physicalXUm,
      inspectionXUm,
      inspectionMaskLayer: target.inspectionMaskLayer,
      physicalZUm,
      filmThicknessNm: actualThicknessUm * 1000,
      projectedFilmPixels: evidence.zPxPerUm * actualThicknessUm,
      ...evidence,
      screenshotBytes: png.length,
    });
  }
  // Mid-scale Section bridge evidence: CNTFET channel, Pd drain landing and
  // digital RRAM must appear in one physical XZ view. Original horizontal
  // alignment is inferred; this checks the committed model, not author GDS.
  const sectionY = expected.section.a[1];
  const localMask = (maskLayer) => {
    const matches = expected.layout.elements
      .filter((e) => e.kind === 'polygon' && e.layer === maskLayer)
      .map((e) => {
        const xs = e.points.map((p) => p[0]);
        const ys = e.points.map((p) => p[1]);
        return {
          left: Math.min(...xs),
          right: Math.max(...xs),
          bottom: Math.min(...ys),
          top: Math.max(...ys),
        };
      })
      .filter(
        (bounds) =>
          bounds.bottom < sectionY &&
          sectionY < bounds.top &&
          bounds.left >= expected.section.a[0] &&
          bounds.right <= expected.section.b[0],
      );
    assert.equal(matches.length, 1, 'Expected one local Mask ' + maskLayer + ' on Section');
    return matches[0];
  };
  const channelMask = localMask(16);
  const pdMask = localMask(18);
  const rramMask = localMask(19);
  const inferredGapUm = rramMask.left - channelMask.right;
  assert.ok(
    Math.abs(inferredGapUm - 0.45) < 1e-9,
    'Inferred CNT island to RRAM lateral clearance changed',
  );
  assert.ok(
    pdMask.left < channelMask.right && pdMask.right > rramMask.right,
    'Pd drain mask no longer bridges CNT island and RRAM footprint',
  );
  const regionAt = (x) =>
    expected.model.regions.find((region) => pointInMulti([x, sectionY], region.geom));
  const layerId = (name) => {
    const found = expected.model.layers.find((layer) => layer.name === name);
    assert.ok(found, 'Missing material for bridge inspection: ' + name);
    return found.id;
  };
  const channelId = layerId('CNT channel 1nm SURROGATE');
  const pdId = layerId('CNT drain Pd 45nm');
  const taOxId = layerId('Digital TaOx ORL 20nm');
  const ta2o5Id = layerId('Digital Ta2O5 RSL 10nm');
  const ptId = layerId('Digital Pt TE 10nm');
  const channelPart = regionAt((channelMask.left + channelMask.right) / 2)?.stack.find(
    (part) => part.layerId === channelId,
  );
  assert.ok(channelPart, 'CNT material absent from mid-scale Section');
  const rramX = (rramMask.left + rramMask.right) / 2;
  const rramStack = regionAt(rramX)?.stack;
  assert.ok(rramStack, 'RRAM midpoint has no model stack');
  const pdIndex = rramStack.findIndex((part) => part.layerId === pdId);
  assert.ok(pdIndex >= 0, 'RRAM does not land on CNT drain Pd');
  assert.deepEqual(
    rramStack.slice(pdIndex + 1, pdIndex + 4).map((part) => part.layerId),
    [taOxId, ta2o5Id, ptId],
    'Digital TaOx / Ta2O5 / Pt must vertically contact the Pd landing',
  );
  const pdPathIntervals = [];
  const pdPathSamples = 40;
  const startPdX = channelMask.right - 0.07;
  for (let i = 0; i < pdPathSamples; i++) {
    const x = startPdX + ((rramX - startPdX) * (i + 0.5)) / pdPathSamples;
    const pdPart = regionAt(x)?.stack.find((part) => part.layerId === pdId);
    assert.ok(pdPart, 'Pd landing physically interrupted at X=' + x.toFixed(4));
    const previous = pdPathIntervals.at(-1);
    if (previous) {
      const commonZ = Math.min(pdPart.z1, previous.z1) - Math.max(pdPart.z0, previous.z0);
      // The back gate is 26 nm tall and the nominal Pd is 45 nm: even two
      // perfect horizontal films have at most 19 nm of shared Z. Enforce a
      // physically achievable 10 nm conductive bridge (PVD 25% = 11.25 nm),
      // rather than the former impossible 25 nm assertion.
      assert.ok(
        commonZ > 0.01,
        'Pd landing needs >10nm contiguous Z overlap at X=' +
          x.toFixed(4) +
          ', observed ' +
          (commonZ * 1000).toFixed(3) +
          'nm',
      );
    }
    pdPathIntervals.push({ z0: pdPart.z0, z1: pdPart.z1 });
  }
  const inspectionXUm = (channelMask.left + rramMask.right) / 2;
  const inspectionZUm = (channelPart.z0 + rramStack[pdIndex + 3].z1) / 2;
  await page.locator('#sectionPanel [data-action="fit:section"]').click();
  await waitForPaint(page);
  const midBounds = await sectionCanvas.boundingBox();
  assert.ok(midBounds, 'Mid-scale Section canvas missing');
  const midInitial = await sectionCanvas.evaluate(
    (canvas, { x, z, startX }) => {
      const d = canvas.dataset;
      return {
        x: Number(d.sectionPlotLeft) + (x - startX) * Number(d.xPxPerUm),
        y: Number(d.sectionFrameTop) + (Number(d.sectionZ1Um) - z) * Number(d.zPxPerUm),
      };
    },
    { x: inspectionXUm, z: inspectionZUm, startX: expected.section.a[0] },
  );
  assert.ok(
    midInitial.x > 20 &&
      midInitial.x < midBounds.width - 20 &&
      midInitial.y > 20 &&
      midInitial.y < midBounds.height - 20,
    'Mid-scale CNTFET / RRAM bridge must lie inside the physical Section',
  );
  const midPanButton = page.locator('#sectionPanel [data-action="tool:pan:section"]');
  if ((await midPanButton.getAttribute('aria-pressed')) !== 'true') await midPanButton.click();
  const midZoomButton = page.locator('#sectionPanel [data-action="tool:zoom:section"]');
  if ((await midZoomButton.getAttribute('aria-pressed')) !== 'true') await midZoomButton.click();
  await page.mouse.move(midBounds.x + midInitial.x, midBounds.y + midInitial.y);
  await page.mouse.wheel(0, -150);
  await waitForPaint(page);
  const midAfterZoom = await sectionCanvas.evaluate(
    (canvas, { x, z, startX }) => {
      const d = canvas.dataset;
      return {
        x: Number(d.sectionPlotLeft) + (x - startX) * Number(d.xPxPerUm),
        y: Number(d.sectionFrameTop) + (Number(d.sectionZ1Um) - z) * Number(d.zPxPerUm),
      };
    },
    { x: inspectionXUm, z: inspectionZUm, startX: expected.section.a[0] },
  );
  await page.mouse.move(midBounds.x + midAfterZoom.x, midBounds.y + midAfterZoom.y);
  await page.mouse.down();
  await page.mouse.move(midBounds.x + midBounds.width / 2, midBounds.y + midBounds.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await waitForPaint(page);
  const midEvidence = await sectionCanvas.evaluate(
    (canvas, { x, z, startX }) => {
      const d = canvas.dataset;
      return {
        xPxPerUm: Number(d.xPxPerUm),
        zPxPerUm: Number(d.zPxPerUm),
        centerX: Number(d.sectionPlotLeft) + (x - startX) * Number(d.xPxPerUm),
        centerY: Number(d.sectionFrameTop) + (Number(d.sectionZ1Um) - z) * Number(d.zPxPerUm),
        viewportZoom: Number(d.sectionViewportZoom),
        width: canvas.getBoundingClientRect().width,
        height: canvas.getBoundingClientRect().height,
      };
    },
    { x: inspectionXUm, z: inspectionZUm, startX: expected.section.a[0] },
  );
  assert.ok(
    Math.abs(midEvidence.xPxPerUm - midEvidence.zPxPerUm) < 1e-6,
    'Mid-scale Section must use physical X:Z 1:1',
  );
  assert.ok(
    inferredGapUm * midEvidence.xPxPerUm > 20,
    'CNTFET-to-RRAM inferred gap not resolved in mid-scale image',
  );
  assert.ok(
    (rramMask.right - channelMask.left) * midEvidence.xPxPerUm < midEvidence.width - 80,
    'CNTFET channel and RRAM do not both fit in mid-scale screenshot',
  );
  assert.ok(
    Math.abs(midEvidence.centerX - midEvidence.width / 2) < 40 &&
      Math.abs(midEvidence.centerY - midEvidence.height / 2) < 40,
    'Mid-scale view does not center the physical bridge',
  );
  const midPng = await sectionPanel.screenshot({
    path: resolve(output, 'section-cntfet-digital-rram-bridge.png'),
    animations: 'disabled',
  });
  assert.ok(midPng.length > 8000, 'Mid-scale bridge Section evidence is unexpectedly small');
  report.middleSectionEvidence = {
    channelMask,
    pdMask,
    rramMask,
    inferredGapUm,
    lateralPdSamples: pdPathSamples,
    inspectionXUm,
    inspectionZUm,
    screenshotBytes: midPng.length,
    ...midEvidence,
    note: 'Physical Section of modeled Pd bridge; mask positions and electrical routing are inferred',
  };
  await page.locator('#sectionPanel [data-action="fit:section"]').click();
  await page.locator('#sectionPanel [data-action="fit:section"]').click();
  await page.locator('#sectionPanel [data-action="zbreak-settings"]').click();
  if (previouslyCollapsed) await collapseToggle.check();
  await page.locator('#sectionZSettings [aria-label="Close Z Break"]').click();
  if (previousScaleMode !== 'physical')
    await page.locator('#sectionPanel [data-action="scale:section"]').click();
  await waitForPaint(page);
  assert.deepEqual((await snapshot()).section, expected.section);

  const afterSectionInspection = await snapshot();
  assert.deepEqual(afterSectionInspection.section, expected.section);
  assert.deepEqual(
    afterSectionInspection.model,
    initial.model,
    'Maximize and zoom must not change the physical model',
  );
  await page.locator('#sectionPanel [data-action="fit:section"]').click();
  await page.locator('#sectionPanel [data-action="maximize:section"]').click();
  await waitForPaint(page);
  assert.equal((await snapshot()).ui.maximize, null, 'Section inspection must restore UI layout');

  // Desktop Overview (new native workspace) keeps multiple view panels
  // mounted; older Single/mobile layouts expose explicit view:* actions.
  // Exercise the active mode and assert a real panel instead of requiring a
  // hidden/retired navigation button after the workstation shell migration.
  async function showAndVerifyView(view) {
    const panel = page.locator('#' + view + 'Panel');
    const direct = page.locator('[data-action="view:' + view + '"]:visible');
    if (await direct.count()) {
      await direct.first().click();
    } else if (!(await panel.isVisible())) {
      const overview = page.locator('[data-action="mode:overview"]:visible');
      assert.ok(await overview.count(), 'No real Overview route to ' + view + ' panel');
      await overview.first().click();
    }
    await waitForPaint(page);
    assert.ok(await panel.isVisible(), 'Expected active ' + view + ' panel after navigation');
  }
  for (const view of ['main', 'mask', 'three']) await showAndVerifyView(view);
  await page.waitForFunction(
    () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
    null,
    { timeout: 120000 },
  );
  const visibility = await captureVisibleThree(
    page,
    resolve(output, 'three-tier-before-runall.png'),
  );
  report.coloredPixels = visibility.coloredPixels;
  // Inspection-only 3D cutaway. Hide the illustrative handle and the broad
  // dielectric blankets through the real Layers UI, never through the Kernel.
  // Restore each checkbox before continuing to Mask export / Recipe Run All.
  const beforeCutaway = await snapshot();
  const sectionWasVisible = await sectionPanel.isVisible();
  if (!sectionWasVisible) await page.locator('[data-action="section"]').click();
  await waitForPaint(page);
  const cutawayLayerIds = [
    'base',
    'layer-1',
    'layer-7',
    'layer-10',
    'layer-11',
    'layer-22',
    'layer-23',
    'layer-27',
  ];
  const checkboxFor = (id) =>
    page.locator(`#sectionPanel [data-layer-id="${id}"] input[type="checkbox"]`);
  for (const id of cutawayLayerIds) {
    const checkbox = checkboxFor(id);
    assert.equal(await checkbox.count(), 1, 'Missing real Layers UI checkbox: ' + id);
    assert.equal(await checkbox.isChecked(), true, 'Expected initially visible layer: ' + id);
    await checkbox.uncheck();
  }
  await page.locator('#threePanel [data-action="maximize:three"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost')?.dataset.renderState === 'ready' &&
      document.querySelector('.p-canvases')?.dataset.maximized === 'true',
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  // The source camera gives an almost edge-on stack. Inspect using actual
  // orbit and wheel gestures, with no changes to ROI or material geometry.
  const orbitTool = page.locator('#threePanel [data-action="tool:rotate:three"]');
  if ((await orbitTool.getAttribute('aria-pressed')) !== 'true') await orbitTool.click();
  const threeCanvas = page.locator('#threeHost canvas');
  const threeBox = await threeCanvas.boundingBox();
  assert.ok(threeBox, 'Inspection 3D canvas is missing');
  const centerX = threeBox.x + threeBox.width / 2;
  const centerY = threeBox.y + threeBox.height / 2;
  const originalCamera = (await snapshot()).threeCamera;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  // Aim at the device sidewalls: positive vertical drags flatten the camera
  // into a top-down view, obscuring the 3D morphology under inspection.
  await page.mouse.move(centerX + 145, centerY - 20, { steps: 12 });
  await page.mouse.up();
  await waitForPaint(page);
  const orbitedCamera = (await snapshot()).threeCamera;
  assert.notDeepEqual(orbitedCamera.position, originalCamera.position);
  const zoomControl3d = page.locator('#threePanel [data-action="tool:zoom:three"]');
  const zoomWasActive = (await zoomControl3d.getAttribute('aria-pressed')) === 'true';
  if (!zoomWasActive) await zoomControl3d.click();
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, -220);
  await waitForPaint(page);
  const localCamera = (await snapshot()).threeCamera;
  const cameraDistance = (value) =>
    Math.hypot(...value.position.map((coordinate, index) => coordinate - value.target[index]));
  assert.ok(cameraDistance(localCamera) < cameraDistance(orbitedCamera));
  const viewOffset = localCamera.position.map(
    (coordinate, index) => coordinate - localCamera.target[index],
  );
  const horizontalDistance = Math.hypot(viewOffset[0], viewOffset[1]);
  const horizontalViewFraction = horizontalDistance / Math.hypot(...viewOffset);
  assert.ok(
    horizontalViewFraction > 0.7 && horizontalViewFraction < 0.95,
    '3D inspection camera must be oblique, not top-down or edge-on: ' +
      horizontalViewFraction.toFixed(4),
  );
  const cutawayPath = resolve(output, 'three-device-cutaway-inspection.png');
  const cutaway = await captureVisibleThree(page, cutawayPath);
  report.threeCutawayEvidence = {
    hiddenLayers: cutawayLayerIds,
    coloredPixels: cutaway.coloredPixels,
    canvas: cutaway.canvas,
    camera: localCamera,
    horizontalViewFraction,
    note: 'Oblique inspection-only orbit and layer visibility: not a fabricated cross-section',
  };
  // A second, inspection-only image isolates the electrically relevant local
  // CNTFET / Pd landing / digital RRAM stack. Broad masks and unrelated CIM
  // films obscure the device even when the camera is correctly oblique.
  // Visibility changes are reversed before export and the Run All replay.
  const activeStackLayerIds = [
    'layer-13',
    'layer-16',
    'layer-17',
    'layer-18',
    'layer-19',
    'layer-20',
    'layer-24',
    'layer-25',
    'layer-26',
    'layer-28',
    'layer-29',
  ];
  const activeStackLayerIdSet = new Set(activeStackLayerIds);
  const activeStackHiddenLayerIds = beforeCutaway.model.layers
    .map((layer) => layer.id)
    .filter((id) => !cutawayLayerIds.includes(id) && !activeStackLayerIdSet.has(id));
  // The Layers dock is hidden while 3D is maximized. Return to the grid
  // before changing visibility, then maximize 3D for the actual screenshot.
  await page.locator('#threePanel [data-action="maximize:three"]').click();
  await waitForPaint(page);
  for (const id of activeStackHiddenLayerIds) await checkboxFor(id).uncheck();
  await page.locator('#threePanel [data-action="maximize:three"]').click();
  await page.waitForFunction(
    () =>
      document.getElementById('threeHost')?.dataset.renderState === 'ready' &&
      document.querySelector('.p-canvases')?.dataset.maximized === 'true',
    null,
    { timeout: 120000 },
  );
  await waitForPaint(page);
  const activeStack = await captureVisibleThree(
    page,
    resolve(output, 'three-device-active-stack-inspection.png'),
  );
  report.threeActiveStackEvidence = {
    visibleLayers: activeStackLayerIds,
    hiddenLayers: [...cutawayLayerIds, ...activeStackHiddenLayerIds],
    coloredPixels: activeStack.coloredPixels,
    canvas: activeStack.canvas,
    camera: (await snapshot()).threeCamera,
    horizontalViewFraction,
    note: 'Inspection-only CNTFET / Pd / digital RRAM layer isolation, not source mask fidelity',
  };
  // Inspect at two distinct distances/angles through production UI gestures.
  // The older real-view bridge can reject direct camera writes even when
  // OrbitControls are rendering normally. These are genuine user zoom/orbit
  // interactions; do not inject camera state or mutate the Process model.
  const beforeLocalCameras = await snapshot();
  report.threeLocalCameraEvidence = [];
  const zoom3d = page.locator('#threePanel [data-action="tool:zoom:three"]');
  const orbit3d = page.locator('#threePanel [data-action="tool:rotate:three"]');
  const ensureSelected = async (control) => {
    if ((await control.getAttribute('aria-pressed')) !== 'true') await control.click();
  };
  await ensureSelected(zoom3d);
  await page.mouse.move(centerX, centerY);
  // Deliberately reach a device-scale camera distance; a 130px wheel step
  // barely changed the 14um-wide field and left the entire blanket in view.
  await page.mouse.wheel(0, -1600);
  await waitForPaint(page);
  const gateStepCamera = (await snapshot()).threeCamera;
  assert.ok(
    cameraDistance(gateStepCamera) < cameraDistance(beforeLocalCameras.threeCamera) * 0.6,
    'Local Pd gate-step view must reduce camera distance by at least 40%',
  );
  const gateStep = await captureVisibleThree(page, resolve(output, 'three-local-pd-gate-step.png'));
  assert.ok(gateStep.coloredPixels > 1000, 'Local Pd gate-step frame is empty');
  report.threeLocalCameraEvidence.push({
    label: 'pd-gate-step',
    camera: gateStepCamera,
    canvas: gateStep.canvas,
    coloredPixels: gateStep.coloredPixels,
    note: 'User-gesture local view of inferred 11.25nm Pd gate-step; not a TEM fit',
  });

  await ensureSelected(orbit3d);
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 110, centerY - 35, { steps: 10 });
  await page.mouse.up();
  await waitForPaint(page);
  const bridgeOrbitCamera = (await snapshot()).threeCamera;
  assert.notDeepEqual(
    bridgeOrbitCamera.position,
    gateStepCamera.position,
    'CNTFET to RRAM inspection orbit must change the real viewing angle',
  );
  await ensureSelected(zoom3d);
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, 55);
  await waitForPaint(page);
  const bridgeCamera = (await snapshot()).threeCamera;
  assert.ok(
    cameraDistance(bridgeCamera) > cameraDistance(bridgeOrbitCamera),
    'CNTFET to RRAM view must widen after the close-up',
  );
  const bridgeFrame = await captureVisibleThree(
    page,
    resolve(output, 'three-local-cntfet-pd-rram-bridge.png'),
  );
  assert.ok(bridgeFrame.coloredPixels > 1000, 'Local CNTFET to RRAM frame is empty');
  report.threeLocalCameraEvidence.push({
    label: 'cntfet-pd-rram-bridge',
    camera: bridgeCamera,
    canvas: bridgeFrame.canvas,
    coloredPixels: bridgeFrame.coloredPixels,
    note: 'Oblique user-gesture 3D lateral view; source mask routing is inferred',
  });
  const afterLocalCameras = await snapshot();
  assert.deepEqual(
    afterLocalCameras.model.regions,
    beforeLocalCameras.model.regions,
    '3D inspection gestures mutated physical regions',
  );
  assert.deepEqual(
    afterLocalCameras.model.layers,
    beforeLocalCameras.model.layers,
    '3D inspection gestures changed visibility/material layers',
  );
  assert.deepEqual(afterLocalCameras.roi, beforeLocalCameras.roi);
  assert.deepEqual(afterLocalCameras.section, beforeLocalCameras.section);
  // The camera is display state. The existing acceptance already uses actual
  // orbit/wheel gestures; only material and ROI/Section scientific state is
  // required to roundtrip byte-for-byte.
  await page.locator('#threePanel [data-action="maximize:three"]').click();
  await waitForPaint(page);
  for (const id of activeStackHiddenLayerIds) await checkboxFor(id).check();
  await waitForPaint(page);
  if (!zoomWasActive) await zoomControl3d.click();
  for (const id of cutawayLayerIds) await checkboxFor(id).check();
  if (!sectionWasVisible) await page.locator('[data-action="section"]').click();
  await waitForPaint(page);
  const afterCutaway = await snapshot();
  assert.deepEqual(afterCutaway.model.regions, beforeCutaway.model.regions);
  assert.deepEqual(afterCutaway.model.layers, beforeCutaway.model.layers);
  assert.deepEqual(afterCutaway.roi, beforeCutaway.roi);
  assert.deepEqual(afterCutaway.section, beforeCutaway.section);
  assert.equal(afterCutaway.ui.maximize, null);
  // Model.revision counts view-only layer toggles, hence is intentionally not
  // compared. Every stored material segment and visibility flag is restored.
  // Real Mask-toolbar download, through the production export Worker. Select
  // all eleven author-unavailable *inferred* layers rather than the three
  // initially highlighted inspection layers.
  await showAndVerifyView('mask');
  const maskBefore = await snapshot();
  const exportMenu = page.locator('[data-action="mask-export-menu"]');
  if (!(await exportMenu.isVisible()))
    await page.locator('#maskPanel button[aria-label$="more tools"]').click();
  await exportMenu.click();
  const maskLayers = expected.layout.combos.map((combo) => combo.layer + '|' + combo.datatype);
  for (const format of ['gds', 'oas']) {
    const action = page.locator('[data-action="mask-export:' + format + '"]');
    if (!(await action.isVisible())) {
      if (!(await exportMenu.isVisible()))
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      await exportMenu.click();
    }
    await page.locator('#maskExportLayers').selectOption(maskLayers);
    const pendingDownload = page.waitForEvent('download', { timeout: 120000 });
    await action.click();
    const maskDownload = await pendingDownload;
    assert.equal(maskDownload.suggestedFilename(), 'wafercad-mask.' + format);
    const maskFile = resolve(output, 'full-inferred-mask.' + format);
    await maskDownload.saveAs(maskFile);
    const raw = Uint8Array.from(await readFile(maskFile)).buffer;
    const parsed = format === 'gds' ? parseGDS(raw) : await parseOAS(raw);
    const polygons = flattenGDS(parsed, parsed.root).elements;
    assertMaskExportTopology(polygons, expected.layout.elements, format.toUpperCase());
    const afterMask = await snapshot();
    assert.deepEqual(
      afterMask.model,
      maskBefore.model,
      'Mask export must not edit physical geometry',
    );
    assert.deepEqual(afterMask.maskRoi, maskBefore.maskRoi);
    assert.deepEqual(afterMask.maskTransform, maskBefore.maskTransform);
  }
  report.maskInterchange = {
    formats: ['GDSII', 'OASIS'],
    layers: 11,
    polygons: expected.layout.elements.length,
  };

  await page.locator('[data-action="domain:process"]').click();
  await page.locator('[data-action="process-mode:recipe"]').click();
  const count = expected.processRecipe.steps.length;
  assert.ok(count >= 40, 'Imported Recipe is missing process steps');
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.locator('#recipeRunAllBtn').click();
  const clear = page.getByRole('button', { name: 'Clear history', exact: true });
  if (await clear.isVisible()) await clear.click();
  await page.waitForFunction(
    () => {
      const status = document.querySelector('[data-slot="status.message"]')?.textContent || '';
      const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
      return (
        /Recipe completed:|Recipe failed|Recipe preflight failed/.test(status) ||
        /^(Completed|Failed|Stopped):/.test(summary)
      );
    },
    null,
    { timeout: 360000 },
  );
  const status = await page.locator('[data-slot="status.message"]').innerText();
  const summary = (await page.locator('#recipeRunSummary').innerText()).trim();
  assert.ok(
    /Recipe completed:/.test(status) ||
      new RegExp('^Completed: ' + count + '/' + count).test(summary),
    'Real Run All was incomplete: ' + status + '; ' + summary,
  );
  const rebuilt = await snapshot();
  assert.deepEqual(
    rebuilt.model.layers.map((layer) => layer.name),
    initial.model.layers.map((layer) => layer.name),
    'Run All produced different material layer set',
  );
  assert.equal(rebuilt.layout.combos.length, 11, 'Run All lost GDS-exportable masks');
  assert.deepEqual(rebuilt.roi, initial.roi, 'Run All lost the sample inspection ROI');
  assert.deepEqual(
    rebuilt.section,
    initial.section,
    'Recipe Rebuild Base must preserve paper-aligned Section A-B',
  );
  report.sectionPreservedByRebuildBase = true;
  await page.locator('[data-action="domain:project"]').click();
  await page.locator('#projectExportMenuBtn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('#exportProjectBtn').click({ noWaitAfter: true }),
  ]);
  const exportedPath = resolve(output, 'runall-roundtrip.wafercad');
  await download.saveAs(exportedPath);
  const reopened = await readProjectFile(new Blob([await readFile(exportedPath)]));
  assertModelPersistence(reopened.model, rebuilt.model);
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  report.pass = true;
  report.steps = count;
  report.layers = rebuilt.model.layers.length;
  report.regions = rebuilt.model.regions.length;
  console.log('M3D-LIME v2 real Run All and roundtrip PASS: ' + count + ' steps');
} catch (error) {
  report.error = error.stack || error.message;
  report.pageErrors = errors;
  report.consoleMessages = browserMessages.slice(-30);
  report.browserState = await page
    .evaluate(() => ({
      ready: document.body?.dataset.ready,
      status: document.querySelector('[data-slot="status.message"]')?.textContent?.trim(),
      projectNameInput: document.querySelector('#projectNameInput')?.value,
      taskText: document.querySelector('[data-slot="task.label"]')?.textContent?.trim(),
      visibleDialogs: [...document.querySelectorAll('[role="dialog"]')]
        .filter((element) => element.getClientRects().length)
        .map((element) => element.innerText.slice(0, 500)),
      recentBodyText: document.body?.innerText?.slice(-1500),
      workflow: window.WaferCadV2Workstation?.snapshot?.()?.workflow,
    }))
    .catch((diagnosticError) => ({ error: diagnosticError.message }));
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  console.error(report.error);
  console.error('M3D-LIME browser failure state:', JSON.stringify(report.browserState));
  console.error('M3D-LIME page errors:', JSON.stringify(errors));
  console.error('M3D-LIME console warnings:', JSON.stringify(report.consoleMessages));
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await context.close();
  await browser.close();
}
