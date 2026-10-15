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

  // The first-open overlay intentionally selects eight visually useful layers.
  // For manufacturing-layout interchange, explicitly select the complete 13-layer
  // File Mask and prove no hidden NWELL/PWELL/S-D/silicide layers are omitted.
  await panel('mask');
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
  // Figure 1a has device-scale details that cannot be judged in the four-view
  // thumbnail. Capture native maximized Section and 3D views for inspection.
  const maximizeSection = page.locator('[data-action="maximize:section"]').first();
  await maximizeSection.click();
  await waitForPaint(page);
  await page.screenshot({ path: resolve(dir, 'tcmos-fig1a-section-expanded.png') });
  await maximizeSection.click();
  await waitForPaint(page);
  const maximizeThree = page.locator('[data-action="maximize:three"]').first();
  await maximizeThree.click();
  await waitForPaint(page);
  await page.screenshot({ path: resolve(dir, 'tcmos-fig1a-three-expanded.png') });
  await maximizeThree.click();
  await waitForPaint(page);

  // Fig. 1a's 130 nm gate/channel geometry needs a device-scale inspection
  // separate from the 11 µm field section. Use the real Main Slice settings
  // rather than modifying the project model or fabricating additional masks.
  const localSections = [
    { device: 'pmos-HVTN', gateX: -3, ax: -3.65, bx: -2.35 },
    { device: 'nmos-HVTP', gateX: 3, ax: 2.35, bx: 3.65 },
  ];
  for (const local of localSections) {
    await page.locator('[data-action="view:main"]').click();
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
    const expandLocal = page.locator('[data-action="maximize:section"]').first();
    await expandLocal.click();
    await waitForPaint(page);
    assert.ok(
      Number(await page.locator('#sectionCanvas').getAttribute('data-x-px-per-um')) > 0,
      'Local section must render at a nonzero physical scale',
    );
    await page.screenshot({
      path: resolve(dir, 'tcmos-fig1a-' + local.device + '-local-section.png'),
    });
    await expandLocal.click();
    await waitForPaint(page);
  }
  // Local sections are inspection-only UI state. The candidate project and
  // its default cross-device Section remain unchanged on disk.
  report.localSections = localSections.map(({ device, gateX, ax, bx }) => ({
    device,
    gateXUm: gateX,
    endpointsUm: { a: [ax, 0], b: [bx, 0] },
    sourceGeometry: 'illustrative; gate length 130 nm only is source-supported',
  }));
  // Inspect a physical local 3D cutaway using the existing Main ROI clipping
  // contract. Each temporary project is an inspection-only derivative of the
  // accepted file: the manufacturing geometry and published candidate bytes
  // remain unchanged. The y = 0 ROI boundary exposes a cross-device sidewall.
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
    inspection.display.threeOpacity = 0.6;
    inspection.display.threeShowBorders = true;
    // Do not reuse the full-field camera: Fit must resolve the ROI's own
    // physical XY bounds and the renderer's Z-display transform.
    delete inspection.display.threeCamera;
    const inspectionPath = resolve(dir, 'tcmos-' + local.device + '-INSPECTION-ONLY.wafercad');
    await writeFile(inspectionPath, JSON.stringify(inspection));
    const validated = await readProjectFile(new Blob([await readFile(inspectionPath)]));
    assert.deepEqual(validated.roi, roi);
    assert.deepEqual(validated.model, expected.model, 'Inspection copy altered material model');
    await panel('project');
    await page.locator('#openProjectInput').setInputFiles(inspectionPath);
    const confirm = page.getByRole('button', { name: 'Open project', exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForFunction(
      ({ name, bounds }) => {
        const s = window.WaferCadV2Workstation.snapshot();
        return s.projectName === name && JSON.stringify(s.roi) === JSON.stringify(bounds) && !s.workflow.busy;
      },
      { name: inspection.name, bounds: roi },
      { timeout: 120000 },
    );
    const inBrowser = await snap();
    assert.deepEqual(inBrowser.model, opened.model, 'Local 3D capture modified physical model');
    assert.deepEqual(inBrowser.section, inspection.section);
    const expandThree = page.locator('[data-action="maximize:three"]').first();
    await expandThree.click();
    await waitForPaint(page);
    await page.locator('#threePanel [data-action="fit:three"]').click();
    await waitForPaint(page);
    const framing = await snap();
    assert.deepEqual(framing.roi, roi, '3D ROI clip must use exact local coordinates');
    assert.equal(framing.threeDisplay.borders, true, 'Local cutaway should display borders');
    assert.ok(
      Math.abs(framing.threeCamera?.target?.[0] - local.gateX) < 0.1,
      '3D Fit must target the transistor-local ROI rather than the full 14 µm field',
    );
    await page.locator('#threePanel').screenshot({
      path: resolve(dir, 'tcmos-fig1a-' + local.device + '-local-3d-cutaway.png'),
    });
    report.localThreeD.push({
      device: local.device,
      sourceSupported: false,
      role: 'illustrative ROI-clipped device inspection; not calibrated dopant or BTBT physics',
      roiUm: roi,
      camera: framing.threeCamera,
      unchangedPhysicalModel: true,
    });
    await expandThree.click();
    await waitForPaint(page);
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
  assert.deepEqual(tiltState.section, { a: [-4.45, 0], b: [-2.95, 0] });
  await page.locator('[data-action="maximize:section"]').first().click();
  await waitForPaint(page);
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
