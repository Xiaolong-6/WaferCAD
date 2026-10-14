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
const report = { pass: false, test: 'v2 open / 3D / Run All / project roundtrip' };
page.on('pageerror', (e) => errors.push(e.message));
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
  await page.waitForFunction(
    () => window.WaferCadV2Workstation.snapshot().projectName?.includes('M3D-LIME'),
    null,
    { timeout: 120000 },
  );
  const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const initial = await snapshot();
  assert.deepEqual(initial.model, expected.model, 'v2 project import changed canonical geometry');
  assert.equal(initial.layout.combos.length, 11, 'v2 lost inferred Mask layers');
  assert.ok(initial.model.layers.some((layer) => layer.name === 'Digital Ta2O5 RSL 10nm'));
  assert.deepEqual(initial.roi, { type: 'rect', a: [-45, -35], b: [-35, -11] });
  assert.deepEqual(initial.section, { a: [-44, -24], b: [-35, -24] });
  for (const view of ['main', 'mask', 'three']) {
    await page.locator('[data-action="view:' + view + '"]').click();
    await waitForPaint(page);
  }
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
  // Real Mask-toolbar download, through the production export Worker. Select
  // all eleven author-unavailable *inferred* layers rather than the three
  // initially highlighted inspection layers.
  await page.locator('[data-action="view:mask"]').click();
  await waitForPaint(page);
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
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await context.close();
  await browser.close();
}
