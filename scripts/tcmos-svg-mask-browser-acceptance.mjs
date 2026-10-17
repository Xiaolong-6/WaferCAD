// Visual acceptance for approved SVG Mask only. Intentionally does not run Recipe.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';
import { readProjectFile } from '../site/project-io.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { readTcmosReferenceMask } from './tcmos-svg-mask.mjs';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { parseOAS } from '../site/oasis.js';

const projectPath = resolve(
  'examples/projects/tcmos-ternary-inverter-2019-candidate/tcmos-ternary-inverter-130nm.wafercad',
);
const dir = resolve('test-results/tcmos-svg-mask');
await mkdir(dir, { recursive: true });
await loadGeometryKernel();
const project = await readProjectFile(new Blob([await readFile(projectPath)]));
const source = readTcmosReferenceMask();
assert.equal(project.layout.combos.length, 8);
assert.equal(project.layout.elements.length, 232);
for (const group of source) {
  assert.deepEqual(
    project.layout.elements.filter((e) => e.layer === group.layer).map((e) => e.points),
    group.shapes.map((s) => s.points),
    'SVG vertex mismatch on ' + group.name,
  );
}
const expectedCounts = Object.fromEntries(
  source.map((g) => [g.layer + '/' + g.datatype, g.shapes.length]),
);
const browser = await launchBrowser();
const { page } = await newUiPage(browser, {
  viewport: { width: 1440, height: 950 },
  acceptDownloads: true,
});
const report = { pass: false, source: 'layout-complete.svg', layers: 8, polygons: 232 };
try {
  const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
    timeout: 120000,
  });
  await page.locator('.p-nav [data-action="domain:project"]').click();
  await page.locator('#openProjectInput').setInputFiles(projectPath);
  const confirmation = page.getByRole('button', { name: 'Open project', exact: true });
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(
    (name) => window.WaferCadV2Workstation.snapshot().projectName === name,
    project.name,
    { timeout: 120000 },
  );
  await page.locator('.p-nav [data-action="domain:mask"]').click();
  const dock = page.locator('[data-action="dock:view:mask"]:visible').first();
  if (await dock.count()) {
    if ((await dock.getAttribute('aria-pressed')) !== 'true') await dock.click();
  } else {
    await page.locator('[data-action="view:mask"]:visible').first().click();
  }
  await waitForPaint(page);
  const panel = page.locator('#maskPanel');
  await panel.waitFor({ state: 'visible', timeout: 12000 });
  let bounds = await panel.boundingBox();
  if (!bounds || bounds.width <= 700 || bounds.height <= 500) {
    await page.locator('[data-action="maximize:mask"]:visible').first().click();
    await waitForPaint(page);
    bounds = await panel.boundingBox();
  }
  assert.ok(bounds && bounds.width > 700 && bounds.height > 500);
  const checkboxes = page.locator('#v2-maskLayerList input[type="checkbox"]');
  assert.equal(await checkboxes.count(), 8, 'Hidden process-only masks leaked into File Mask');
  for (let i = 0; i < 8; i++) {
    const changed = await page.evaluate(() => {
      const box = document.querySelector('#v2-maskLayerList input[type="checkbox"]:not(:checked)');
      if (!box) return false;
      box.click();
      return true;
    });
    if (!changed) break;
  }
  assert.equal(await page.locator('#v2-maskLayerList input:checked').count(), 8);
  await waitForPaint(page);
  await page.locator('#maskCanvas').screenshot({ path: resolve(dir, 'mask-canvas.png') });
  await page.screenshot({ path: resolve(dir, 'mask-expanded-chromium.png') });
  const menu = page.locator('[data-action="mask-export-menu"]');
  if (!(await menu.isVisible())) {
    await page.getByRole('button', { name: 'Mask more tools' }).click();
  }
  await menu.click();
  report.exports = [];
  for (const format of ['gds', 'oas']) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('[data-action="mask-export:' + format + '"]').click(),
    ]);
    const filename = resolve(dir, 'approved-svg-mask.' + format);
    await download.saveAs(filename);
    const bytes = await readFile(filename);
    const parsed =
      format === 'gds'
        ? parseGDS(Uint8Array.from(bytes).buffer)
        : await parseOAS(Uint8Array.from(bytes).buffer);
    const elements = flattenGDS(parsed, parsed.root).elements;
    const counts = {};
    for (const element of elements) {
      const key = element.layer + '/' + element.datatype;
      counts[key] = (counts[key] || 0) + 1;
    }
    assert.deepEqual(counts, expectedCounts, format + ' lost an SVG layer or polygon');
    assert.equal(elements.length, 232);
    report.exports.push({ format, bytes: bytes.length, layers: 8, polygons: 232 });
  }
  report.pass = true;
  report.legacyRecipeValidated = false;
  console.log(JSON.stringify(report));
} catch (error) {
  report.error = String(error);
  await page.screenshot({ path: resolve(dir, 'mask-error.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(dir, 'mask-only-acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
