import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser, newUiContext, waitForAppReady, waitForThreeReady,
  observePageErrors, canvasInkFraction, waitForCanvasSizeSync,
  openFunctionPanel, closeFunctionPanel,
} from './test-helpers/ui.mjs';
import { ensurePrimaryViewVisible } from './test-helpers/product.mjs';
import { loadProject } from './test-helpers/product-scientific.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../site/project-io.js');
const { validateProjectFile } = await import('../site/project-schema.js');

const output = fileURLToPath(new URL('../test-results/m3d/visual-acceptance/', import.meta.url));
await mkdir(output, { recursive: true });
const sourcePath = fileURLToPath(new URL(
  '../examples/projects/m3d-selfpowered-2026-replay/M3D_selfpowered_full_replay.wafercad',
  import.meta.url,
));
const originalText = await readFile(sourcePath, 'utf8');
const original = await readProjectFile({
  size: Buffer.byteLength(originalText),
  text: async () => originalText,
});
validateProjectFile(original);
assert.equal(original.snapshots.length, 27, 'Expected S00–S26 bookmarks');
assert.equal(original.snapshotBranches.nodes.length, 36, 'Expected 36 Process History nodes');

const browser = await launchBrowser();
const context = await newUiContext(browser, {
  viewport: { width: 1800, height: 1100 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(180000);
const errors = observePageErrors(page);
const report = {
  sourceHistoryNodes: 36,
  sourceBookmarks: 27,
  import: false,
  historyCanRestore: false,
  mainInk: null,
  sectionInk: null,
  threeReady: false,
  threePngBytes: 0,
  exportMode: null,
  exportRoundTrip: false,
  secondImport: false,
  pageErrors: errors,
};

try {
  const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
  await page.goto(baseUrl.replace(/\/$/, '') + '/app.html', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await loadProject(page, JSON.parse(originalText), 'm3d-kernel-final');
  report.import = true;

  await ensurePrimaryViewVisible(page, 'main');
  await waitForCanvasSizeSync(page, '#mainCanvas');
  report.mainInk = await canvasInkFraction(page, '#mainCanvas');
  assert.ok(report.mainInk > 0.015, 'Main view appears empty');
  await page.locator('#mainPanel').screenshot({
    path: join(output, 'm3d-main.png'), animations: 'disabled',
  });

  if (await page.locator('#sectionPanel').isVisible()) {
    await waitForCanvasSizeSync(page, '#sectionCanvas');
    report.sectionInk = await canvasInkFraction(page, '#sectionCanvas');
    assert.ok(report.sectionInk > 0.015, 'Section view appears empty');
    await page.locator('#sectionPanel').screenshot({
      path: join(output, 'm3d-section.png'), animations: 'disabled',
    });
  }

  await ensurePrimaryViewVisible(page, 'three');
  await waitForThreeReady(page, 180000);
  const three = page.locator('#threeHost canvas');
  await three.waitFor({ state: 'visible', timeout: 180000 });
  report.threeReady = true;
  const png = await page.locator('#threePanel').screenshot({
    path: join(output, 'm3d-three.png'), animations: 'disabled',
  });
  report.threePngBytes = png.length;
  assert.ok(png.length > 10000, '3D screenshot is unexpectedly small');

  await openFunctionPanel(page, 'snapshots', { timeout: 30000 });
  assert.equal(await page.locator('.history-step-wrap').count(), 36);
  assert.ok(
    (await page.locator('.process-history-row[role="button"]').count()) >= 34,
    'Most Process History nodes should be restorable',
  );
  const labels = await page.locator('.process-history-row strong').allTextContents();
  report.historyLabels = labels;
  const early = page.locator('.history-step-wrap[data-step-id="m3d-step-15"] .process-history-row');
  assert.equal(await early.count(), 1, 'WSe2 History node is missing: ' + labels.join(' | '));
  assert.match(await early.textContent(), /WSe2/i);
  await early.click();
  await page.waitForFunction(() =>
    document.querySelector('.history-step-wrap[data-step-id="m3d-step-15"] .process-history-row')
      ?.dataset.cursor === 'true',
    null, { timeout: 30000 });
  const head = page.locator('.history-step-wrap[data-step-id="m3d-step-36"] .process-history-row');
  assert.equal(await head.count(), 1);
  await head.click();
  await page.waitForFunction(() =>
    document.querySelector('.history-step-wrap[data-step-id="m3d-step-36"] .process-history-row')
      ?.dataset.cursor === 'true',
    null, { timeout: 30000 });
  report.historyCanRestore = true;
  await closeFunctionPanel(page);

  await openFunctionPanel(page, 'project', { timeout: 30000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 360000 });
  await page.locator('#exportProjectBtn').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.ok(downloadPath, 'Export download was not written');
  const exportedText = await readFile(downloadPath, 'utf8');
  const packed = JSON.parse(exportedText);
  report.exportMode = packed.storage?.lossless === true ? 'lossless' : 'compact';
  const reopened = await readProjectFile({
    size: Buffer.byteLength(exportedText),
    text: async () => exportedText,
  });
  validateProjectFile(reopened);
  assert.deepEqual(reopened.model, original.model, 'Browser Export changed canonical geometry');
  assert.equal(reopened.snapshots.length, 27);
  assert.equal(reopened.snapshotBranches.nodes.length, 36);
  report.exportRoundTrip = true;
  await writeFile(join(output, 'm3d-browser-export.wafercad'), exportedText);
  await closeFunctionPanel(page);

  await loadProject(page, packed, 'm3d-export-reimport');
  await waitForThreeReady(page, 180000);
  report.secondImport = true;
  await page.screenshot({
    path: join(output, 'm3d-reimport-overview.png'),
    fullPage: true, animations: 'disabled',
  });
  assert.deepEqual(errors, [], 'Browser import/view/export emitted page errors');
  console.log('M3D VISUAL ACCEPTANCE', JSON.stringify(report));
} finally {
  await writeFile(join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
