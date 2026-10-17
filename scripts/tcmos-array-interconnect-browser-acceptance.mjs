// Actual Workstation Chromium acceptance for the SEPARATE post-Recipe
// routed 2.5D variant. A generated SVG is NOT substituted for this test.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { parseOAS } from '../site/oasis.js';

const dir = resolve('test-results/tcmos');
const path = resolve(dir, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-PROTOTYPE.wafercad');
await loadGeometryKernel();
const file = await readProjectFile(new Blob([await readFile(path)]));
assert.equal(file.model.kernel, 'vector-2.5d-v1');
assert.equal(file.layout.elements.length, 3963);
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const errors = [];
const report = {
  status: 'in_progress',
  project: file.name,
  actualChromium: true,
  physicalMaterialModel: true,
  routedRecipeReplayValidated: false,
  sourceMasksUntouched: 3712,
  supplementaryMasks: 251,
  expectedIndependentNetworks: 19,
};
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(
    (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173') + '/app.html?start=empty',
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await page.locator('.p-nav [data-action="domain:project"]').click();
  await page.locator('#openProjectInput').setInputFiles(path);
  const confirm = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    file.name,
    { timeout: 120000 },
  );
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const loaded = await snapshot();
  assert.equal(loaded.model.kernel, 'vector-2.5d-v1');
  assert.ok(!loaded.model.array);
  assert.equal(loaded.layout.elements.length, 3963);
  assert.ok(loaded.model.layers.some((l) => l.name === 'METAL4 Al (illustrative)'));
  assert.ok(loaded.model.layers.some((l) => l.name === 'VIA34 W (illustrative)'));
  assert.ok(loaded.model.layers.some((l) => l.name === 'ILD4 SiO2 (illustrative)'));
  assert.ok(!loaded.processRecipe && !loaded.snapshotBranches);
  for (const view of ['main', 'mask', 'three', 'section']) {
    const domain = view === 'mask' ? 'mask' : 'project';
    await page.locator('.p-nav [data-action="domain:' + domain + '"]').click();
    const dock = page.locator('[data-action="dock:view:' + view + '"]:visible').first();
    if (await dock.count()) {
      if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
    } else if (view !== 'section') {
      await page.locator('[data-action="view:' + view + '"]:visible').first().click();
    } else {
      await page.getByRole('button', { name: 'Section', exact: true }).first().click();
    }
    await waitForPaint(page);
    const panel = page.locator('#' + view + 'Panel');
    await panel.waitFor({ state: 'visible', timeout: 12000 });
    const maximize = page.locator('[data-action="maximize:' + view + '"]:visible').first();
    const dimensions = await panel.boundingBox();
    if (dimensions && dimensions.width < 700 && (await maximize.count())) {
      await maximize.click();
      await waitForPaint(page);
    }
    await panel.screenshot({ path: resolve(dir, 'tcmos-4x4-routed-' + view + '-chromium.png') });
  }
  // Distinct 14-layer mask export must retain all approved 8 layer groups
  // plus exactly six explicitly supplemental interconnect groups.
  await page.locator('.p-nav [data-action="domain:mask"]').click();
  const checkboxes = page.locator('#v2-maskLayerList input[type="checkbox"]');
  assert.equal(await checkboxes.count(), 14, 'Supplemental mask groups are missing');
  for (let i = 0; i < 14; i++) {
    const didClick = await page.evaluate(() => {
      const box = document.querySelector('#v2-maskLayerList input[type="checkbox"]:not(:checked)');
      if (!box) return false;
      box.click();
      return true;
    });
    if (!didClick) break;
  }
  assert.equal(await page.locator('#v2-maskLayerList input:checked').count(), 14);
  const expectedCounts = {};
  for (const element of file.layout.elements) {
    const key = element.layer + '/' + element.datatype;
    expectedCounts[key] = (expectedCounts[key] || 0) + 1;
  }
  // The six added routing layers contain only Manhattan rectangles.
  // Check EVERY exported rectangle's coordinates, not merely a passing
  // 14-layer/3963-polygon count. Existing source-SVG 8 layers are protected
  // by the separate exact-source scientific/Recipe tests.
  const supplementalLayers = new Set([21, 22, 23, 24, 25, 26]);
  const rectangularSignature = (element) => {
    const points = element.points;
    assert.ok(points.length >= 4, 'Invalid routed mask polygon');
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const rectArea = (rect[2] - rect[0]) * (rect[3] - rect[1]);
    const ring = points.at(-1)[0] === points[0][0] &&
      points.at(-1)[1] === points[0][1]
      ? points.slice(0, -1)
      : points;
    assert.equal(ring.length, 4, 'Routing rectangle changed vertex count');
    const doubleArea = ring.reduce((value, [x, y], i) => {
      const [u, v] = ring[(i + 1) % ring.length];
      return value + x * v - u * y;
    }, 0);
    assert.ok(Math.abs(Math.abs(doubleArea) / 2 - rectArea) < 1e-9,
      'Routing polygon is no longer a complete Manhattan rectangle');
    return element.layer + '|' + element.datatype + '|' +
      rect.map((v) => v.toFixed(6)).join(',');
  };
  const expectedRouting = file.layout.elements
    .filter((element) => supplementalLayers.has(element.layer))
    .map(rectangularSignature).sort();
  assert.equal(expectedRouting.length, 251);
  const menu = page.locator('[data-action="mask-export-menu"]');
  if (!(await menu.isVisible()))
    await page.getByRole('button', { name: 'Mask more tools' }).click();
  await menu.click();
  report.exports = [];
  for (const format of ['gds', 'oas']) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('[data-action="mask-export:' + format + '"]').click(),
    ]);
    const output = resolve(dir, 'tcmos-4x4-routed-mask.' + format);
    await download.saveAs(output);
    const bytes = await readFile(output);
    const parsed = format === 'gds'
      ? parseGDS(Uint8Array.from(bytes).buffer)
      : await parseOAS(Uint8Array.from(bytes).buffer);
    const elements = flattenGDS(parsed, parsed.root).elements;
    const counts = {};
    for (const element of elements) {
      const key = element.layer + '/' + element.datatype;
      counts[key] = (counts[key] || 0) + 1;
    }
    assert.deepEqual(counts, expectedCounts, format + ': lost or duplicated routing polygons');
    assert.equal(elements.length, 3963);
    assert.equal(Object.keys(counts).length, 14);
    const actualRouting = elements
      .filter((element) => supplementalLayers.has(element.layer))
      .map(rectangularSignature).sort();
    assert.deepEqual(actualRouting, expectedRouting,
      format + ': changed one or more supplemental Via/M2/M3/M4 mask rectangles');
    report.exports.push({ format, bytes: bytes.length, layers: 14, polygons: 3963 });
  }
  // Save -> destructive name mutation -> actual Recovery Restore. Merely
  // listing a checkpoint does NOT constitute a recovery acceptance.
  await page.locator('.p-nav [data-action="domain:project"]').click();
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    () => /Saved .* locally/.test(
      document.querySelector('[data-slot="status.message"]')?.textContent || ''
    ),
    null,
    { timeout: 120000 },
  );
  const checkpoint = await page.locator('#workspaceRecoverySelect').inputValue();
  assert.ok(checkpoint, 'Routed material project must create a real Recovery checkpoint');
  await page.locator('#projectNameInput').fill('Temporary routed material recovery mutation');
  await page.locator('#projectNameInput').press('Tab');
  await page.locator('#workspaceRecoverySelect').selectOption(checkpoint);
  await page.locator('#workspaceRestoreBtn').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForFunction(
    (name) => {
      const state = window.WaferCadV2Workstation.snapshot();
      return state.projectName === name && !state.workflow.busy;
    },
    file.name,
    { timeout: 120000 },
  );
  const restored = await snapshot();
  assert.equal(restored.projectName, file.name);
  assert.equal(restored.model.kernel, 'vector-2.5d-v1');
  assert.deepEqual(restored.model.layers, loaded.model.layers,
    'Recovery changed the physical layer identities/materials');
  assert.deepEqual(restored.model.regions, loaded.model.regions,
    'Recovery changed physical XY/Z region geometry or material stacks');
  assert.deepEqual(restored.layout.elements, loaded.layout.elements,
    'Recovery changed original or supplemental File Mask vertices');
  assert.ok(!restored.processRecipe && !restored.snapshotBranches,
    'Recovery must not synthesize unverified routed process history');
  await page.screenshot({ path: resolve(dir, 'tcmos-4x4-routed-recovery-restored.png') });
  report.recovery = {
    checkpoint: true, restored: true,
    materialRegions: restored.model.regions.length,
    maskElements: restored.layout.elements.length,
    strictModelAndMaskParity: true,
  };
  assert.deepEqual(errors, []);
  report.status = 'pass';
  report.renderedModelRegions = loaded.model.regions.length;
} catch (error) {
  report.status = 'fail';
  report.error = error.stack || error.message;
  report.pageErrors = errors;
  throw error;
} finally {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'tcmos-4x4-routed-browser-report.json'),
    JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}
