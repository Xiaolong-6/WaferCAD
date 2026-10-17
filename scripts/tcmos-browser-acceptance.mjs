// Browser acceptance of a generated, unbundled T-CMOS candidate in the real v2 Workstation.
// Generates evidence without silently publishing the candidate as a Welcome Example.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { readProjectFile } from '../site/project-io.js';
import { assertSameMaterialGeometry } from './magic1000-geometry-comparison.mjs';

await loadGeometryKernel();
const { implantSolids, annotationInspectionCutSegments } =
  await import('../site/model-view-geometry.js');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const dir = resolve('test-results/tcmos');
const candidate = resolve(dir, 'tcmos-ternary-inverter-130nm.wafercad');
const expected = await readProjectFile(new Blob([await readFile(candidate)]));
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const panel = async (key) => {
  if (!(await page.locator(`.p-nav [data-action="domain:${key}"]`).isVisible())) {
    await page.locator('[data-action="show-editor"]').click();
  }
  await page.locator(`.p-nav [data-action="domain:${key}"]`).click();
  await waitForPaint(page);
};
// Current desktop UI can switch among Overview / Main / Mask / 3D / Section
// directly; earlier shells use view:* actions and an independent Section dock.
// Use actual visible navigation controls, never synthetic state changes.
const selectView = async (key) => {
  const desktop = page.locator(`[data-action="dock:view:${key}"]:visible`).first();
  const legacy = page.locator(`[data-action="view:${key}"]:visible`).first();
  if (await desktop.count()) {
    if ((await desktop.getAttribute('aria-pressed')) !== 'true') await desktop.click();
  } else if (await legacy.count()) {
    await legacy.click();
  } else {
    const label = key === 'three' ? '3D' : 'Main';
    await page.getByRole('button', { name: label, exact: true }).first().click();
  }
  await waitForPaint(page);
};
const revealSectionDock = async () => {
  const dock = page.locator('#sectionPanel');
  const desktop = page.locator('[data-action="dock:view:section"]:visible').first();
  if (await desktop.count()) {
    if ((await desktop.getAttribute('aria-pressed')) !== 'true') await desktop.click();
  } else if (!(await dock.isVisible())) {
    const oldDock = page.locator('[data-action="section"]:visible');
    if (await oldDock.count()) {
      await oldDock.first().click();
    } else {
      await page.getByRole('button', { name: 'Section', exact: true }).first().click();
    }
  }
  await dock.waitFor({ state: 'visible', timeout: 12000 });
  await waitForPaint(page);
};
const requireLargeView = async (kind) => {
  const panel = page.locator('#' + kind + 'Panel');
  await panel.waitFor({ state: 'visible', timeout: 12000 });
  let bounds = await panel.boundingBox();
  let expanded = false;
  if (!bounds || bounds.width <= 700 || bounds.height <= 500) {
    const maximize = page.locator(`[data-action="maximize:${kind}"]:visible`).first();
    await maximize.click();
    expanded = true;
    await waitForPaint(page);
    bounds = await panel.boundingBox();
  }
  assert.ok(
    bounds && bounds.width > 700 && bounds.height > 500,
    `Full-stage ${kind} panel bounds: ${JSON.stringify(bounds)}`,
  );
  await waitForPaint(page);
  return expanded;
};
const restoreLargeView = async (kind, expanded) => {
  if (!expanded) return;
  await page.locator(`[data-action="maximize:${kind}"]:visible`).first().click();
  await waitForPaint(page);
};
const exportProject = async () => {
  await panel('project');
  await page.locator('#projectExportMenuBtn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('#exportProjectBtn').click({ timeout: 120000 }),
  ]);
  const path = resolve(dir, 'tcmos-v2-browser-export.wafercad');
  await download.saveAs(path);
  return readProjectFile(new Blob([await readFile(path)]));
};
const report = { result: 'in_progress', expectedSteps: expected.processRecipe.steps.length };
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await panel('project');
  await page.locator('#openProjectInput').setInputFiles(candidate);
  const openConfirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await openConfirm.isVisible()) await openConfirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    expected.name,
    { timeout: 120000 },
  );
  const opened = await snap();
  await page.waitForFunction(
    () => document.querySelector('#mainCoords')?.textContent?.trim() === '14 × 8 µm',
    null,
    { timeout: 30000 },
  );
  assert.equal(
    opened.model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible,
    false,
    'The first-open preview must reveal the gate and contacts by hiding ILD',
  );
  assert.equal(opened.model.implants[0].depthStart, 0.08);
  assert.equal(opened.model.implants[1].depthStart, 0.08);
  assert.equal(opened.model.layers.length, expected.model.layers.length);
  assert.equal(
    expected.snapshotBranches.branches.length,
    2,
    'Both CMOS process Variants must be stored',
  );
  assert.equal(opened.model.dopantRegions.length, expected.model.dopantRegions.length);
  await page.screenshot({ path: resolve(dir, 'tcmos-v2-before-runall.png') });
  await panel('history');
  const referenceVariant = page.locator(
    '.history-variant[data-variant-id="conventional-cmos"] > .history-variant-head .history-variant-name',
  );
  await referenceVariant.waitFor({ state: 'visible', timeout: 30000 });
  await referenceVariant.click();
  await page.waitForFunction(
    () => {
      const snap = window.WaferCadV2Workstation.snapshot();
      return (
        snap.model.implants[0]?.name?.includes('LVTN') &&
        document.querySelector('.history-variant[data-variant-id="conventional-cmos"]')?.dataset
          .active === 'true' &&
        !snap.workflow.busy
      );
    },
    null,
    { timeout: 120000 },
  );
  const referenceState = await snap();
  assert.equal(
    referenceState.model.dopantRegions.some((d) => d.role === 'body'),
    false,
  );
  assert.equal(
    expected.snapshotBranches.branches.find((variant) => variant.id === 'conventional-cmos')
      .headState.processRecipe.steps.length,
    expected.processRecipe.steps.length,
    'The conventional Variant stores a complete replayable Recipe',
  );
  await page.screenshot({ path: resolve(dir, 'tcmos-conventional-cmos-variant.png') });
  await page
    .locator(
      '.history-variant[data-variant-id="main"] > .history-variant-head .history-variant-name',
    )
    .click();
  await page.waitForFunction(
    () => {
      const snap = window.WaferCadV2Workstation.snapshot();
      return (
        document.querySelector('.history-variant[data-variant-id="main"]')?.dataset.active ===
          'true' &&
        snap.model.implants[0]?.name?.includes('HVTN') &&
        !snap.workflow.busy
      );
    },
    null,
    { timeout: 120000 },
  );

  // SVG-authoritative File Mask: exactly eight visible/exportable layers.
  // Legacy NWELL/PWELL/S-D/silicide masks are process-only; they must not
  // leak into the user's approved Mask or binary GDS/OAS exports.
  await panel('mask');
  await selectView('mask');
  const maskLarge = await requireLargeView('mask');
  const visibleMask = await snap();
  assert.equal(visibleMask.layout.combos.length, 8);
  assert.equal(visibleMask.layout.elements.length, 232);
  await page.locator('#maskCanvas').waitFor({ state: 'visible', timeout: 12000 });
  await page.screenshot({ path: resolve(dir, 'tcmos-svg-mask-expanded-before-replay.png') });
  await restoreLargeView('mask', maskLarge);
  const maskLayerBoxes = page.locator('#v2-maskLayerList input[type="checkbox"]');
  assert.equal(await maskLayerBoxes.count(), expected.layout.combos.length);
  for (let index = 0; index < expected.layout.combos.length; index++) {
    // The v2 Mask list rebuilds its checkbox nodes after each change.
    // Trigger the real DOM click synchronously to avoid Playwright waiting
    // for a detached element while its onchange handler re-renders the list.
    const changed = await page.evaluate(() => {
      const checkbox = document.querySelector(
        '#v2-maskLayerList input[type="checkbox"]:not(:checked)',
      );
      if (!checkbox) return false;
      checkbox.click();
      return true;
    });
    if (!changed) break;
  }
  assert.equal((await snap()).selectedLayerKeys.length, expected.layout.combos.length);
  // Inspect the actual exported binary Mask, not just the layout metadata.
  const { parseGDS, flattenGDS } = await import('../site/gds.js');
  const { parseOAS } = await import('../site/oasis.js');
  const menu = page.locator('[data-action="mask-export-menu"]');
  if (!(await menu.isVisible())) {
    await page.getByRole('button', { name: 'Mask more tools' }).click();
  }
  await menu.click();
  const maskExports = [];
  for (const type of ['gds', 'oas']) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator(`[data-action="mask-export:${type}"]`).click({ timeout: 120000 }),
    ]);
    const path = resolve(dir, `tcmos-v2-mask.${type}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    const parsed =
      type === 'gds'
        ? parseGDS(Uint8Array.from(bytes).buffer)
        : await parseOAS(Uint8Array.from(bytes).buffer);
    const elements = flattenGDS(parsed, parsed.root).elements;
    const expectedCounts = Object.fromEntries(
      expected.layout.combos.map((combo) => {
        const [, layer, datatype] = combo.key.split('|');
        return [layer + '/' + datatype, combo.count];
      }),
    );
    const actualCounts = {};
    for (const element of elements) {
      const key = element.layer + '/' + element.datatype;
      actualCounts[key] = (actualCounts[key] || 0) + 1;
    }
    assert.deepEqual(
      actualCounts,
      expectedCounts,
      'Exported ' + type + ' must retain every original File Mask layer and polygon',
    );
    maskExports.push({
      type,
      bytes: bytes.byteLength,
      layers: Object.keys(actualCounts).length,
      elements: elements.length,
    });
  }
  await page.keyboard.press('Escape');
  assert.deepEqual((await snap()).model, opened.model, 'Mask export mutated canonical geometry');
  // A durable, independently inspectable Mask acceptance record is written
  // BEFORE the legacy Recipe is attempted. That downstream failure cannot
  // retroactively invalidate the completed File Mask export checks.
  await writeFile(
    resolve(dir, 'svg-mask-only-acceptance.json'),
    JSON.stringify(
      {
        pass: true,
        source: 'layout-complete.svg',
        layers: expected.layout.combos.length,
        polygons: expected.layout.elements.length,
        exports: maskExports,
        downstreamRecipeValidated: false,
      },
      null,
      2,
    ),
  );

  await panel('process');
  await page.locator('[data-action="process-mode:recipe"]').click();
  const count = await page.locator('.recipe-step-row').count();
  assert.equal(count, expected.processRecipe.steps.length, 'Recipe steps not exposed in v2');
  await page.locator('#recipeRunStart').selectOption('new-base');
  await page.locator('#recipeRunAllBtn').click();
  const modal = page.getByRole('dialog');
  if (await modal.isVisible()) {
    const clear = modal.getByRole('button', { name: /Clear history|Clear/i });
    if (await clear.count()) await clear.first().click();
    else {
      const labels = await modal.locator('button').allInnerTexts();
      throw new Error('Unknown new-Base confirmation options: ' + JSON.stringify(labels));
    }
  }
  await page.waitForFunction(
    () => {
      const summary = document.querySelector('#recipeRunSummary')?.textContent || '';
      const status = document.querySelector('[data-slot="status.message"]')?.textContent || '';
      return (
        /^(Completed|Failed|Stopped):/.test(summary) ||
        /Recipe (completed|failed)|Recipe failed at Step/i.test(status)
      );
    },
    null,
    { timeout: 180000 },
  );
  const summary = await page.locator('#recipeRunSummary').innerText();
  const status = await page.locator('[data-slot="status.message"]').innerText();
  assert.ok(
    summary.startsWith(`Completed: ${count}/${count}`) || /Recipe completed:/.test(status),
    'Run All did not complete: ' + summary + ' / ' + status,
  );
  // Visibility is an inspection preference: compare complete *physical*
  // geometry with all layers temporarily treated as visible in memory.
  const physicalModel = (model) => ({
    ...model,
    layers: model.layers.map((layer) => ({ ...layer, visible: true })),
  });
  const exported = await exportProject();
  const geometry = await assertSameMaterialGeometry(
    physicalModel(expected.model),
    physicalModel(exported.model),
    { areaToleranceUm2: 2e-6 },
  );
  assert.equal(exported.model.implants.length, expected.model.implants.length);
  const dopingSignature = (model) =>
    model.dopantRegions
      .map((region) => [
        region.polarity,
        region.role,
        region.hostLayerId,
        region.depthStartUm,
        region.depthEndUm,
        region.sourceImplantId,
      ])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(
    dopingSignature(exported.model),
    dopingSignature(expected.model),
    'Run All must regenerate the same qualitative doping profile semantics',
  );
  assert.deepEqual(
    exported.model.implants.slice(0, 2).map((item) => item.depthStart),
    [0.08, 0.08],
  );
  assert.equal(exported.processRecipe.steps.length, count);
  assert.ok(exported.snapshotBranches.nodes.length >= count);
  // Verify that a real browser-local Recovery save and restore preserves the rebuilt model.
  await panel('project');
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    () =>
      /Saved .* locally/.test(
        document.querySelector('[data-slot="status.message"]')?.textContent || '',
      ),
    null,
    { timeout: 120000 },
  );
  const saved = await snap();
  assert.ok(saved.projectName, 'Save must retain a project name');
  const recovery = await page.locator('#workspaceRecoverySelect').inputValue();
  assert.ok(recovery, 'Save must write a Recovery checkpoint');
  await page.locator('#projectNameInput').fill('Temporary modified T-CMOS name');
  await page.locator('#projectNameInput').press('Tab');
  await page.locator('#workspaceRecoverySelect').selectOption(recovery);
  await page.locator('#workspaceRestoreBtn').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForFunction(
    (name) =>
      window.WaferCadV2Workstation.snapshot().projectName === name &&
      !window.WaferCadV2Workstation.snapshot().workflow.busy,
    saved.projectName,
    { timeout: 120000 },
  );
  const restored = await snap();
  assert.equal(restored.projectName, saved.projectName, 'Recovery restored the saved project name');
  assert.equal(restored.model.implants[0].depthStart, 0.08);
  assert.equal(restored.model.implants[1].depthStart, 0.08);
  await assertSameMaterialGeometry(exported.model, restored.model, { areaToleranceUm2: 2e-6 });
  await page.screenshot({ path: resolve(dir, 'tcmos-v2-replayed-raw.png') });
  // Re-open the accepted candidate for the actual user-facing first-open
  // screenshot. Recipe execution validates physics separately from view state.
  await panel('project');
  await page.locator('#openProjectInput').setInputFiles(candidate);
  const finalConfirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await finalConfirm.isVisible()) await finalConfirm.click();
  await page.waitForFunction(
    (name) => {
      const current = window.WaferCadV2Workstation.snapshot();
      return (
        current.projectName === name &&
        !current.workflow.busy &&
        current.model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible === false
      );
    },
    expected.name,
    { timeout: 120000 },
  );
  await page.screenshot({ path: resolve(dir, 'tcmos-v2-after-runall.png') });
  // Final Fig.1b acceptance uses a real, enlarged Mask canvas; the
  // committed File Mask may be compared with the author's schematic, never
  // a hand-drawn surrogate screenshot.
  await selectView('mask');
  const fullMaskExpanded = await requireLargeView('mask');
  await page.locator('#maskCanvas').waitFor({ state: 'visible', timeout: 12000 });
  await page.screenshot({ path: resolve(dir, 'tcmos-fig1b-mask-expanded.png') });
  await restoreLargeView('mask', fullMaskExpanded);
  // Expand a docked thumbnail only when required; both full-stage screenshots
  // must prove adequate physical panel bounds before acceptance.
  await revealSectionDock();
  const fullSectionExpanded = await requireLargeView('section');
  await page.screenshot({ path: resolve(dir, 'tcmos-fig1a-section-expanded.png') });
  await restoreLargeView('section', fullSectionExpanded);
  await selectView('three');
  const fullThreeExpanded = await requireLargeView('three');
  await page.screenshot({ path: resolve(dir, 'tcmos-fig1a-three-expanded.png') });
  await restoreLargeView('three', fullThreeExpanded);

  // An pixel-measured schematic POLY stripe in a reported 130 nm foundry node needs a device-scale inspection
  // separate from the 11 µm field section. Use the real Main Slice settings
  // rather than modifying the project model or fabricating additional masks.
  const localSections = [
    { device: 'pmos-HVTN', gateX: -3, ax: -3.65, bx: -2.35 },
    { device: 'nmos-HVTP', gateX: 3, ax: 2.35, bx: 3.65 },
  ];
  for (const local of localSections) {
    await selectView('main');
    const sliceSettings = page.locator('[data-action="slice-coordinates"]');
    if (!(await sliceSettings.isVisible())) {
      const roiToggle = page.locator('#mainPanel [data-action="roi"]');
      if (!(await roiToggle.isVisible())) {
        await page.locator('#mainPanel button[aria-label="Main more tools"]').click();
      }
      await roiToggle.click();
    }
    await sliceSettings.click();
    for (const [id, value] of [
      ['sectionAx', local.ax],
      ['sectionAy', 0],
      ['sectionBx', local.bx],
      ['sectionBy', 0],
    ]) {
      await page.locator('#' + id).fill(String(value));
      await page.locator('#' + id).press('Tab');
    }
    assert.deepEqual(
      (await snap()).section,
      { a: [local.ax, 0], b: [local.bx, 0] },
      'Local section must keep exact µm physical endpoints',
    );
    assert.ok(local.ax < local.gateX && local.gateX < local.bx);
    await page.locator('#mainSliceSettings button[aria-label="Close Section line"]').click();
    await revealSectionDock();
    const localSectionExpanded = await requireLargeView('section');
    assert.ok(
      Number(await page.locator('#sectionCanvas').getAttribute('data-x-px-per-um')) > 0,
      'Local section must render at a nonzero physical scale',
    );
    await page.screenshot({
      path: resolve(dir, 'tcmos-fig1a-' + local.device + '-local-section.png'),
    });
    await restoreLargeView('section', localSectionExpanded);
  }
  // Local sections are inspection-only UI state. The candidate project and
  // its default cross-device Section remain unchanged on disk.
  report.localSections = localSections.map(({ device, gateX, ax, bx }) => ({
    device,
    gateXUm: gateX,
    endpointsUm: { a: [ax, 0], b: [bx, 0] },
    sourceGeometry: '130 nm process node reported; 0.13 µm gate width is an illustrative choice',
    physicalGateLengthReportedInSource: false,
  }));
  // Inspect a physical local 3D cutaway using the existing Main ROI clipping
  // contract. The full 2 µm illustrative substrate previously compressed the
  // buried 80–240 nm annotations to only a few display pixels. Use the same
  // documented display-only Z break as Section to magnify the near-surface
  // device while retaining original physical coordinates and model bytes.
  // The y=0 ROI face crosses each gate and the annotated doping intervals.
  report.localThreeD = [];
  for (const local of localSections) {
    const roi = {
      type: 'rect',
      a: [local.gateX - 0.85, 0],
      b: [local.gateX + 0.85, 0.75],
    };
    const inspection = structuredClone(expected);
    inspection.name = 'T-CMOS ' + local.device + ' LOCAL 3D INSPECTION ONLY';
    inspection.roi = roi;
    inspection.section = { a: [local.ax, 0], b: [local.bx, 0] };
    inspection.display.threeOpacity = 0.5;
    inspection.display.threeShowBorders = true;
    inspection.display.threeCutaway = true;
    inspection.display.sectionCollapse = {
      enabled: true,
      top: 0.68,
      bottom: -0.8,
      scaleLinked: false,
      frontScale: 1,
      backScale: 0.25,
    };
    // The removed Z span is unmodified Si handle only. The illustrated HVT
    // interval (0.76–0.92 µm absolute Z) remains fully above the break.
    const roiPolygon = [
      [
        [
          [roi.a[0], roi.a[1]],
          [roi.b[0], roi.a[1]],
          [roi.b[0], roi.b[1]],
          [roi.a[0], roi.b[1]],
          [roi.a[0], roi.a[1]],
        ],
      ],
    ];
    const roiCut = implantSolids(inspection.model, roiPolygon).filter(
      (annotation) => annotationInspectionCutSegments(annotation, roiPolygon).length > 0,
    );
    assert.ok(
      roiCut.some((annotation) =>
        annotation.name?.includes(local.device === 'pmos-HVTN' ? 'HVTN' : 'HVTP'),
      ),
      'Local ROI must intersect the buried HVT implant on the visible cut face',
    );
    // Do not reuse the full-field camera: Fit must resolve the ROI's own
    // physical XY bounds and the renderer's Z-display transform.
    delete inspection.display.threeCamera;
    const inspectionPath = resolve(dir, 'tcmos-' + local.device + '-INSPECTION-ONLY.wafercad');
    await writeFile(inspectionPath, JSON.stringify(inspection));
    const validated = await readProjectFile(new Blob([await readFile(inspectionPath)]));
    assert.deepEqual(validated.roi, roi);
    assert.equal(validated.display.threeCutaway, true);
    assert.deepEqual(validated.display.sectionCollapse, inspection.display.sectionCollapse);
    assert.deepEqual(validated.model, expected.model, 'Inspection copy altered material model');
    await panel('project');
    await page.locator('#openProjectInput').setInputFiles(inspectionPath);
    const confirm = page.getByRole('button', { name: 'Open project', exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForFunction(
      ({ name, bounds }) => {
        const s = window.WaferCadV2Workstation.snapshot();
        return (
          s.projectName === name &&
          JSON.stringify(s.roi) === JSON.stringify(bounds) &&
          !s.workflow.busy
        );
      },
      { name: inspection.name, bounds: roi },
      { timeout: 120000 },
    );
    const inBrowser = await snap();
    assert.deepEqual(inBrowser.model, opened.model, 'Local 3D capture modified physical model');
    assert.deepEqual(inBrowser.section, inspection.section);
    // Project Open returns to the Main single view. Activate 3D explicitly
    // before interacting with its toolbar; a hidden maximize control must
    // never be clicked in a browser acceptance test.
    await selectView('three');
    await waitForPaint(page);
    const localThreeExpanded = await requireLargeView('three');
    await page.locator('#threePanel [data-action="fit:three"]').click();
    await waitForPaint(page);
    const framing = await snap();
    assert.deepEqual(framing.roi, roi, '3D ROI clip must use exact local coordinates');
    assert.equal(framing.threeDisplay.borders, true, 'Local cutaway should display borders');
    assert.equal(framing.threeDisplay.cutaway, true, 'Local 3D cutaway mode must be active');
    assert.equal(
      await page.locator('#threePanel [data-action="cutaway:three"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      framing.sectionCollapse.enabled,
      true,
      'Local cutaway must use display-only Z break',
    );
    assert.equal(framing.sectionCollapse.top, 0.68);
    assert.equal(framing.sectionCollapse.bottom, -0.8);
    await page.waitForFunction(
      () =>
        Number(document.querySelector('#threeHost')?.dataset.implantCutBuiltCount) > 0 &&
        Number(document.querySelector('#threeHost')?.dataset.implantOutlineBuiltCount) > 0,
      null,
      { timeout: 45000 },
    );
    assert.ok(
      Math.abs(framing.threeCamera?.target?.[0] - local.gateX) < 0.1,
      '3D Fit must target the transistor-local ROI rather than the full 14 µm field',
    );
    // The default Fit is an elevated isometric overview: it hides the
    // y=0 inspection face under surface overlays. Reorient the *real*
    // OrbitControls to a near-side elevation, then zoom the gate-local ROI.
    // This is a user gesture, not a synthetic rendering or geometry edit.
    const rotateButton = page.locator('#threePanel [data-action="tool:rotate:three"]');
    if ((await rotateButton.getAttribute('aria-pressed')) !== 'true') await rotateButton.click();
    const canvas = page.locator('#threeHost canvas').first();
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 400 && canvasBox.height > 300);
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + canvasBox.height * 0.12, cy - canvasBox.height * 0.05, {
      steps: 12,
    });
    await page.mouse.up();
    await page.mouse.wheel(0, -740);
    await waitForPaint(page);
    const inspectionCamera = (await snap()).threeCamera;
    assert.ok(inspectionCamera?.position?.every(Number.isFinite));
    const cameraDx = inspectionCamera.position[0] - inspectionCamera.target[0];
    const cameraDy = inspectionCamera.position[1] - inspectionCamera.target[1];
    const cameraDz = inspectionCamera.position[2] - inspectionCamera.target[2];
    assert.ok(
      cameraDy < -0.5 && Math.abs(cameraDx) < Math.abs(cameraDy) * 0.2,
      'Local 3D evidence must face the exposed y=0 section rather than a top or end view',
    );
    assert.ok(
      cameraDz > 0 && cameraDz < Math.hypot(cameraDx, cameraDy) * 0.45,
      'Local 3D camera must keep a low side elevation',
    );
    await page.locator('#threePanel').screenshot({
      path: resolve(dir, 'tcmos-fig1a-' + local.device + '-local-3d-cutaway.png'),
    });
    report.localThreeD.push({
      device: local.device,
      sourceSupported: false,
      role: 'display-Z-break ROI cutaway; not calibrated dopant, junction thickness or BTBT physics',
      roiUm: roi,
      displayOnlyZBreak: inspection.display.sectionCollapse,
      threeCutaway: true,
      physicalZExaggeration: false,
      buriedImplantCutFragments: roiCut.length,
      annotationOutlineMeshes: Number(
        await page.locator('#threeHost').getAttribute('data-implant-outline-built-count'),
      ),
      rendererImplantCutMeshes: Number(
        await page.locator('#threeHost').getAttribute('data-implant-cut-built-count'),
      ),
      fitCamera: framing.threeCamera,
      camera: inspectionCamera,
      unchangedPhysicalModel: true,
    });
    await restoreLargeView('three', localThreeExpanded);
    // Record a SECOND, explicitly isolated scientific-inspection image. Real
    // Section Layers controls hide unrelated S/D and opposite-device markers;
    // the underlying material topology, masks and Recipe remain unchanged.
    // Keep the all-annotations image above as the unfiltered comparison.
    await revealSectionDock();
    await requireLargeView('section');
    const selectedName = local.device === 'pmos-HVTN' ? 'HVTN' : 'HVTP';
    const hiddenAnnotations = [
      ...expected.model.implants,
      ...(expected.model.electricalRegions || []),
    ].filter((item) => !item.name.includes(selectedName));
    for (const annotation of hiddenAnnotations) {
      const toggle = page.locator(
        '#sectionPanel [data-annotation-id="' + annotation.id + '"] input[type="checkbox"]',
      );
      await toggle.uncheck();
    }
    const isolatedModel = (await snap()).model;
    assert.deepEqual(isolatedModel.regions, opened.model.regions);
    assert.deepEqual(isolatedModel.layers, opened.model.layers);
    assert.deepEqual(
      isolatedModel.implants.map(({ visible, ...physical }) => physical),
      opened.model.implants.map(({ visible, ...physical }) => physical),
      'Visibility-only inspection must not rewrite implant geometry',
    );
    assert.equal(
      isolatedModel.implants.filter((item) => item.visible !== false).length,
      1,
      'Only the target buried HVT annotation may remain visible in the isolated image',
    );
    await selectView('three');
    await waitForPaint(page);
    const isolatedThreeExpanded = await requireLargeView('three');
    await page.waitForFunction(
      () =>
        Number(document.querySelector('#threeHost')?.dataset.implantCutBuiltCount) > 0 &&
        Number(document.querySelector('#threeHost')?.dataset.implantOutlineBuiltCount) > 0,
      null,
      { timeout: 45000 },
    );
    await page.locator('#threePanel').screenshot({
      path: resolve(dir, 'tcmos-fig1a-' + local.device + '-HVT-ONLY-display-3d.png'),
    });
    report.localThreeD.at(-1).isolatedAnnotationVisibility = {
      target: selectedName,
      hiddenCount: hiddenAnnotations.length,
      materialGeometryUnchanged: true,
      allMarkersScreenshotRetained: true,
    };
    await restoreLargeView('three', isolatedThreeExpanded);
  }
  assert.deepEqual(pageErrors, [], 'Unexpected v2 browser errors');
  Object.assign(report, {
    result: 'pass',
    steps: count,
    geometry,
    maskExports,
    savedAndRestored: true,
    layers: exported.model.layers.length,
    regions: exported.model.regions.length,
    implants: exported.model.implants.length,
    history: exported.snapshotBranches.nodes.length,
  });
  // Independent visual demonstration: 18-degree tilt is deliberately not from the paper.
  // Keep the accepted source project screenshot and evidence untouched.
  const tiltFile = resolve(dir, 'tcmos-tilt-demo-18deg-NOT-PAPER.wafercad');
  const tiltProject = await readProjectFile(new Blob([await readFile(tiltFile)]));
  await panel('project');
  await page.locator('#openProjectInput').setInputFiles(tiltFile);
  const tiltConfirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await tiltConfirm.isVisible()) await tiltConfirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    tiltProject.name,
    { timeout: 120000 },
  );
  const tiltState = await snap();
  assert.deepEqual(
    tiltState.model.implants.slice(0, 2).map((item) => item.tilt),
    [18, 18],
  );
  assert.deepEqual(tiltState.section, { a: [-4.45, -1.2], b: [-2.95, -1.2] });
  await revealSectionDock();
  await requireLargeView('section');
  await page.screenshot({ path: resolve(dir, 'tcmos-tilt-18deg-NOT-PAPER-section.png') });
  report.tiltDiagnostic = { sourceSupported: false, tiltDegrees: 18, sectionSpanUm: 1.5 };
  assert.deepEqual(pageErrors, [], 'Unexpected v2 browser errors after tilt diagnostic');
  console.log('T-CMOS v2 browser Run All and strict material geometry parity PASS');
} catch (error) {
  Object.assign(report, { result: 'fail', error: error.stack || error.message, pageErrors });
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'browser-acceptance.json'), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
