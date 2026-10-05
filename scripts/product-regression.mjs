import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import {
  isotropicReleaseBenchmark,
  loadGeometryKernel,
  processBenchmark,
  projectForBenchmark,
} from './process-benchmarks.mjs';
import {
  captureProductReview,
  checkLayout,
  confirmIfVisible,
  ensurePrimaryViewVisible,
  openFunctionPanel,
  openProductPage,
} from './test-helpers/product.mjs';
import { createProductLayoutChecks } from './test-helpers/product-layout.mjs';
import {
  checkSectionSeams,
  exportCurrentProject,
  loadProject,
  sectionMaterialThickness,
} from './test-helpers/product-scientific.mjs';
import { runRendererProductCases } from './renderer-product-cases.mjs';
import { sampleById } from '../site/sample-layouts.js';

await loadGeometryKernel();
const { parseLayoutFile } = await import('../site/layout-io.js');
const { pointInMulti } = await import('../site/vector-geometry.js');

const productScope = process.env.WAFERCAD_PRODUCT_SCOPE || 'all';
assert.ok(
  ['all', 'layout', 'renderer'].includes(productScope),
  `Unknown WAFERCAD_PRODUCT_SCOPE: ${productScope}`,
);
const runLayout = productScope === 'all' || productScope === 'layout';
const runRenderer = productScope === 'all' || productScope === 'renderer';
const output = resolve(process.env.WAFERCAD_REVIEW_DIR || 'test-results/product-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const cases = [];
const errors = [];
const open = (viewport, touch = false) =>
  openProductPage(browser, viewport, touch, errors);
const capture = (page, name) => captureProductReview(page, name, output, cases);

const {
  checkStickerGrouping,
  checkWorkstationShellLayout,
  checkCompactProcessLayout,
  checkPopover,
  checkSectionCollapse,
  checkAB,
  checkROI,
} = createProductLayoutChecks({ capture });

try {
  const viewportCases = runLayout
    ? [
        ['wide', { width: 1440, height: 900 }, false],
        ['medium', { width: 1000, height: 800 }, false],
        ['phone', { width: 390, height: 844 }, true],
      ]
    : [['wide', { width: 1440, height: 900 }, false]];

  for (const [name, viewport, touch] of viewportCases) {
    const { page, context } = await open(viewport, touch);
    if (runLayout) {
      if (name === 'wide') {
        assert.equal(
          await page.locator('.workstation-view-stage').getAttribute('data-view-mode'),
          'overview',
          'wide: fresh workspace must default to Overview',
        );
        assert.equal(await page.locator('#mainPanel').isVisible(), true);
        assert.equal(await page.locator('#maskPanel').isVisible(), true);
        assert.equal(await page.locator('#threePanel').isVisible(), true);
      }
      await capture(page, `${name}-empty`);
      await checkLayout(page);
      await checkAB(page, name);
      await checkSectionCollapse(page, name);
      await checkWorkstationShellLayout(page, name);
      await checkStickerGrouping(page, name);
      await ensurePrimaryViewVisible(page, 'three');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await checkPopover(page, '#threePanel .three-opacity-popover', '#threePanel');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await ensurePrimaryViewVisible(page, 'main');
      for (const [tool, captureName] of [
        ['base', 'base'],
        ['mask', 'mask'],
        ['process', 'operation'],
        ['snapshots', 'snapshots'],
        ['project', 'settings'],
      ]) {
        await openFunctionPanel(page, tool);
        await capture(page, `${name}-tab-${captureName}`);
        await checkLayout(page);
      }
      await checkCompactProcessLayout(page, name);
      await openFunctionPanel(page, 'snapshots');
      assert.equal(await page.locator('#saveSnapshotBtn').count(), 0);
      assert.equal(await page.locator('.snapshot-other-branch').count(), 0);
      await capture(page, `${name}-history-tree`);
      await checkLayout(page);

      await openFunctionPanel(page, 'mask');
      for (const sample of ['gds-alm', 'gds-basic-instances', 'oas-cblock']) {
        await page.locator('#sampleMaskSelect').selectOption(sample);
        await page.waitForFunction(
          (label) =>
            document.querySelector('#statusText').textContent.startsWith(label) &&
            document.querySelector('#statusText').textContent.includes('area objects;'),
          sampleById(sample).label,
        );
        assert.ok((await page.locator('#cellTree').textContent()).trim());
        const descriptor = sampleById(sample);
        const bytes = await readFile(new URL(`../site/${descriptor.path.slice(2)}`, import.meta.url));
        const imported = await parseLayoutFile(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          descriptor.path,
        );
        const bounds = imported.layout.bounds;
        const baseWidth =
          Math.max(1, ...['minX', 'minY', 'maxX', 'maxY'].map((key) => Math.abs(bounds[key]))) * 2.2;
        await openFunctionPanel(page, 'base');
        await page.locator('#baseWidth').fill(String(baseWidth));
        await page.locator('#applyBaseBtn').click();
        await confirmIfVisible(page);
        await openFunctionPanel(page, 'mask');
        await capture(page, `${name}-${sample}`);
        await checkLayout(page);
      }
    }
    if (runLayout) {
      for (const kind of ['step', 'trench', 'island']) {
        for (const growth of ['direct', 'conformal']) {
          const benchmark = await processBenchmark(kind, growth);
          const project = projectForBenchmark(benchmark);
          await writeFile(
            join(output, `${kind}-${growth}.wafercad`),
            JSON.stringify(project, null, 2),
          );
          await loadProject(page, project, `${kind}-${growth}`);
          await capture(page, `${name}-${kind}-${growth}`);
          await checkSectionSeams(page, project);
          await checkLayout(page);
          if (name === 'phone') {
            await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
            await capture(page, `${name}-${kind}-${growth}-section`);
          }
          if (name === 'wide') {
            const back = projectForBenchmark(await processBenchmark(kind, growth, 'back'));
            back.activeFace = 'back';
            await loadProject(page, back, `${kind}-${growth}-back`);
            const view = await page.locator('#threeHost canvas').boundingBox();
            await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.7);
            await page.mouse.down();
            await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.45, {
              steps: 12,
            });
            await page.mouse.up();
            await page.waitForTimeout(400);
            await capture(page, `${name}-${kind}-${growth}-back`);
            await checkSectionSeams(page, back);
          }
          const etched = structuredClone(project);
          const { applyOperation } = await import('../site/model.js');
          const { rectMulti } = await import('../site/vector-geometry.js');
          applyOperation(etched.model, {
            type: 'etch',
            thickness: 1.5,
            area: rectMulti(6, 8),
            face: 'front',
          });
          await writeFile(
            join(output, `${kind}-${growth}-etch.wafercad`),
            JSON.stringify(etched, null, 2),
          );
          await loadProject(page, etched, `${kind}-${growth}-etch`);
          await capture(page, `${name}-${kind}-${growth}-etch`);
          await checkSectionSeams(page, etched);
          await checkLayout(page);
          if (name === 'phone') {
            await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
            await capture(page, `${name}-${kind}-${growth}-etch-section`);
          }
        }
      }
    }
    if (runRenderer && name === 'wide') {
      await runRendererProductCases({ page, capture });
    }
    if (runLayout) {
      await ensurePrimaryViewVisible(page, 'main');
      await checkROI(page, name);
    }
    await context.close();
    console.log(`${name}: A/B, units, ROI, tabs, imports and six process views passed`);
  }
  // Breakpoint edges catch wrap/overflow changes without multiplying every dataset.
  if (runLayout) for (const width of [600, 601, 900, 901]) {
    const { page, context } = await open({ width, height: 900 });
    await checkLayout(page);
    await page.locator('#sectionControlsBtn').click();
    await capture(page, `breakpoint-${width}`);
    await checkLayout(page);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'report.json'), JSON.stringify({ cases, errors }, null, 2));
  const cards = cases
    .map(
      (name) =>
        `<figure><a href="${name}.png"><img src="${name}.png" loading="lazy"></a><figcaption>${name}</figcaption></figure>`,
    )
    .join('');
  await writeFile(
    join(output, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>WaferCAD product review</title><style>body{font:14px system-ui;margin:24px;background:#f4f6f8}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;background:white;padding:10px}img{width:100%;height:280px;object-fit:contain}figcaption{margin-top:8px}</style><h1>WaferCAD product review</h1><p>${cases.length} captures · actual Chromium/WebGL · 1440 / 1000 / 390 px plus breakpoint edges. Open each image to inspect full resolution.</p><main>${cards}</main>`,
  );
  console.log(`WaferCAD product ${productScope} regression: OK (${cases.length} captures)`);
} finally {
  await browser.close();
}
