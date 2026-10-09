import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processBenchmark, projectForBenchmark } from './process-benchmarks.mjs';
import {
  checkLayout,
  confirmIfVisible,
  ensurePrimaryViewVisible,
  openFunctionPanel,
  waitForPaint,
} from './test-helpers/product.mjs';
import { checkSectionSeams, loadProject } from './test-helpers/product-scientific.mjs';
import { sampleById } from '../site/sample-layouts.js';

export async function runProductLayoutCases({ open, capture, output, checks }) {
  const extendedReview = process.env.WAFERCAD_EXTENDED_REVIEW !== '0';
  const { parseLayoutFile } = await import('../site/layout-io.js');
  const { applyOperation } = await import('../site/model.js');
  const { rectMulti } = await import('../site/vector-geometry.js');
  const {
    checkStickerGrouping,
    checkWorkstationShellLayout,
    checkCompactProcessLayout,
    checkPopover,
    checkSectionCollapse,
    checkAB,
    checkROI,
  } = checks;

  const sampleCases = [];
  for (const sample of ['gds-alm', 'gds-basic-instances', 'oas-cblock']) {
    const descriptor = sampleById(sample);
    const bytes = await readFile(new URL(`../site/${descriptor.path.slice(2)}`, import.meta.url));
    const imported = await parseLayoutFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      descriptor.path,
    );
    const bounds = imported.layout.bounds;
    sampleCases.push({
      id: sample,
      label: descriptor.label,
      baseWidth:
        Math.max(1, ...['minX', 'minY', 'maxX', 'maxY'].map((key) => Math.abs(bounds[key]))) * 2.2,
    });
  }

  const processCases = [];
  for (const kind of ['step', 'trench', 'island']) {
    for (const growth of ['direct', 'conformal']) {
      const project = projectForBenchmark(await processBenchmark(kind, growth));
      const back = projectForBenchmark(await processBenchmark(kind, growth, 'back'));
      back.activeFace = 'back';

      const etched = structuredClone(project);
      applyOperation(etched.model, {
        type: 'etch',
        thickness: 1.5,
        area: rectMulti(6, 8),
        face: 'front',
      });

      await writeFile(join(output, `${kind}-${growth}.wafercad`), JSON.stringify(project, null, 2));
      await writeFile(
        join(output, `${kind}-${growth}-etch.wafercad`),
        JSON.stringify(etched, null, 2),
      );

      processCases.push({ kind, growth, project, back, etched });
    }
  }

  const viewportCases = extendedReview
    ? [
        ['wide', { width: 1440, height: 900 }, false],
        ['medium', { width: 1000, height: 800 }, false],
        ['phone', { width: 390, height: 844 }, true],
      ]
    : [
        ['wide', { width: 1440, height: 900 }, false],
        ['phone', { width: 390, height: 844 }, true],
      ];
  const selectedSamples = extendedReview ? sampleCases : sampleCases.slice(0, 2);
  const selectedProcessCases = extendedReview
    ? processCases
    : processCases.filter(
        ({ kind, growth }) =>
          (kind === 'step' && growth === 'direct') || (kind === 'trench' && growth === 'conformal'),
      );

  for (const [name, viewport, touch] of viewportCases) {
    const { page, context } = await open(viewport, touch);

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
    const threeDisplay = page.locator('#threePanel .three-opacity-control');
    const threeMore = page.locator('#threePanel .view-more-control');
    // When reparented under More, Display is inline content of a bounded
    // scrollable menu. Test its actual reachability, not the unscrolled
    // bounding box of an inline child.
    const inMore = await threeDisplay.evaluate((node) =>
      Boolean(node.closest('.view-overflow-secondary')),
    );
    if (inMore) await threeMore.locator(':scope > summary').click();
    await threeDisplay.locator(':scope > summary').click();
    if (inMore) {
      const menu = page.locator('#threePanel .view-menu-popover');
      await checkPopover(page, '#threePanel .view-menu-popover', '#threePanel');
      const opacity = page.locator('#threeOpacityRange');
      await opacity.scrollIntoViewIfNeeded();
      const controlBox = await opacity.boundingBox();
      const menuBox = await menu.boundingBox();
      assert.ok(controlBox && menuBox, '3D opacity is reachable in More');
      assert.ok(
        controlBox.y >= menuBox.y - 1 &&
          controlBox.y + controlBox.height <= menuBox.y + menuBox.height + 1,
        '3D opacity scrolls into the visible More menu',
      );
    } else {
      await checkPopover(page, '#threePanel .view-display-popover', '#threePanel');
    }
    await threeDisplay.locator(':scope > summary').click();
    if (await threeMore.evaluate((node) => node.open)) {
      await threeMore.locator(':scope > summary').click();
    }

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
    for (const sample of selectedSamples) {
      await page.locator('#sampleMaskSelect').selectOption(sample.id);
      await page.waitForFunction(
        (label) =>
          document.querySelector('#statusText').textContent.startsWith(label) &&
          document.querySelector('#statusText').textContent.includes('area objects;'),
        sample.label,
      );
      assert.ok((await page.locator('#cellTree').textContent()).trim());

      await openFunctionPanel(page, 'base');
      await page.locator('#baseWidth').fill(String(sample.baseWidth));
      await page.locator('#applyBaseBtn').click();
      await confirmIfVisible(page);
      await openFunctionPanel(page, 'mask');
      await capture(page, `${name}-${sample.id}`);
      await checkLayout(page);
    }

    for (const { kind, growth, project, back, etched } of selectedProcessCases) {
      await loadProject(page, project, `${kind}-${growth}`);
      await capture(page, `${name}-${kind}-${growth}`);
      await checkSectionSeams(page, project);
      await checkLayout(page);

      if (name === 'phone') {
        await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
        await capture(page, `${name}-${kind}-${growth}-section`);
      }

      if (name === 'wide') {
        await loadProject(page, back, `${kind}-${growth}-back`);
        const view = await page.locator('#threeHost canvas').boundingBox();
        await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.7);
        await page.mouse.down();
        await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.45, {
          steps: 12,
        });
        await page.mouse.up();
        await waitForPaint(page);
        await capture(page, `${name}-${kind}-${growth}-back`);
        await checkSectionSeams(page, back);
      }

      await loadProject(page, etched, `${kind}-${growth}-etch`);
      await capture(page, `${name}-${kind}-${growth}-etch`);
      await checkSectionSeams(page, etched);
      await checkLayout(page);

      if (name === 'phone') {
        await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
        await capture(page, `${name}-${kind}-${growth}-etch-section`);
      }
    }

    await ensurePrimaryViewVisible(page, 'main');
    await checkROI(page, name);
    await context.close();
    console.log(`${name}: A/B, units, ROI, tabs, imports and six process views passed`);
  }

  for (const width of extendedReview ? [600, 601, 900, 901] : [600, 601]) {
    const { page, context } = await open({ width, height: 900 });
    await checkLayout(page);
    await page.locator('#sectionControlsBtn').click();
    await capture(page, `breakpoint-${width}`);
    await checkLayout(page);
    await context.close();
  }
}
